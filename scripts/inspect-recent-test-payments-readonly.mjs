const apiKey = process.env.VIBECODE_API_KEY?.trim();
if (!apiKey) throw new Error("Не задан VIBECODE_API_KEY");

async function request(path) {
  const response = await fetch(`https://vibecode.bitrix24.tech${path}`, {
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return payload?.data ?? payload;
}

function list(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["orders", "payments", "items", "entities", "results", "result"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

const [ordersData, paymentsData] = await Promise.all([
  request("/v1/orders?order%5Bid%5D=DESC&limit=100"),
  request("/v1/payments?order%5Bid%5D=DESC&limit=100"),
]);
const orders = list(ordersData);
const payments = list(paymentsData);
const testOrders = orders
  .filter((row) => Number(row.price ?? row.PRICE ?? row.sum ?? row.SUM) === 10)
  .map((row) => ({
    id: Number(row.id ?? row.ID),
    price: Number(row.price ?? row.PRICE ?? row.sum ?? row.SUM),
    dateInsert: String(row.dateInsert ?? row.DATE_INSERT ?? row.dateCreate ?? row.DATE_CREATE ?? ""),
    comments: String(row.comments ?? row.COMMENTS ?? ""),
  }));
const testOrderIds = new Set(testOrders.map((row) => row.id));
const testPayments = payments
  .filter((row) => Number(row.sum ?? row.SUM) === 10 || testOrderIds.has(Number(row.orderId ?? row.ORDER_ID)))
  .map((row) => ({
    id: Number(row.id ?? row.ID),
    orderId: Number(row.orderId ?? row.ORDER_ID),
    sum: Number(row.sum ?? row.SUM),
    paid: row.paid ?? row.PAID ?? null,
    datePaid: String(row.datePaid ?? row.DATE_PAID ?? ""),
  }));

console.log(JSON.stringify({
  ok: true,
  mode: "production-bitrix-read-only",
  testOrders,
  testPayments,
  writesAttempted: 0,
}, null, 2));
