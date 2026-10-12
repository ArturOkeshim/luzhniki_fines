import { fiscalLine, assertBasket, assertRequiredVat } from '../app/lib/fiscal-data.ts';

// Only read methods are permitted here. This script never prepares a payment.
const allowedMethods = new Set([
  'scope', 'profile', 'crm.vat.get', 'crm.item.get', 'sale.payment.get',
  'sale.basketitem.getFieldsCatalogProduct', 'sale.basketitem.list',
  'sale.order.get', 'sale.propertyvalue.list', 'sale.paysystem.list',
]);

function baseUrl() {
  const value = process.env.B24_WEBHOOK_URL?.trim();
  if (!value) throw new Error('Не задан B24_WEBHOOK_URL');
  const url = new URL(value.endsWith('/') ? value : `${value}/`);
  if (url.protocol !== 'https:' || url.hostname !== 'crm.luzhniki.ru' ||
      !/^\/rest\/\d+\/[^/]+\/$/.test(url.pathname)) {
    throw new Error('Некорректный адрес вебхука');
  }
  return url;
}

async function rest(method, params = {}) {
  if (!allowedMethods.has(method)) throw new Error('Запись запрещена в preflight');
  const response = await fetch(new URL(`${method}.json`, baseUrl()), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || data.error || data.result === undefined) {
    // Do not print URLs, credentials, server response bodies or buyer data.
    throw new Error(`${method}: ${data.error || `HTTP ${response.status}`}`);
  }
  return data.result;
}

async function product(id) {
  if (!process.env.VIBECODE_API_KEY) throw new Error('Не задан VIBECODE_API_KEY');
  const response = await fetch(`https://vibecode.bitrix24.tech/v1/catalog-products/${id}`, {
    headers: { 'X-Api-Key': process.env.VIBECODE_API_KEY.trim(), Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Товар ${id}: HTTP ${response.status}`);
  const body = await response.json();
  return body.data ?? body;
}

try {
  const ids = (process.env.B24_FINE_PRODUCT_IDS || '4651,4652,4653,4750').split(',').map(Number);
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Некорректный список товаров');
  }
  const vatId = Number(process.env.B24_REQUIRED_FINE_VAT_ID || 3);
  const [scopes, profile, vat, , paySystems] = await Promise.all([
    rest('scope'), rest('profile'), rest('crm.vat.get', { id: vatId }),
    rest('sale.basketitem.getFieldsCatalogProduct'),
    rest('sale.paysystem.list', {
      select: ['ID', 'NAME', 'ACTIVE', 'CAN_PRINT_CHECK', 'ENTITY_REGISTRY_TYPE'],
      filter: { '@ID': [24, 30] },
    }),
  ]);
  if (!Array.isArray(scopes) || !['crm', 'sale', 'salescenter'].every(s => scopes.includes(s))) {
    throw new Error('Вебхуку нужны crm, sale и salescenter');
  }
  assertRequiredVat(vat, vatId);
  if (!Array.isArray(paySystems)) throw new Error('Битрикс не вернул список платёжных систем');
  const primaryPaySystem = paySystems.find((entry) => Number(entry.ID) === 24);
  const yooKassaSbp = paySystems.find((entry) => Number(entry.ID) === 30);
  if (!primaryPaySystem || primaryPaySystem.ACTIVE !== 'Y' ||
      primaryPaySystem.CAN_PRINT_CHECK !== 'Y' || primaryPaySystem.ENTITY_REGISTRY_TYPE !== 'ORDER') {
    throw new Error('Платёжная система 24 должна быть активна и поддерживать печать чеков заказов');
  }
  if (yooKassaSbp?.ACTIVE === 'Y') {
    throw new Error('ЮKassa/СБП (платёжная система 30) должна быть отключена');
  }
  const products = [];
  for (const id of ids) {
    const p = await product(id);
    const line = fiscalLine(0, { id: 1, productId: id, price: 1, quantity: 1 }, p, [vat]);
    products.push({ id, name: line.name, type: 'услуга', vatId: p.vatId,
      vatPercent: Number(vat.RATE), vatIncluded: line.vatIncluded === 'Y' });
  }
  const report = { ok: true, version: '54.2', mode: 'read-only', writesAttempted: 0,
    webhookUserId: String(profile.ID ?? profile.id), requiredScopesAvailable: true,
    actualVat: { id: vat.ID, name: vat.NAME, percent: vat.RATE, active: vat.ACTIVE },
    paymentSystems: {
      primary: { id: Number(primaryPaySystem.ID), name: primaryPaySystem.NAME, active: true, canPrintCheck: true },
      yooKassaSbpDisabled: !yooKassaSbp || yooKassaSbp.ACTIVE !== 'Y',
    },
    products };

  const fineId = Number(process.argv.find(arg => arg.startsWith('--fine-id='))?.split('=')[1] || 0);
  if (fineId > 0) {
    const { item } = await rest('crm.item.get', { entityTypeId: 1112, id: fineId });
    const paymentId = Number(item.ufCrm18PaymentId || 0);
    report.paidTest = { fineId, categoryId: item.categoryId, stageId: item.stageId, paymentId };
    if (!paymentId) throw new Error('У тестового штрафа отсутствует ID платежа');
    const { payment } = await rest('sale.payment.get', { id: paymentId });
    const [{ order }, { basketItems }, { propertyValues }] = await Promise.all([
      rest('sale.order.get', { id: payment.orderId }),
      rest('sale.basketitem.list', { filter: { '=orderId': payment.orderId },
        select: ['id', 'productId', 'name', 'module', 'type', 'price', 'quantity', 'currency', 'vatRate', 'vatIncluded'] }),
      rest('sale.propertyvalue.list', { filter: { '=orderId': payment.orderId }, select: ['code', 'value'] }),
    ]);
    const expected = [];
    for (const row of basketItems) {
      const p = await product(Number(row.productId));
      expected.push(fiscalLine(fineId, row, p, [vat]));
    }
    assertBasket(basketItems, expected, order.price, Number(payment.sum));
    const email = String(propertyValues.find(p => p.code === 'EMAIL')?.value || '').trim().toLowerCase();
    const fineEmail = String(item.ufCrm18DriverEmail || '').trim().toLowerCase();
    Object.assign(report.paidTest, { orderId: payment.orderId, paid: payment.paid, sum: payment.sum,
      basketVerified: true, products: expected.map(l => ({ id: l.productId, name: l.name,
        price: l.price, type: 'услуга', vatPercent: l.vatRate * 100 })),
      emailPresent: !!email, emailMatchesFine: !!fineEmail && email === fineEmail,
      emailIsAdminMailbox: email === 'adminluzh@luzhniki.ru',
      receiptDelivery: 'Подтверждена пользователем; доставку письма API-проверка не доказывает' });
    if (payment.paid !== 'Y' || Number(payment.sum) !== 10 || !email || email !== fineEmail) {
      throw new Error('Результат тестовой оплаты или email не подтверждены');
    }
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, mode: 'read-only', writesAttempted: 0,
    error: error instanceof Error ? error.message : 'Ошибка проверки' }, null, 2));
  process.exitCode = 1;
}
