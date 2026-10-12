import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { bitrixConfig, requiredRuntimeValue } from "@/app/lib/config";
import { reconcilePendingFinePayments } from "@/app/lib/workflow";

export const dynamic = "force-dynamic";

function validSecret(candidate: string): boolean {
  const expected = Buffer.from(requiredRuntimeValue("APP_SESSION_SECRET"));
  const received = Buffer.from(candidate);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function POST(request: NextRequest) {
  if (!validSecret(request.headers.get("x-reconcile-secret") ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (bitrixConfig.fiscalGuardReadOnly) {
    return NextResponse.json({ skipped: true, reason: "read-only" });
  }

  try {
    const result = await reconcilePendingFinePayments();
    return NextResponse.json(result, {
      status: result.failedPlates.length ? 207 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Reconciliation failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
