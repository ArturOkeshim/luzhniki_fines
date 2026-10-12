export type ProductRow = {
  id: number | string;
  productId: number | string;
  price: number | string;
  quantity: number | string;
  measureCode?: number | string;
  measureName?: string;
};

export type CatalogProduct = {
  id: number | string;
  name: string;
  active: boolean;
  vatId: number | string | null;
  vatIncluded: boolean;
  type?: number | string;
};

export type VatDefinition = {
  ID: string | number;
  RATE: string | number | null;
  ACTIVE?: string;
};

export type FiscalLine = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  currency: "RUB";
  vatRate: number | null;
  vatIncluded: "Y";
  measureCode: number;
  measureName: string;
  xmlId: string;
  basketType: 2 | null;
};

export type Buyer = { fullName: string; email: string; phone: string };
export type OrderProperty = {
  code: string;
  orderPropsId: number | string;
  value: unknown;
};
export type BasketRow = Record<string, unknown>;

export const REQUIRED_FINE_VAT_RATE = 0.22;

export function assertRequiredVat(
  vat: VatDefinition,
  expectedId: number,
): void {
  if (
    !vat ||
    Number(vat.ID) !== expectedId ||
    vat.ACTIVE !== "Y" ||
    vat.RATE === null ||
    vat.RATE === "" ||
    Number(vat.RATE) !== 22
  ) {
    throw new Error("Ставка НДС Bitrix должна быть активной и равняться 22%");
  }
}

export function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Некорректная сумма");
  return Math.round((value + Number.EPSILON) * 100);
}

export function assertLiveTestPayment(
  selection: {
    fineIds: number[];
    total: number;
    lines: Array<Pick<FiscalLine, "productId" | "price" | "quantity">>;
  },
  expected: { fineId: number; productId: number; amount: number },
): void {
  const expectedIsValid =
    Number.isSafeInteger(expected.fineId) &&
    expected.fineId > 0 &&
    Number.isSafeInteger(expected.productId) &&
    expected.productId > 0 &&
    Number.isFinite(expected.amount) &&
    expected.amount > 0;
  const lineTotal = selection.lines.reduce(
    (sum, line) => sum + Number(line.price) * Number(line.quantity),
    0,
  );
  const matches =
    expectedIsValid &&
    selection.fineIds.length === 1 &&
    selection.fineIds[0] === expected.fineId &&
    selection.lines.length === 1 &&
    selection.lines[0].productId === expected.productId &&
    cents(selection.total) === cents(expected.amount) &&
    cents(lineTotal) === cents(expected.amount);

  if (!matches) {
    throw new Error("Разрешена только согласованная тестовая оплата на 10 ₽");
  }
}

export function assertAllowedFineProductIds(
  productIds: number[],
  allowedIds: number[],
): void {
  const allowed = new Set(allowedIds);
  if (!allowed.size || productIds.some((id) => !allowed.has(id))) {
    throw new Error("В штрафе указана неразрешённая позиция каталога");
  }
}

export function fiscalLine(
  fineId: number,
  row: ProductRow,
  product: CatalogProduct,
  vats: VatDefinition[],
): FiscalLine {
  const productId = Number(row.productId);
  const price = Number(row.price);
  const quantity = Number(row.quantity);
  if (
    !Number.isSafeInteger(productId) ||
    productId <= 0 ||
    Number(product.id) !== productId ||
    !product.active ||
    !product.name?.trim() ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      `У штрафа №${fineId} не настроен действующий товар или его стоимость`,
    );
  }
  if (Number(product.type) !== 7) {
    throw new Error(
      `Позиция штрафа №${fineId} должна быть услугой в каталоге Битрикс`,
    );
  }
  const vat = vats.find((entry) => Number(entry.ID) === Number(product.vatId));
  if (product.vatId == null || !vat) {
    throw new Error(`Для товара штрафа №${fineId} не настроен НДС`);
  }
  const vatRate =
    vat.RATE === null || vat.RATE === "" ? null : Number(vat.RATE) / 100;
  if (vatRate !== REQUIRED_FINE_VAT_RATE) {
    throw new Error(`Для услуги штрафа №${fineId} должен быть настроен НДС 22%`);
  }
  if (!product.vatIncluded) {
    throw new Error(
      `Для услуги штрафа №${fineId} НДС 22% должен быть включён в цену`,
    );
  }
  return {
    productId,
    name: product.name.trim(),
    price,
    quantity,
    currency: "RUB",
    vatRate,
    vatIncluded: "Y",
    measureCode: Number(row.measureCode) || 796,
    measureName: row.measureName || "шт",
    xmlId: `fine-${fineId}-row-${row.id}`,
    basketType: 2,
  };
}

