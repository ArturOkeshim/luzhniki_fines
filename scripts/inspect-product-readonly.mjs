const productId = Number(process.argv[2]);
const apiKey = process.env.VIBECODE_API_KEY?.trim();
if (!Number.isSafeInteger(productId) || productId <= 0 || !apiKey) {
  throw new Error("Некорректные параметры проверки");
}

const response = await fetch(
  `https://vibecode.bitrix24.tech/v1/catalog-products/${productId}`,
  {
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(15_000),
  },
);
const payload = await response.json();
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const product = payload?.data ?? payload;
console.log(JSON.stringify({
  ok: true,
  mode: "production-bitrix-read-only",
  product: {
    id: product?.id ?? null,
    name: product?.name ?? null,
    active: product?.active ?? null,
    type: product?.type ?? null,
    vatId: product?.vatId ?? null,
    vatIncluded: product?.vatIncluded ?? null,
  },
  writesAttempted: 0,
}, null, 2));
