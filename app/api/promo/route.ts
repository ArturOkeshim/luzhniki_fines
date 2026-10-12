import { NextRequest, NextResponse } from "next/server";
import { runtimeValue } from "@/app/lib/config";
import { checkLocalPromo, localPromoApiEnabled, redeemLocalPromo } from "@/app/lib/promo-demo";
import { findParkingDemoPromo, parkingDemoEnabled } from "@/app/lib/parking-demo";

export const dynamic = "force-dynamic";

type PromoAction = "check" | "redeem" | "reset";
type PromoBody = { action?: PromoAction; code?: string };
function demoModeEnabled(): boolean {
  return runtimeValue("PROMO_DEMO_MODE") === "1";
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/gu, "");
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function bitrixRequest(action: "check" | "redeem", code: string) {
  const url = runtimeValue("BITRIX_PROMO_API_URL");
  const token = runtimeValue("BITRIX_PROMO_API_TOKEN");
  if (!url || !token) return null;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Promo-Test-Token": token,
    },
    body: JSON.stringify({ action, code }),
    cache: "no-store",
  });
  const payload = (await response.json()) as Record<string, unknown>;
  return { response, payload };
}

export async function GET() {
  if (parkingDemoEnabled()) {
    return json({ configured: true, mode: "parking-demo" });
  }
  if (localPromoApiEnabled()) {
    return json({ configured: true, mode: "local-api" });
  }
  const configured = Boolean(
    runtimeValue("BITRIX_PROMO_API_URL") &&
      runtimeValue("BITRIX_PROMO_API_TOKEN"),
  );

  return json({
    configured,
    mode: configured ? "bitrix" : demoModeEnabled() ? "local-demo" : "offline",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PromoBody;
    const action = body.action;
    const code = normalizeCode(body.code);

    if (!action || !["check", "redeem", "reset"].includes(action)) {
      return json({ error: "Неизвестное действие." }, 400);
    }

    if (action === "reset") {
      return json({ error: "Сброс недоступен. Создайте новый код в локальном генераторе." }, 403);
    }

    if (!code) return json({ error: "Введите промокод." }, 400);

    if (parkingDemoEnabled()) {
      const promo = findParkingDemoPromo(code);
      if (!promo) return json({ error: "Промокод не найден." }, 404);
      return json({
        valid: true,
        used: action === "redeem",
        price: promo.price,
        tariffId: promo.tariffId,
        tariffName: promo.tariffName,
        mode: "parking-demo",
      });
    }

    if (localPromoApiEnabled()) {
      const promo = await checkLocalPromo(code);
      if (!promo) return json({ error: "Промокод не найден." }, 404);
      if (promo.status !== "NEW") {
        return json({ error: promo.status === "RESERVED" ? "Промокод уже зарезервирован." : "Промокод уже использован.", used: promo.status === "USED" }, 409);
      }
      if (action === "redeem" && !(await redeemLocalPromo(code))) {
        return json({ error: "Промокод уже использован.", used: true }, 409);
      }
      return json({
        valid: true,
        used: action === "redeem",
        price: promo.price,
        tariffId: promo.tariffId,
        tariffName: promo.tariffName,
        object: promo.objectName,
        tenant: promo.tenantName,
        mode: "local-api",
      });
    }

    const upstream = await bitrixRequest(action, code);
    if (upstream) {
      return json(upstream.payload, upstream.response.status);
    }

    if (!demoModeEnabled()) {
      return json(
        { error: "Связь с сервером Bitrix ещё не настроена." },
        503,
      );
    }

    const promo = await checkLocalPromo(code);
    if (!promo) {
      return json({ error: "Промокод не найден." }, 404);
    }
    if (promo.status !== "NEW") {
      return json({ error: "Промокод уже использован.", used: true }, 409);
    }

    if (action === "redeem" && !(await redeemLocalPromo(code))) {
      return json({ error: "Промокод уже использован.", used: true }, 409);
    }

    return json({
      valid: true,
      used: action === "redeem",
      price: promo.price,
      tariffId: promo.tariffId,
      tariffName: promo.tariffName,
      object: promo.objectName,
      tenant: promo.tenantName,
      mode: "local-demo",
    });
  } catch (error) {
    console.error("PROMO_TEST_ERROR", error);
    return json({ error: "Не удалось проверить промокод." }, 500);
  }
}
