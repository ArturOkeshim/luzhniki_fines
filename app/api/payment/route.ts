import { NextRequest, NextResponse } from "next/server";
import {
  attachPaymentDealContact,
  getPublicPaymentUrl,
  moveOrderDealToFinePayments,
  movePaymentDealToFinePayments,
} from "@/app/lib/bitrix";
import { bitrixConfig } from "@/app/lib/config";
import {
  amountFromItem,
  getFineItem,
  isAllowedFineAmount,
  itemPaymentId,
  itemPaymentUrl,
  itemPlate,
  isOutstanding,
  RawFine,
  STAGES,
} from "@/app/lib/fines";
import {
  cleanEmail,
  cleanName,
  isSuppressedNotificationEmail,
  upsertPaymentContact,
} from "@/app/lib/payment-contact";
import { assertLiveTestPayment } from "@/app/lib/fiscal-data";
import {
  assertSaleWebhookAccess,
  createFineBasket,
  fineFiscalLines,
  setFineBuyer,
  verifyFineOrder,
  verifyReusableFinePayment,
} from "@/app/lib/payment-fiscal";
import { normalizeRussianPhone } from "@/app/lib/phone";
import {
  CheckoutToken,
  FineAccessToken,
  signToken,
  verifyToken,
} from "@/app/lib/tokens";
import {
  entityId,
  vibeRequest,
  VibeCodeError,
} from "@/app/lib/vibecode";

export const dynamic = "force-dynamic";

type PaymentRequest = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  plate?: string;
  itemIds?: number[];
  accessToken?: string;
};

function checkoutPayload(
  plate: string,
  fineIds: number[],
  paymentId: number,
  primaryId: number,
): CheckoutToken {
  return {
    purpose: "checkout",
    plate,
    fineIds,
    paymentId,
    primaryId,
    exp: Date.now() + 4 * 60 * 60 * 1000,
  };
}

function pendingPaymentGroup(items: RawFine[]) {
  const firstPending = items.find((item) => itemPaymentId(item) > 0);
  if (!firstPending) return null;
  const paymentId = itemPaymentId(firstPending);
  const paymentItems = items.filter(
    (item) => itemPaymentId(item) === paymentId,
  );
  const primary =
    paymentItems.find((item) => item.stageId === STAGES.awaiting) ??
    paymentItems[0];
  return {
    paymentId,
    url:
      paymentItems.map(itemPaymentUrl).find((value) => Boolean(value)) ?? "",
    primaryId: Number(primary.id),
    fineIds: paymentItems
      .map((item) => Number(item.id))
      .sort((a, b) => a - b),
  };
}

