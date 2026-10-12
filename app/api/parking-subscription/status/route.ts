import { NextRequest, NextResponse } from "next/server";
import { runtimeValue } from "@/app/lib/config";
import { ParkingPaymentToken, verifyToken } from "@/app/lib/tokens";
import { parkingDemoEnabled } from "@/app/lib/parking-demo";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { paymentToken?: string };
    const checkout = await verifyToken<ParkingPaymentToken>(
      body.paymentToken ?? "",
      "parking-payment",
    );

    if (parkingDemoEnabled()) {
      return json({
        paid: true,
        expired: false,
        promoReleased: false,
        expiresAt: checkout.expiresAt,
        dealId: checkout.dealId,
        paymentId: checkout.paymentId,
        mode: "parking-demo",
      });
    }

    const apiUrl = runtimeValue("BITRIX_PROMO_API_URL");
    const token = runtimeValue("BITRIX_PROMO_API_TOKEN");
    if (!apiUrl || !token) {
      return json({ error: "Связь с Bitrix не настроена." }, 503);
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Promo-Test-Token": token,
      },
      body: JSON.stringify({
        action: "payment_status",
        dealId: checkout.dealId,
        paymentId: checkout.paymentId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return json(
        { error: String(payload.error ?? "Статус оплаты временно недоступен.") },
        response.status,
      );
    }

    return json({
      paid: payload.paid === true,
      expired: payload.expired === true,
      promoReleased: payload.promoReleased === true,
      expiresAt: checkout.expiresAt,
      dealId: checkout.dealId,
      paymentId: checkout.paymentId,
    });
  } catch {
    return json({ error: "Статус оплаты временно недоступен." }, 502);
  }
}
