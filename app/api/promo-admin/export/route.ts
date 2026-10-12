import { NextRequest } from "next/server";
import { createPromoWorkbook } from "@/app/lib/promo-xlsx";
import { getPromoBatch, markPromoBatchExported, promoDemoEnabled } from "@/app/lib/promo-demo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!promoDemoEnabled()) return new Response("Not found", { status: 404 });
  try {
    const batchId = (request.nextUrl.searchParams.get("batch") ?? "").trim().toUpperCase();
    const result = await getPromoBatch(batchId);
    if (result.codes.length === 0) return new Response("Партия не найдена.", { status: 404 });
    const workbook = createPromoWorkbook(result.codes);
    await markPromoBatchExported(batchId);
    return new Response(workbook, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="promocodes-${batchId}.xlsx"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PROMO_EXPORT_ERROR", error);
    return new Response("Не удалось сформировать Excel-файл.", { status: 500 });
  }
}
