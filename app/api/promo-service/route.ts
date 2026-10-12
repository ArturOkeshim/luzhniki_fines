import { NextRequest, NextResponse } from "next/server";
import { runtimeValue } from "@/app/lib/config";
import {
  checkLocalPromo,
  localPromoApiEnabled,
  redeemReservedLocalPromo,
  releaseLocalPromo,
  reserveLocalPromo,
} from "@/app/lib/promo-demo";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function authorized(request: NextRequest): boolean {
  const expected = runtimeValue("PROMO_LOCAL_API_TOKEN", "local-demo-api-token");
  const header = request.headers.get("x-promo-service-token")?.trim() ?? "";
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const provided = header || (/^Bearer\s+/iu.test(authorization) ? authorization.replace(/^Bearer\s+/iu, "") : "");
  return constantTimeEqual(expected, provided);
}

export async function POST(request: NextRequest) {
  if (!localPromoApiEnabled()) return json({ ok: false, error: "not_found" }, 404);
  if (!authorized(request)) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const raw = await request.text();
    if (raw.length > 65536) return json({ ok: false, error: "invalid_request" }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const code = String(body.code ?? "");

    if (action === "check") {
      const promo = await checkLocalPromo(code);
      if (!promo || promo.status !== "NEW") return json({ ok: true, available: false });
      return json({ ok: true, available: true, promo: publicPromo(promo) });
    }

    if (action === "reserve") {
      const reservationKey = String(body.reservationKey ?? "") || randomKey();
      const result = await reserveLocalPromo(code, reservationKey, Number(body.ttlSeconds ?? 1800));
      if (!result) return json({ ok: true, reserved: false });
      return json({
        ok: true,
        reserved: true,
        reservationKey,
        reservedUntil: result.reservedUntil,
        promo: publicPromo(result.promo),
      });
    }

    if (action === "redeem") {
      const result = await redeemReservedLocalPromo(
        code,
        String(body.reservationKey ?? ""),
        {
          dealId: Number(body.dealId ?? 0),
          orderId: Number(body.orderId ?? 0),
          paymentId: Number(body.paymentId ?? 0),
        },
      );
      if (!result) return json({ ok: true, redeemed: false });
      return json({
        ok: true,
        redeemed: true,
        idempotent: result.idempotent,
        promo: publicPromo(result.promo),
      });
    }

    if (action === "release") {
      const released = await releaseLocalPromo(code, String(body.reservationKey ?? ""));
      return json({ ok: true, released });
    }

    return json({ ok: false, error: "unknown_action" }, 422);
  } catch (error) {
    console.error("LOCAL_PROMO_SERVICE_ERROR", error);
    return json({ ok: false, error: "invalid_request" }, 422);
  }
}

function publicPromo(promo: Awaited<ReturnType<typeof checkLocalPromo>> & object) {
  return {
    code: promo.promoCode,
    status: promo.status,
    object: promo.objectName,
    objectPrefix: promo.objectPrefix,
    tenant: promo.tenantName,
    tenantPrefix: promo.tenantPrefix,
    tariffId: promo.tariffId,
    tariffName: promo.tariffName,
    price: promo.price,
    dealId: promo.dealId,
  };
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(expected: string, provided: string): boolean {
  const length = Math.max(expected.length, provided.length);
  let difference = expected.length ^ provided.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (provided.charCodeAt(index) || 0);
  }
  return difference === 0;
}
