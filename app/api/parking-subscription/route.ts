import { NextRequest, NextResponse } from "next/server";
import { runtimeValue } from "@/app/lib/config";
import { moscowDate } from "@/app/lib/date-only";
import {
  cleanEmail,
  cleanName,
  isSuppressedNotificationEmail,
} from "@/app/lib/payment-contact";
import { isRussianPlateValid, normalizeRussianPlate } from "@/app/lib/parking-plate";
import { normalizeRussianPhone } from "@/app/lib/phone";
import { ParkingPaymentToken, signToken } from "@/app/lib/tokens";
import { checkLocalPromo, localPromoApiEnabled } from "@/app/lib/promo-demo";
import { isParkingTariffId, PARKING_TARIFFS, ParkingTariffId } from "@/app/lib/parking-tariffs";
import { findParkingDemoPromo, parkingDemoEnabled } from "@/app/lib/parking-demo";

export const dynamic = "force-dynamic";

type OrderBody = {
  lastName?: string;
  firstName?: string;
  patronymic?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  plate?: string;
  startDate?: string;
  tariffId?: ParkingTariffId;
  promoCode?: string;
  personalDataConsent?: boolean;
  offerAccepted?: boolean;
  marketingConsent?: boolean;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function promoRequest(action: "check" | "redeem", code: string) {
  if (parkingDemoEnabled()) {
    const promo = findParkingDemoPromo(code);
    if (!promo) throw new Error("Промокод не найден.");
    return {
      valid: true,
      price: promo.price,
      tariffId: promo.tariffId,
      tariffName: promo.tariffName,
    };
  }
  if (localPromoApiEnabled()) {
    const promo = await checkLocalPromo(code);
    if (!promo || promo.status !== "NEW") throw new Error("Промокод не найден или уже использован.");
    return {
      valid: true,
      price: promo.price,
      tariffId: promo.tariffId,
      tariffName: promo.tariffName,
    };
  }
  const url = runtimeValue("BITRIX_PROMO_API_URL");
  const token = runtimeValue("BITRIX_PROMO_API_TOKEN");
  if (!url || !token) throw new Error("Связь с Bitrix не настроена.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Promo-Test-Token": token },
    body: JSON.stringify({ action, code }),
    cache: "no-store",
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? "Промокод не прошёл проверку."));
  return payload;
}

async function markPaymentReady(
  apiUrl: string,
  token: string,
  dealId: number,
  paymentId: number,
  paymentUrl: string,
) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Promo-Test-Token": token },
    body: JSON.stringify({ action: "payment_ready", dealId, paymentId, paymentUrl }),
    cache: "no-store",
  });
  const rawPayload = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error("Bitrix не подтвердил подготовку оплаты.");
  }
  if (!response.ok) throw new Error(String(payload.error ?? "Не удалось отправить ссылку на оплату."));
}