export function assertFineTotal(
  fineId: number,
  amount: number,
  lines: FiscalLine[],
): void {
  if (
    !lines.length ||
    lines.reduce(
      (sum, line) => sum + cents(line.price * line.quantity),
      0,
    ) !== cents(amount)
  ) {
    throw new Error(
      `Сумма товаров штрафа №${fineId} не совпадает с суммой штрафа`,
    );
  }
}

export function buyerPropertyValues(current: OrderProperty[], buyer: Buyer) {
  const target = {
    FIO: buyer.fullName.trim(),
    EMAIL: buyer.email.trim(),
    PHONE: buyer.phone.trim(),
  };
  for (const [code, value] of Object.entries(target)) {
    if (!value || current.filter((entry) => entry.code === code).length !== 1) {
      throw new Error(`В заказе не настроено свойство покупателя ${code}`);
    }
  }
  return current.map((entry) => {
    const orderPropsId = Number(entry.orderPropsId);
    if (!Number.isSafeInteger(orderPropsId) || orderPropsId <= 0) {
      throw new Error("Некорректное свойство заказа");
    }
    return {
      orderPropsId,
      value: target[entry.code as keyof typeof target] ?? entry.value ?? "",
    };
  });
}

export function assertBuyer(current: OrderProperty[], buyer: Buyer): void {
  const target = {
    FIO: buyer.fullName.trim(),
    EMAIL: buyer.email.trim(),
    PHONE: buyer.phone.trim(),
  };
  for (const [code, expected] of Object.entries(target)) {
    if (
      String(
        current.find((entry) => entry.code === code)?.value ?? "",
      ).trim() !== expected
    ) {
      throw new Error(`Битрикс не подтвердил данные покупателя ${code}`);
    }
  }
}

export function assertBasket(
  actual: BasketRow[],
  expected: FiscalLine[],
  orderPrice: unknown,
  total: number,
): void {
  const remaining = [...actual];
  if (
    actual.length !== expected.length ||
    cents(Number(orderPrice)) !== cents(total)
  ) {
    throw new Error(
      "Сумма или количество товаров заказа отличаются от выбранных штрафов",
    );
  }
  for (const line of expected) {
    const index = remaining.findIndex(
      (entry) =>
        Number(entry.productId) === line.productId &&
        cents(Number(entry.price)) === cents(line.price) &&
        Number(entry.quantity) === line.quantity &&
        String(entry.currency) === line.currency,
    );
    if (index < 0) throw new Error("В заказе отсутствует выбранный товар");
    const [entry] = remaining.splice(index, 1);
    const actualType =
      entry.type === null || entry.type === "" ? null : Number(entry.type);
    if (actualType !== line.basketType || entry.module !== "catalog") {
      throw new Error(
        "В заказе не сохранились тип товара/услуги или связь с каталогом",
      );
    }
    if (String(entry.name ?? "").trim() !== line.name) {
      throw new Error(
        "Название позиции заказа отличается от выбранной позиции каталога",
      );
    }
    const actualRate =
      entry.vatRate == null || entry.vatRate === ""
        ? null
        : Number(entry.vatRate);
    if (
      actualRate !== line.vatRate ||
      !(entry.vatIncluded === "Y" || entry.vatIncluded === true)
    ) {
      throw new Error(
        "В заказе не сохранились ставка НДС или признак включения НДС в цену",
      );
    }
  }
}
