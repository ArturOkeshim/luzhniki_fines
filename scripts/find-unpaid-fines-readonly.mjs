const apiKey = process.env.VIBECODE_API_KEY?.trim();
if (!apiKey) throw new Error("Не задан VIBECODE_API_KEY");
const targetPlate = String(process.argv[2] ?? "").trim().toUpperCase();

const entityTypeId = Number(process.env.B24_ENTITY_TYPE_ID || 1112);
const categoryId = Number(process.env.B24_FINES_CATEGORY_ID || 71);
const plateField = "ufCrm_6A428CDD7BD93";
const paymentIdField = "ufCrm18PaymentId";
const allowedStages = new Set([
  `DT${entityTypeId}_${categoryId}:NEW`,
  `DT${entityTypeId}_${categoryId}:PREPARATION`,
]);

async function request(path) {
  const response = await fetch(`https://vibecode.bitrix24.tech${path}`, {
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return payload?.data ?? payload;
}

function list(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["items", "entities", "results", "result"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

const query = new URLSearchParams({
  "filter[categoryId]": String(categoryId),
  limit: "5000",
});
const items = list(await request(`/v1/items/${entityTypeId}?${query}`))
  .filter((item) => allowedStages.has(String(item.stageId ?? "")))
  .filter((item) => String(item[plateField] ?? "").trim())
  .filter((item) => !targetPlate || String(item[plateField]).trim().toUpperCase() === targetPlate)
  .slice(0, 20);

const candidates = [];
for (const item of items) {
  const products = list(await request(`/v1/items/${entityTypeId}/${item.id}/products`));
  const productIds = [...new Set(products
    .map((row) => Number(row.productId ?? row.product?.id ?? row.id ?? 0))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  candidates.push({
    fineId: Number(item.id),
    plate: String(item[plateField]).trim(),
    stageId: String(item.stageId),
    amount: Number(item.opportunity ?? 0),
    paymentId: String(item[paymentIdField] ?? ""),
    productIds,
  });
  if (candidates.some((candidate) => candidate.productIds.length)) break;
}

console.log(JSON.stringify({
  ok: true,
  mode: "production-bitrix-read-only",
  candidate: candidates.find((candidate) => candidate.productIds.length) ?? candidates[0] ?? null,
  writesAttempted: 0,
}, null, 2));
