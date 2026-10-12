const rawWebhook = process.env.B24_WEBHOOK_URL?.trim();
if (!rawWebhook) throw new Error("Не задан B24_WEBHOOK_URL");
const base = new URL(rawWebhook.endsWith("/") ? rawWebhook : `${rawWebhook}/`);
if (base.protocol !== "https:" || base.hostname !== "crm.luzhniki.ru") {
  throw new Error("Некорректный адрес вебхука");
}

async function call(method, params = {}) {
  const response = await fetch(new URL(`${method}.json`, base), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  return {
    ok: response.ok && !payload.error,
    result: payload.result ?? null,
    error: payload.error ?? null,
    description: payload.error_description ?? null,
  };
}

const [scope, profile, basketFields] = await Promise.all([
  call("scope"),
  call("profile"),
  call("sale.basketitem.getFieldsCatalogProduct"),
]);

console.log(JSON.stringify({
  ok: true,
  mode: "production-bitrix-read-only",
  webhookUserId: Number(base.pathname.split("/").filter(Boolean)[1] ?? 0),
  grantedScopes: Array.isArray(scope.result) ? scope.result : [],
  profile: profile.result && typeof profile.result === "object" ? {
    id: profile.result.ID ?? profile.result.id ?? null,
    admin: profile.result.ADMIN ?? profile.result.admin ?? null,
  } : null,
  basketCatalogMethodAvailable: basketFields.ok,
  basketCatalogError: basketFields.error,
  basketCatalogErrorDescription: basketFields.description,
  writesAttempted: 0,
}, null, 2));
