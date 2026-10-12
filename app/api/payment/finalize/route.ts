import { NextRequest, NextResponse } from "next/server";
import {
  attachPaymentDealContact,
  getPublicPaymentUrl,
} from "@/app/lib/bitrix";
import {
  FIELDS,
  getFineItem,
  itemPaymentId,
  itemPaymentUrl,
  itemPlate,
  readField,
  STAGES,
  updateFineItem,
} from "@/app/lib/fines";
import {
  cleanEmail,
  cleanName,
  isSuppressedNotificationEmail,
  upsertPaymentContact,
} from "@/app/lib/payment-contact";
import { normalizeRussianPhone } from "@/app/lib/phone";
import { CheckoutToken, verifyToken } from "@/app/lib/tokens";
import { isPaymentPaid } from "@/app/lib/workflow";

export const dynamic = "force-dynamic";

type FinalizeRequest = {
  checkoutToken?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

function textValue(value: unknown): string {
  if (Array.isArray(value)) return String(value.at(-1) ?? "").trim();
  return String(value ?? "").trim();
}

function itemContactId(item: Record<string, unknown>): number {
  return Number(item.contactId ?? item.CONTACT_ID ?? 0);
}

export async function POST(request: NextRequest) {
  let finalizeStep = "request";
  try {
    const body = (await request.json()) as FinalizeRequest;
    const firstName = cleanName(body.firstName);
    const lastName = cleanName(body.lastName);
    const phone = normalizeRussianPhone(body.phone);
    const email = cleanEmail(body.email);
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

    const checkout = await verifyToken<CheckoutToken>(
      body.checkoutToken ?? "",
      "checkout",
    );
    const fineIds = [...new Set(checkout.fineIds.map(Number))]
      .filter(Boolean)
      .sort((left, right) => left - right);
    const primaryId = Number(checkout.primaryId ?? fineIds[0] ?? 0);
    if (!fineIds.length || !fineIds.includes(primaryId)) {
      throw new Error("Состав платежа повреждён");
    }

    finalizeStep = "load";
    const [items, contactId, paymentUrl] = await Promise.all([
      Promise.all(fineIds.map((id) => getFineItem(id))),
      upsertPaymentContact({ firstName, lastName, phone, email }),
      getPublicPaymentUrl(checkout.paymentId),
    ]);
    if (!paymentUrl) throw new Error("Ссылка на оплату ещё не готова");
    if (items.some((item) => itemPlate(item) !== checkout.plate)) {
      throw new Error("Карточка штрафа изменилась");
    }

    finalizeStep = "deal-contact";
    await attachPaymentDealContact(checkout.paymentId, contactId);

    const primary = items.find((item) => Number(item.id) === primaryId);
    if (!primary) throw new Error("Основной штраф не найден");
    const alreadyFinalized =
      primary.stageId === STAGES.awaiting &&
      items.every(
        (item) =>
          itemContactId(item) === contactId &&
          itemPaymentId(item) === checkout.paymentId &&
          itemPaymentUrl(item) === paymentUrl &&
          textValue(readField(item, FIELDS.phone)) === phone &&
          textValue(readField(item, FIELDS.email)).toLowerCase() === email,
      );

    finalizeStep = "fine-identification";
    await Promise.all(
      items.map((item) =>
        updateFineItem(Number(item.id), {
          contactId,
          [FIELDS.phone]: phone,
          [FIELDS.email]: email,
          [FIELDS.paymentId]: String(checkout.paymentId),
          [FIELDS.paymentUrl]: paymentUrl,
        }),
      ),
    );

    let notificationsQueued = false;
    if (!alreadyFinalized) {
      finalizeStep = "notifications";
      const [paid, freshPrimary] = await Promise.all([
        isPaymentPaid(checkout.paymentId),
        getFineItem(primaryId),
      ]);
      const alreadyInPaidStage =
        freshPrimary.stageId === STAGES.paidInFines ||
        freshPrimary.stageId === STAGES.paidAtBuilding;
      if (!paid && !alreadyInPaidStage) {
        if (freshPrimary.stageId === STAGES.awaiting) {
          await updateFineItem(primaryId, { stageId: STAGES.prohibited });
        }
        await updateFineItem(primaryId, { stageId: STAGES.awaiting });
        notificationsQueued = true;
      }
    }

    return NextResponse.json(
      { finalized: true, notificationsQueued },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "PAYMENT_FINALIZE_ERROR",
      JSON.stringify({
        step: finalizeStep,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { error: "Уведомления будут отправлены позднее." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
