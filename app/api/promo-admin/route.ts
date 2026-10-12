import { NextRequest, NextResponse } from "next/server";
import {
  PROMO_OBJECTS,
  PROMO_TARIFFS,
  addPromoTenant,
  checkLocalPromo,
  generatePromoBatch,
  getPromoBatch,
  listPromoBatches,
  listPromoTenants,
  promoDemoEnabled,
  redeemReservedLocalPromo,
  releaseLocalPromo,
  reserveLocalPromo,
} from "@/app/lib/promo-demo";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function requireDemo(): NextResponse | null {
  return promoDemoEnabled()
    ? null
    : response({ error: "Локальный генератор отключён." }, 404);
}

function generatedBy(request: NextRequest): string {
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try {
      return decodeURIComponent(encodedName).slice(0, 255);
    } catch {
      // Fall through to the email or local label.
    }
  }
  return request.headers.get("oai-authenticated-user-email")?.slice(0, 255) || "Локальный сотрудник";
}

export async function GET(request: NextRequest) {
  const unavailable = requireDemo();
  if (unavailable) return unavailable;
  try {
    const batchId = request.nextUrl.searchParams.get("batch") ?? "";
    const [tenants, batches, selected] = await Promise.all([
      listPromoTenants(),
      listPromoBatches(20),
      batchId ? getPromoBatch(batchId) : Promise.resolve(null),
    ]);
    return response({
      objects: PROMO_OBJECTS,
      tariffs: PROMO_TARIFFS,
      tenants,
      batches,
      selected,
      user: generatedBy(request),
      mode: "local-demo",
    });
  } catch (error) {
    console.error("PROMO_ADMIN_GET_ERROR", error);
    return response({ error: "Не удалось загрузить локальную базу промокодов." }, 500);
  }
}

export async function POST(request: NextRequest) {
  const unavailable = requireDemo();
  if (unavailable) return unavailable;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "addTenant") {
      const tenant = await addPromoTenant({
        objectPrefix: String(body.objectPrefix ?? ""),
        tenantName: String(body.tenantName ?? ""),
        tariffId: String(body.tariffId ?? ""),
      });
      return response({ created: true, tenant }, 201);
    }
    if (action === "generate") {
      const result = await generatePromoBatch({
        objectPrefix: String(body.objectPrefix ?? ""),
        tenantPrefix: String(body.tenantPrefix ?? ""),
        count: Number(body.count ?? 0),
        requestId: String(body.requestId ?? ""),
        generatedBy: generatedBy(request),
      });
      return response({ generated: true, ...result }, 201);
    }
    if (action === "check") {
      const code = String(body.code ?? "");
      const promo = await checkLocalPromo(code);
      if (!promo) return response({ error: "Промокод не найден или уже использован." }, 404);
      if (promo.status !== "NEW") {
        return response({ error: promo.status === "RESERVED" ? "Промокод зарезервирован." : "Промокод уже использован.", used: promo.status === "USED" }, 409);
      }
      return response({
        valid: true,
        used: false,
        price: promo.price,
        tariffId: promo.tariffId,
        tariffName: promo.tariffName,
        object: promo.objectName,
        tenant: promo.tenantName,
      });
    }
    if (action === "reserve") {
      const reservationKey = String(body.reservationKey ?? "");
      const result = await reserveLocalPromo(String(body.code ?? ""), reservationKey, 1800);
      if (!result) return response({ error: "Промокод недоступен для резервирования." }, 409);
      return response({ reserved: true, reservationKey, reservedUntil: result.reservedUntil });
    }
    if (action === "redeem") {
      const result = await redeemReservedLocalPromo(
        String(body.code ?? ""),
        String(body.reservationKey ?? ""),
        { dealId: Number(body.dealId ?? 0) },
      );
      if (!result) return response({ error: "Промокод не зарезервирован или уже использован." }, 409);
      return response({ redeemed: true, idempotent: result.idempotent });
    }
    if (action === "release") {
      const released = await releaseLocalPromo(String(body.code ?? ""), String(body.reservationKey ?? ""));
      if (!released) return response({ error: "Резерв не найден." }, 409);
      return response({ released: true });
    }
    return response({ error: "Неизвестное действие." }, 400);
  } catch (error) {
    console.error("PROMO_ADMIN_POST_ERROR", error);
    return response({ error: error instanceof Error ? error.message : "Операция не выполнена." }, 400);
  }
}
