import { assertRequiredVat } from "../app/lib/fiscal-data.ts";

const paymentId = Number(process.argv[2]);
if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
  throw new Error("Укажите положительный ID платежа");
}

const allowedMethods = new Set([
  "crm.vat.get",
  "sale.payment.get",
  "sale.order.get",
  "sale.basketitem.list",
  "sale.propertyvalue.list",
]);

function webhookBase() {
  const raw = process.env.B24_WEBHOOK_URL?.trim();
  if (!raw) throw new Error("Не задан B24_WEBHOOK_URL");
  const url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
  if (url.protocol !== "https:" || url.hostname !== "crm.luzhniki.ru" ||
      !/^\/rest\/\d+\/[^/]+\/$/.test(url.pathname)) {
    throw new Error("Некорректный адрес вебхука");
  }
  return url;
}

async function rest(method, params = {}) {
  if (!allowedMethods.has(method)) throw new Error(`Метод ${method} запрещён`);
  const response = await fetch(new URL(`${method}.json`, webhookBase()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(`${method}: ${payload.error ?? `HTTP ${response.status}`}`);
  }
  return payload.result;
}

async function catalogProduct(id) {
  const apiKey = process.env.VIBECODE_API_KEY?.trim();
  if (!apiKey) throw new Error("Не задан VIBECODE_API_KEY");
  const response = await fetch(`https://vibecode.bitrix24.tech/v1/catalog-products/${id}`, {
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Товар ${id}: HTTP ${response.status}`);
  return payload.data ?? payload;
}

try {
  const vatId = Number(process.env.B24_REQUIRED_FINE_VAT_ID || 3);
  const [{ payment }, vat] = await Promise.all([
    rest("sale.payment.get", { id: paymentId }),
    rest("crm.vat.get", { id: vatId }),
  ]);
  assertRequiredVat(vat, vatId);
  if (!payment || !["Y", true, 1, "1"].includes(payment.paid)) {
    throw new Error(`Платёж ${paymentId} не оплачен`);
  }
  const orderId = Number(payment.orderId);
  const [{ order }, { basketItems }, { propertyValues }] = await Promise.all([
    rest("sale.order.get", { id: orderId }),
    rest("sale.basketitem.list", {
      filter: { "=orderId": orderId },
      select: ["id", "productId", "name", "module", "type", "price", "quantity", "currency", "vatRate", "vatIncluded"],
    }),
    rest("sale.propertyvalue.list", {
      filter: { "=orderId": orderId },
      select: ["code", "value"],
    }),
  ]);
  const prop = (code) => String(propertyValues.find((row) => String(row.code).toUpperCase() === code)?.value ?? "").trim();
  const email = prop("EMAIL").toLowerCase();
  const phone = prop("PHONE");
  const fullName = prop("FIO");
  if (!email || !phone || !fullName || email === "adminluzh@luzhniki.ru") {
    throw new Error("Некорректные свойства покупателя в заказе");
  }
  if (!Array.isArray(basketItems) || basketItems.length < 1) {
    throw new Error("Корзина заказа пуста");
  }
  const lines = [];
  let basketTotal = 0;
  for (const row of basketItems) {
    const product = await catalogProduct(Number(row.productId));
    const price = Number(row.price);
    const quantity = Number(row.quantity);
    if (Number(product.type) !== 7 || Number(product.vatId) !== vatId || product.vatIncluded !== true ||
        Number(row.type) !== 2 || row.module !== "catalog" || Number(row.vatRate) !== 0.22 || row.vatIncluded !== "Y" ||
        !Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Некорректная фискальная позиция товара ${row.productId}`);
    }
    basketTotal += price * quantity;
    lines.push({
      productId: Number(row.productId),
      name: String(row.name),
      subject: "услуга",
      vatPercent: 22,
      vatIncluded: true,
      price,
      quantity,
    });
  }
  if (Math.abs(basketTotal - Number(order.price)) > 0.005 ||
      Math.abs(basketTotal - Number(payment.sum)) > 0.005) {
    throw new Error("Сумма корзины, заказа и платежа не совпадает");
  }

  const referencedFineIds = [...String(payment.comments ?? "").matchAll(/\b\d+\b/g)]
    .map((match) => Number(match[0]))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

  console.log(JSON.stringify({
    ok: true,
      version: "54.2",
    mode: "paid-order-read-only",
    writesAttempted: 0,
    payment: { id: paymentId, orderId, paid: true, sum: Number(payment.sum), referencedFineIds },
    buyer: { emailPresent: true, phonePresent: true, fullNamePresent: true, emailIsAdminMailbox: false },
    fiscal: { vatName: vat.NAME, vatPercent: Number(vat.RATE), lines },
    receiptDelivery: "Не проверяется REST API: подтверждается фактом получения письма от ОФД",
    duplicateEmailAndSms: "Сервис не ставит в очередь; отдельный обработчик Bitrix подавляет ссылку на чек только для XML_ID fine-*",
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    version: "54.2",
    mode: "paid-order-read-only",
    writesAttempted: 0,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