export async function POST(request: NextRequest) {
  let paymentStep = "request";
  try {
    const body = (await request.json()) as PaymentRequest;
    const firstName = cleanName(body.firstName);
    const lastName = cleanName(body.lastName);
    const phone = normalizeRussianPhone(body.phone);
    const email = cleanEmail(body.email);
    const submittedIds = [...new Set(body.itemIds ?? [])]
      .map(Number)
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (
      firstName.length < 2 ||
      lastName.length < 2 ||
      !/^\+7\d{10}$/u.test(phone) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ) {
      return NextResponse.json(
        { error: "Проверьте имя, фамилию, телефон и email." },
        { status: 400 },
      );
    }
    if (isSuppressedNotificationEmail(email)) {
      return NextResponse.json(
        {
          error:
            "Для этого адреса отправка документов отключена. Укажите другой email.",
        },
        { status: 400 },
      );
    }
    const access = await verifyToken<FineAccessToken>(
      body.accessToken ?? "",
      "fine-access",
    );
    if (
      body.plate !== access.plate ||
      !submittedIds.length ||
      submittedIds.some((id) => !access.fineIds.includes(id))
    ) {
      return NextResponse.json(
        { error: "Список штрафов изменился. Выполните поиск ещё раз." },
        { status: 409 },
      );
    }

    paymentStep = "load-fines";
    const currentItems = await Promise.all(
      access.fineIds.map((id) => getFineItem(id)),
    );
    const outstanding = currentItems.filter(
      (item) => itemPlate(item) === access.plate && isOutstanding(item),
    );
    const outstandingIds = outstanding
      .map((item) => Number(item.id))
      .sort((a, b) => a - b);
    if (submittedIds.some((id) => !outstandingIds.includes(id))) {
      return NextResponse.json(
        { error: "Список штрафов изменился. Выполните поиск ещё раз." },
        { status: 409 },
      );
    }

    const selected = outstanding.filter((item) =>
      submittedIds.includes(Number(item.id)),
    );
    const selectedPaymentIds = [
      ...new Set(
        selected.map(itemPaymentId).filter((paymentId) => paymentId > 0),
      ),
    ];
    if (
      selectedPaymentIds.length > 1 ||
      (selectedPaymentIds.length === 1 &&
        selected.some((item) => itemPaymentId(item) === 0))
    ) {
      return NextResponse.json(
        {
          error:
            "Для части выбранных штрафов уже создана отдельная оплата. Обновите страницу и оплатите их отдельными группами.",
        },
        { status: 409 },
      );
    }

    if (selectedPaymentIds.length === 1) {
      const paymentGroupIds = outstanding
        .filter((item) => itemPaymentId(item) === selectedPaymentIds[0])
        .map((item) => Number(item.id))
        .sort((a, b) => a - b);
      if (
        paymentGroupIds.length !== submittedIds.length ||
        paymentGroupIds.some((id, index) => id !== submittedIds[index])
      ) {
        return NextResponse.json(
          {
            error:
              "Эти штрафы входят в один ранее созданный платёж. Выберите всю связанную группу.",
          },
          { status: 409 },
        );
      }
    }

    const amounts = selected.map(amountFromItem);
    if (amounts.some((amount) => !isAllowedFineAmount(amount))) {
      throw new Error("Для одного из штрафов не настроена сумма");
    }
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const buyer = { fullName: `${lastName} ${firstName}`, phone, email };
    const contactIdentity = { firstName, lastName, phone, email };

    paymentStep = "fiscal-products";
    const lines = await fineFiscalLines(selected);

    if (bitrixConfig.liveTestOnly) {
      assertLiveTestPayment(
        { fineIds: submittedIds, total, lines },
        {
          fineId: bitrixConfig.liveTestFineId,
          productId: bitrixConfig.liveTestProductId,
          amount: bitrixConfig.liveTestAmount,
        },
      );
    }

    if (bitrixConfig.fiscalGuardReadOnly) {
      return NextResponse.json({
        ok: true,
        localReadOnly: true,
        message: "Локальная версия работает без создания заказа и платежа.",
        reference: "payment-local-read-only",
        fiscalPreview: lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          subject: "service",
          vatRate: line.vatRate,
          vatIncluded: line.vatIncluded,
        })),
      });
    }

    paymentStep = "sale-access";
    await assertSaleWebhookAccess();

    const existing = pendingPaymentGroup(selected);
    if (existing) {
      paymentStep = "existing-order-validation";
      await verifyReusableFinePayment(
        existing.paymentId,
        lines,
        total,
        buyer,
      );
      paymentStep = "payment-link";
      const [checkoutToken, paymentUrl] = await Promise.all([
        signToken(
          checkoutPayload(
            access.plate,
            existing.fineIds,
            existing.paymentId,
            existing.primaryId,
          ),
        ),
        existing.url
          ? Promise.resolve(existing.url)
          : getPublicPaymentUrl(existing.paymentId).catch(() => ""),
        upsertPaymentContact(contactIdentity).then(async (contactId) => {
          await movePaymentDealToFinePayments(existing.paymentId);
          return attachPaymentDealContact(existing.paymentId, contactId);
        }),
      ]);
      if (!paymentUrl) {
        return NextResponse.json(
          {
            checkoutToken,
            paymentId: existing.paymentId,
            pending: true,
            reused: true,
          },
          { status: 202 },
        );
      }
      return NextResponse.json(
        {
          paymentUrl,
          checkoutToken,
          paymentId: existing.paymentId,
          pending: false,
          reused: true,
        },
        { status: 200 },
      );
    }

    paymentStep = "order";
    const order = await vibeRequest("/v1/orders", {
      method: "POST",
      body: {
        lid: "s1",
        personTypeId: bitrixConfig.personTypeId,
        currency: "RUB",
        price: total,
        comments: `Оплата штрафов по госномеру ${access.plate}`,
      },
    });
    const orderId = entityId(order);
    if (!orderId) throw new Error("Заказ не создан");
    const dealRouting = moveOrderDealToFinePayments(orderId).catch((error) => {
      console.error(
        "FINE_PAYMENT_DEAL_ROUTING_ERROR",
        JSON.stringify({
          orderId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return 0;
    });

    paymentStep = "basket";
    await createFineBasket(orderId, lines);
    paymentStep = "buyer-properties";
    await setFineBuyer(orderId, buyer);
    paymentStep = "verify-order";
    await verifyFineOrder(orderId, lines, total);

    paymentStep = "payment";
    const payment = await vibeRequest("/v1/payments", {
      method: "POST",
      body: {
        orderId,
        paySystemId: bitrixConfig.paySystemId,
        sum: total,
        currency: "RUB",
        paid: false,
        comments: `Штрафы: ${submittedIds.join(", ")}`,
      },
    });
    const paymentId = entityId(payment);
    if (!paymentId) throw new Error("Оплата не создана");
    await dealRouting;

    paymentStep = "deal-contact";
    const contactId = await upsertPaymentContact(contactIdentity);
    await attachPaymentDealContact(paymentId, contactId);

    paymentStep = "post-payment-validation";
    await verifyReusableFinePayment(paymentId, lines, total, buyer);

    paymentStep = "payment-link";
    const primaryId = submittedIds[0];
    const [checkoutToken, paymentUrl] = await Promise.all([
      signToken(
        checkoutPayload(access.plate, submittedIds, paymentId, primaryId),
      ),
      getPublicPaymentUrl(paymentId).catch(() => ""),
    ]);

    return NextResponse.json(
      {
        ...(paymentUrl ? { paymentUrl } : {}),
        checkoutToken,
        paymentId,
        pending: !paymentUrl,
        reused: false,
      },
      { status: paymentUrl ? 200 : 202 },
    );
  } catch (error) {
    const diagnostic = {
      step: paymentStep,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      status: error instanceof VibeCodeError ? error.status : undefined,
      code: error instanceof VibeCodeError ? error.code : undefined,
    };
    console.error("PAYMENT_FLOW_ERROR", JSON.stringify(diagnostic));
    const message =
      error instanceof Error &&
      [
        "Ссылка устарела. Выполните поиск ещё раз.",
        "Ссылка недействительна.",
      ].includes(error.message)
        ? error.message
        : "Не удалось подготовить оплату. Попробуйте ещё раз.";
    return NextResponse.json(
      { error: message, reference: `payment-${paymentStep}` },
      { status: 502 },
    );
  }
}
