import { bitrixConfig, requiredRuntimeValue } from "./config";

type PublicPaymentResponse = {
  result?: {
    payment?: {
      url?: unknown;
      shortUrl?: unknown;
    };
  };
  error?: unknown;
  error_description?: unknown;
};

type BitrixRestResponse<T> = {
  result?: T;
  error?: unknown;
  error_description?: unknown;
};

type OrderEntityLink = {
  orderId?: number | string;
  ownerId?: number | string;
  ownerTypeId?: number | string;
};

type DealItem = {
  id?: number | string;
  categoryId?: number | string;
  stageId?: string;
  contactId?: number | string;
};

type PaymentItem = {
  orderId?: number | string;
};

function webhookMethodUrl(method: string): URL {
  const rawWebhook = requiredRuntimeValue("B24_WEBHOOK_URL");
  const webhook = new URL(
    rawWebhook.endsWith("/") ? rawWebhook : `${rawWebhook}/`,
  );

  if (
    webhook.protocol !== "https:" ||
    webhook.hostname.toLowerCase() !== bitrixConfig.portalHost ||
    !/^\/rest\/\d+\/[^/]+\/$/u.test(webhook.pathname)
  ) {
    throw new Error("Некорректная настройка B24_WEBHOOK_URL");
  }

  return new URL(`${method}.json`, webhook);
}

function checkedPaymentUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== bitrixConfig.portalHost
  ) {
    throw new Error("Битрикс24 вернул некорректную ссылку на оплату");
  }
  return url.toString();
}

async function webhookRequest<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(webhookMethodUrl(method), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(params),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | BitrixRestResponse<T>
    | null;
  if (!response.ok || !payload || payload.error || payload.result === undefined) {
    const message =
      typeof payload?.error_description === "string"
        ? payload.error_description
        : `Битрикс24 не выполнил ${method}`;
    throw new Error(message);
  }
  return payload.result;
}

export async function bitrixRestRequest<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return webhookRequest<T>(method, params);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function orderDealId(orderId: number): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await webhookRequest<{ orderEntity?: OrderEntityLink[] }>(
      "crm.orderentity.list",
      {
        select: ["orderId", "ownerTypeId", "ownerId"],
        filter: { "=orderId": orderId, "=ownerTypeId": 2 },
      },
    );
    const link = (result.orderEntity ?? []).find(
      (candidate) =>
        Number(candidate.orderId) === orderId &&
        Number(candidate.ownerTypeId) === 2 &&
        Number(candidate.ownerId) > 0,
    );
    const dealId = Number(link?.ownerId ?? 0);
    if (dealId) return dealId;
    if (attempt < 4) await delay(250 * (attempt + 1));
  }
  throw new Error(`Сделка заказа №${orderId} не найдена`);
}

async function paymentOrderId(paymentId: number): Promise<number> {
  const result = await webhookRequest<{ payment?: PaymentItem }>(
    "sale.payment.get",
    { id: paymentId },
  );
  const orderId = Number(result.payment?.orderId ?? 0);
  if (!orderId) throw new Error(`Заказ платежа №${paymentId} не найден`);
  return orderId;
}

export async function moveOrderDealToFinePayments(
  orderId: number,
): Promise<number> {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("Некорректный идентификатор заказа");
  }

  const dealId = await orderDealId(orderId);
  const current = await webhookRequest<{ item?: DealItem }>("crm.item.get", {
    entityTypeId: 2,
    id: dealId,
  });
  const currentCategoryId = Number(current.item?.categoryId ?? 0);
  if (currentCategoryId === bitrixConfig.finePaymentsDealCategoryId) {
    return dealId;
  }
  if (currentCategoryId !== 0) {
    throw new Error(
      `Сделка №${dealId} уже находится в другой воронке (${currentCategoryId})`,
    );
  }
  await webhookRequest<{ item?: { id?: number } }>("crm.item.update", {
    entityTypeId: 2,
    id: dealId,
    fields: {
      categoryId: bitrixConfig.finePaymentsDealCategoryId,
      stageId: bitrixConfig.finePaymentsDealStageId,
    },
  });
  return dealId;
}

export async function movePaymentDealToFinePayments(
  paymentId: number,
): Promise<number> {
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new Error("Некорректный идентификатор платежа");
  }
  const orderId = await paymentOrderId(paymentId);
  return moveOrderDealToFinePayments(orderId);
}

export async function attachPaymentDealContact(
  paymentId: number,
  contactId: number,
): Promise<number> {
  if (!Number.isInteger(contactId) || contactId <= 0) {
    throw new Error("Некорректный идентификатор контакта");
  }
  const orderId = await paymentOrderId(paymentId);
  const dealId = await orderDealId(orderId);
  await webhookRequest<boolean>("crm.deal.update", {
    id: dealId,
    fields: { CONTACT_ID: contactId },
  });
  const deal = await webhookRequest<Record<string, unknown>>("crm.deal.get", {
    id: dealId,
  });
  if (Number(deal.CONTACT_ID ?? deal.contactId ?? 0) !== contactId) {
    throw new Error(`Контакт не привязан к сделке №${dealId}`);
  }
  return dealId;
}

export async function getPublicPaymentUrl(paymentId: number): Promise<string> {
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new Error("Некорректный идентификатор платежа");
  }

  let response: Response;
  try {
    response = await fetch(
      webhookMethodUrl("salescenter.payment.getPublicUrl"),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ id: String(paymentId) }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    return "";
  }

  if (!response.ok) return "";

  let payload: PublicPaymentResponse;
  try {
    payload = (await response.json()) as PublicPaymentResponse;
  } catch {
    return "";
  }
  if (payload.error) return "";

  const payment = payload.result?.payment;
  const paymentUrl =
    checkedPaymentUrl(payment?.shortUrl) || checkedPaymentUrl(payment?.url);
  return paymentUrl;
}
