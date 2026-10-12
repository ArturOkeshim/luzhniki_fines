import { NextRequest, NextResponse } from "next/server";
import { getPublicPaymentUrl } from "@/app/lib/bitrix";
import { CheckoutToken, verifyToken } from "@/app/lib/tokens";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { checkoutToken?: string };
    const checkout = await verifyToken<CheckoutToken>(
      body.checkoutToken ?? "",
      "checkout",
    );
    const paymentUrl = await getPublicPaymentUrl(checkout.paymentId);
    if (!paymentUrl) {
      return NextResponse.json(
        { ready: false },
        {
          status: 202,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      { ready: true, paymentUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Ссылка на оплату временно недоступна." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
