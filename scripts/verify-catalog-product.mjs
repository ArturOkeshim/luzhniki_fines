import { fiscalLine, assertRequiredVat } from "../app/lib/fiscal-data.ts";

const productId = Number(process.argv[2]);
if (!Number.isSafeInteger(productId) || productId <= 0) {
  throw new Error("Укажите положительный ID товара");
}

const apiKey = process.env.VIBECODE_API_KEY?.trim();
const requiredVatId = Number(process.env.B24_REQUIRED_FINE_VAT_ID || 3);
if (!apiKey || !Number.isSafeInteger(requiredVatId) || requiredVatId <= 0) {
  throw new Error("Не заданы параметры подключения");
}

async function json(response, label) {
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object"
      ? String(payload.error_description ?? payload.error ?? "")
      : "";
    throw new Error(`${label}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
  }
  return payload;
}

const productPayload = await fetch(
  `https://vibecode.bitrix24.tech/v1/catalog-products/${productId}`,
  {
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(15_000),
  },
).then((response) => json(response, "catalog product"));

const product = productPayload?.data ?? productPayload;
if (!product) throw new Error("Битрикс не вернул карточку товара");

const webhook = new URL(process.env.B24_WEBHOOK_URL || 'https://invalid/');
if (webhook.hostname !== 'crm.luzhniki.ru' || webhook.protocol !== 'https:' ||
    !/^\/rest\/\d+\/[^/]+\/$/.test(webhook.pathname)) throw new Error('Некорректный вебхук');
const vatResponse = await fetch(new URL('crm.vat.get.json', webhook), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: requiredVatId }), signal: AbortSignal.timeout(15000),
});
const vatPayload = await vatResponse.json();
if (!vatResponse.ok || vatPayload.error) throw new Error('Не удалось прочитать ставку НДС');
assertRequiredVat(vatPayload.result, requiredVatId);

const line = fiscalLine(
  0,
  { id: 1, productId, price: 1, quantity: 1, measureCode: 796, measureName: "шт" },
  product,
  [vatPayload.result],
);

console.log(JSON.stringify({
  ok: true,
  mode: "production-bitrix-read-only",
  product: {
    id: line.productId,
    name: line.name,
    catalogType: Number(product.type),
    receiptSubject: line.basketType === 2 ? "услуга" : "неверно",
    vatRatePercent: line.vatRate * 100,
    vatIncluded: line.vatIncluded === "Y",
  },
  writesAttempted: 0,
}, null, 2));