export function GET() {
  const now = new Date();
  const serviceDate = moscowDate(0, now);
  return json({
    now: now.toISOString(),
    timeZone: "Europe/Moscow",
    serviceDate,
    minStartDate: moscowDate(1, now),
    maxStartDate: moscowDate(30, now),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OrderBody;
    const legacyName = cleanName(body.fullName);
    const legacyParts = legacyName.split(" ").filter(Boolean);
    const lastName = cleanName(body.lastName ?? legacyParts[0]);
    const firstName = cleanName(body.firstName ?? legacyParts[1]);
    const patronymic = cleanName(body.patronymic ?? legacyParts.slice(2).join(" "));
    const fullName = [lastName, firstName, patronymic].filter(Boolean).join(" ");
    const email = cleanEmail(body.email);
    const phone = normalizeRussianPhone(body.phone);
    const plate = normalizeRussianPlate(body.plate);
    const startDate = String(body.startDate ?? "");
    const tariffId = isParkingTariffId(body.tariffId) ? body.tariffId : null;
    const promoCode = String(body.promoCode ?? "").trim().toUpperCase().replace(/\s+/gu, "");
    const personalDataConsent = body.personalDataConsent === true;
    const offerAccepted = body.offerAccepted === true;
    const marketingConsent = body.marketingConsent === true;

    if (lastName.length < 2 || firstName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || !/^\+7\d{10}$/u.test(phone)) {
      return json({ error: "Проверьте имя, фамилию, телефон и электронную почту." }, 400);
    }
    if (isSuppressedNotificationEmail(email)) {
      return json(
        {
          error:
            "Для этого адреса отправка документов отключена. Укажите другую электронную почту.",
        },
        400,
      );
    }
    if (!isRussianPlateValid(plate)) {
      return json({ error: "Введите российский госномер в формате А000АА77 или А000АА777." }, 400);
    }
    if (!personalDataConsent || !offerAccepted) {
      return json({ error: "Подтвердите согласие на обработку персональных данных и принятие публичной оферты." }, 400);
    }
    if (!tariffId || startDate < moscowDate(1) || startDate > moscowDate(30)) {
      return json({ error: "Выберите корректный тариф и дату старта." }, 400);
    }

    const tariff = PARKING_TARIFFS[tariffId];
    if (startDate < tariff.activeFrom) {
      return json({ error: `Этот тариф действует для даты старта не ранее ${tariff.activeFrom.split("-").reverse().join(".")}.` }, 400);
    }
    if (promoCode) {
      const checked = await promoRequest("check", promoCode);
      if (
        Number(checked.price) !== tariff.price ||
        String(checked.tariffId ?? "") !== tariffId
      ) {
        return json({ error: "Промокод не соответствует выбранному тарифу." }, 409);
      }
    } else if (tariffId !== "standard") {
      return json({ error: "Для льготного тарифа нужен промокод." }, 400);
    }

    if (parkingDemoEnabled()) {
      const dealId = 900000 + (Date.now() % 99999);
      const paymentId = dealId + 100000;
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const paymentToken = await signToken({
        purpose: "parking-payment",
        dealId,
        paymentId,
        expiresAt,
        exp: expiresAt + 24 * 60 * 60 * 1000,
      } satisfies ParkingPaymentToken);
      const paymentUrl = new URL(
        `/parking-subscription?payment=success&dealId=${dealId}`,
        request.url,
      ).toString();
      return json({
        created: true,
        pending: false,
        demo: true,
        dealId,
        paymentId,
        paymentUrl,
        paymentToken,
        expiresAt,
        price: tariff.price,
      });
    }

    if (localPromoApiEnabled()) {
      return json({ error: "Локальный режим: проверка промокода выполнена, создание сделки и оплаты в Bitrix заблокировано." }, 409);
    }

    const apiUrl = runtimeValue("BITRIX_PROMO_API_URL");
    const token = runtimeValue("BITRIX_PROMO_API_TOKEN");
    if (!apiUrl || !token) return json({ error: "Связь с Bitrix не настроена." }, 503);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Promo-Test-Token": token },
      body: JSON.stringify({
        action: "order",
        fullName, email, phone, plate, startDate, tariffId,
        tariffName: tariff.name,
        rateId: tariff.rateId,
        days: tariff.days,
        limit: tariff.limit,
        accessHours: tariff.accessHours,
        eligibility: tariff.eligibility,
        activeFrom: tariff.activeFrom,
        durationDays: tariff.durationDays,
        price: tariff.price,
        promoCode,
        personalDataConsent,
        offerAccepted,
        marketingConsent,
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return json(
        { error: String(payload.error ?? "Bitrix не создал заявку.") },
        response.status,
      );
    }

    const dealId = Number(payload.dealId ?? 0);
    const paymentId = Number(payload.paymentId ?? 0);
    if (!dealId || !paymentId) {
      return json({ error: "Bitrix не создал оплату." }, 502);
    }
    const externalPaymentId = paymentId;
    const directUrl = typeof payload.paymentUrl === "string" ? payload.paymentUrl : "";
    const paymentUrl = directUrl;
    const serverExpiresAt = Number(payload.expiresAt ?? 0) * 1000;
    const expiresAt = serverExpiresAt > Date.now()
      ? serverExpiresAt
      : Date.now() + 15 * 60 * 1000;
    const paymentToken = await signToken({
      purpose: "parking-payment",
      dealId,
      paymentId: externalPaymentId,
      expiresAt,
      // Токен проверки живёт дольше самой платёжной ссылки, чтобы вкладка,
      // проснувшаяся после паузы, могла освободить просроченный резерв.
      exp: expiresAt + 24 * 60 * 60 * 1000,
    } satisfies ParkingPaymentToken);
    if (!paymentUrl) {
      return json({ created: true, pending: true, dealId, paymentId: externalPaymentId, paymentToken, expiresAt, price: tariff.price }, 202);
    }
    await markPaymentReady(apiUrl, token, dealId, externalPaymentId, paymentUrl);

    return json({ created: true, pending: false, dealId, paymentId: externalPaymentId, paymentUrl, paymentToken, expiresAt, price: tariff.price });
  } catch (error) {
    console.error("PARKING_SUBSCRIPTION_ERROR", error);
    return json({ error: error instanceof Error ? error.message : "Не удалось оформить абонемент." }, 500);
  }
}
