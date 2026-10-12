type RuntimeBindings = Record<string, string | undefined>;

let workerBindings: RuntimeBindings = {};

export function setRuntimeBindings(
  value: Record<string, unknown> | null | undefined,
): void {
  workerBindings = Object.fromEntries(
    Object.entries(value ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function bindings(): RuntimeBindings {
  return {
    ...process.env,
    ...workerBindings,
  };
}

export function runtimeValue(name: string, fallback = ""): string {
  const value = bindings()[name] ?? process.env[name] ?? fallback;
  return typeof value === "string" ? value.trim() : fallback;
}

export function requiredRuntimeValue(name: string): string {
  const value = runtimeValue(name);
  if (!value) {
    throw new Error(`Отсутствует обязательная настройка ${name}`);
  }
  return value;
}

export const bitrixConfig = {
  get fiscalGuardReadOnly() {
    return runtimeValue("FISCAL_GUARD_READ_ONLY", "N").toUpperCase() === "Y";
  },
  get liveTestOnly() {
    return runtimeValue("FISCAL_GUARD_LIVE_TEST_ONLY", "N").toUpperCase() === "Y";
  },
  get liveTestFineId() {
    return Number(runtimeValue("FISCAL_GUARD_LIVE_TEST_FINE_ID", "0"));
  },
  get liveTestProductId() {
    return Number(runtimeValue("FISCAL_GUARD_LIVE_TEST_PRODUCT_ID", "0"));
  },
  get liveTestAmount() {
    return Number(runtimeValue("FISCAL_GUARD_LIVE_TEST_AMOUNT", "0"));
  },
  get portalHost() {
    return runtimeValue("B24_PORTAL_HOST", "crm.luzhniki.ru").toLowerCase();
  },
  get entityTypeId() {
    return Number(runtimeValue("B24_ENTITY_TYPE_ID", "1112"));
  },
  get finesCategoryId() {
    return Number(runtimeValue("B24_FINES_CATEGORY_ID", "71"));
  },
  get paidCategoryId() {
    return Number(runtimeValue("B24_PAID_CATEGORY_ID", "67"));
  },
  get finePaymentsDealCategoryId() {
    return Number(runtimeValue("B24_FINE_PAYMENTS_DEAL_CATEGORY_ID", "43"));
  },
  get finePaymentsDealStageId() {
    return runtimeValue("B24_FINE_PAYMENTS_DEAL_STAGE_ID", "C43:NEW");
  },
  get personTypeId() {
    return Number(runtimeValue("B24_PERSON_TYPE_ID", "3"));
  },
  get paySystemId() {
    return Number(runtimeValue("B24_PAY_SYSTEM_ID", "24"));
  },
  get requiredFineVatId() {
    return Number(runtimeValue("B24_REQUIRED_FINE_VAT_ID", "3"));
  },
  get fineProductIds() {
    return runtimeValue("B24_FINE_PRODUCT_IDS", "4651,4652,4653,4750")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
  },
};
