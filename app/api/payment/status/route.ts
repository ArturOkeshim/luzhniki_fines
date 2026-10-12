import { NextRequest, NextResponse } from "next/server";
import { movePaymentDealToFinePayments } from "@/app/lib/bitrix";
import {
  getFineItem,
  itemPaymentId,
  itemPlate,
} from "@/app/lib/fines";
import { CheckoutToken, verifyToken } from "@/app/lib/tokens";
import { isPaymentPaid, reconcilePlate } from "@/app/lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      checkoutToken?: string;
      reconcile?: boolean;
    };
    const checkout = await verifyToken<CheckoutToken>(
      body.checkoutToken ?? "",
      "checkout",
    );
    const paid = await isPaymentPaid(checkout.paymentId);
    if (!paid) {
      return NextResponse.json(
        { paid: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!body.reconcile) {
      return NextResponse.json(
        { paid: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    await movePaymentDealToFinePayments(checkout.paymentId).catch((error) => {
      console.error(
        "FINE_PAYMENT_DEAL_ROUTING_ERROR",
        JSON.stringify({
          paymentId: checkout.paymentId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return 0;
    });

    const items = await Promise.all(
      checkout.fineIds.map(async (id) => {
        const item = await getFineItem(id);
        if (itemPlate(item) !== checkout.plate) {
          throw new Error("Карточка штрафа изменилась");
        }
        if (itemPaymentId(item) !== checkout.paymentId) {
          throw new Error("Платёж карточки штрафа изменился");
        }
        return item;
      }),
    );
    const result = await reconcilePlate(checkout.plate, items, [
      checkout.paymentId,
    ]);

    return NextResponse.json(
      {
        paid: true,
        accessRestored: result.allPaid,
        remaining: result.remaining,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Статус оплаты временно недоступен." },
      { status: 502 },
    );
  }
}
