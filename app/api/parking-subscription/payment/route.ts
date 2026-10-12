import { NextRequest, NextResponse } from "next/server";
import { runtimeValue } from "@/app/lib/config";
import { ParkingPaymentToken, verifyToken } from "@/app/lib/tokens";
import { parkingDemoEnabled } from "@/app/lib/parking-demo";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { paymentToken?: string };
    const checkout = await verifyToken<ParkingPaymentToken>(body.paymentToken ?? "", "parking-payment");
    if (Date.now() >= checkout.expiresAt) {
      return json({ error: "Срок оплаты истёк. Создайте новую заявку.", expired: true }, 410);
    }

    if (parkingDemoEnabled()) {
      const paymentUrl = new URL(
        `/parking-subscription?payment=success&dealId=${checkout.dealId}`,
        request.url,
      ).toString();
      return json({
        ready: true,
        paymentUrl,
        expiresAt: checkout.expiresAt,
        mode: "parking-demo",
      });
    }

    const apiUrl = runtimeValue("BITRIX_PROMO_API_URL");
    const token = runtimeValue("BITRIX_PROMO_API_TOKEN");
    if (!apiUrl || !token) return json({ error: "Связь с Bitrix не настроена." }, 503);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Promo-Test-Token": token },
      body: JSON.stringify({
        action: "payment_link",
        dealId: checkout.dealId,
        paymentId: checkout.paymentId,
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) return json({ error: String(payload.error ?? "Не удалось отправить ссылку на оплату.") }, response.status);
    return json({
      ready: payload.ready === true,
      paymentUrl: typeof payload.paymentUrl === "string" ? payload.paymentUrl : undefined,
      expiresAt: checkout.expiresAt,
    }, response.status);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Не удалось получить ссылку на оплату." }, 400);
  }
}
