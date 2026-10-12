import { bitrixRestRequest } from "./bitrix";
import { bitrixConfig } from "./config";
import { amountFromItem, type RawFine } from "./fines";
import { asEntityList, vibeRequest } from "./vibecode";
import {
  assertAllowedFineProductIds,
  assertBasket,
  assertBuyer,
  assertFineTotal,
  assertRequiredVat,
  buyerPropertyValues,
  fiscalLine,
  type BasketRow,
  type Buyer,
  type CatalogProduct,
  type FiscalLine,
  type OrderProperty,
  type ProductRow,
  type VatDefinition,
} from "./fiscal-data";

export async function fineFiscalLines(items: RawFine[]): Promise<FiscalLine[]> {
  const requiredVatId = bitrixConfig.requiredFineVatId;
  if (!Number.isSafeInteger(requiredVatId) || requiredVatId <= 0) {
    throw new Error("Некорректно настроен ID ставки НДС 22%");
  }
  const vat = await bitrixRestRequest<VatDefinition>("crm.vat.get", {
    id: requiredVatId,
  });
  assertRequiredVat(vat, requiredVatId);
  const vats = [vat];
  const groups = await Promise.all(
    items.map(async (item) => ({
      item,
      rows: asEntityList<ProductRow>(
        await vibeRequest(
          `/v1/items/${bitrixConfig.entityTypeId}/${Number(item.id)}/products`,
          { cache: "no-store" },
        ),
      ),
    })),
  );
  const ids = [
    ...new Set(
      groups.flatMap((group) =>
        group.rows.map((row) => Number(row.productId)),
      ),
    ),
  ];
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("В штрафе нужен товар каталога, а не произвольная строка");
  }
  assertAllowedFineProductIds(ids, bitrixConfig.fineProductIds);
  const products = await Promise.all(
    ids.map((id) =>
      vibeRequest<CatalogProduct>(`/v1/catalog-products/${id}`, {
        cache: "no-store",
      }),
    ),
  );
  return groups.flatMap(({ item, rows }) => {
    const lines = rows.map((row) => {
      const product = products.find(
        (entry) => Number(entry.id) === Number(row.productId),
      );
      if (!product) throw new Error("Товар каталога не найден");
      return fiscalLine(Number(item.id), row, product, vats);
    });
    assertFineTotal(Number(item.id), amountFromItem(item), lines);
    return lines;
  });
}

export async function assertSaleWebhookAccess(): Promise<void> {
  await bitrixRestRequest("sale.basketitem.getFieldsCatalogProduct");
}

export async function createFineBasket(
  orderId: number,
  lines: FiscalLine[],
): Promise<void> {
  for (const line of lines) {
    await bitrixRestRequest("sale.basketitem.addCatalogProduct", {
      fields: {
        orderId,
        productId: line.productId,
        quantity: line.quantity,
        currency: line.currency,
        price: line.price,
        xmlId: line.xmlId,
      },
    });
  }
}

async function orderProperties(orderId: number): Promise<OrderProperty[]> {
  const result = await bitrixRestRequest<{
    propertyValues: OrderProperty[];
  }>("sale.propertyvalue.list", {
    filter: { "=orderId": orderId },
    select: ["code", "orderPropsId", "value"],
  });
  if (!Array.isArray(result.propertyValues)) {
    throw new Error("Битрикс не вернул свойства заказа");
  }
  return result.propertyValues;
}

export async function setFineBuyer(
  orderId: number,
  buyer: Buyer,
): Promise<void> {
  const propertyValues = buyerPropertyValues(
    await orderProperties(orderId),
    buyer,
  );
  await bitrixRestRequest("sale.propertyvalue.modify", {
    fields: { order: { id: orderId, propertyValues } },
  });
  assertBuyer(await orderProperties(orderId), buyer);
}

export async function verifyFineOrder(
  orderId: number,
  lines: FiscalLine[],
  total: number,
): Promise<void> {
  const [basket, order] = await Promise.all([
    bitrixRestRequest<{ basketItems: BasketRow[] }>("sale.basketitem.list", {
      filter: { "=orderId": orderId },
      select: [
        "id",
        "productId",
        "name",
        "module",
        "type",
        "price",
        "quantity",
        "currency",
        "vatRate",
        "vatIncluded",
      ],
    }),
    bitrixRestRequest<{ order: { price: number | string } }>(
      "sale.order.get",
      { id: orderId },
    ),
  ]);
  assertBasket(basket.basketItems ?? [], lines, order.order?.price, total);
}

export async function verifyReusableFinePayment(
  paymentId: number,
  lines: FiscalLine[],
  total: number,
  buyer: Buyer,
): Promise<void> {
  const result = await bitrixRestRequest<{
    payment: {
      paid: string;
      orderId: number;
      sum: number;
      currency: string;
      paySystemId: number;
    };
  }>("sale.payment.get", { id: paymentId });
  const payment = result.payment;
  if (
    !payment ||
    payment.paid !== "N" ||
    Number(payment.sum) !== total ||
    payment.currency !== "RUB"
  ) {
    throw new Error(
      "Состояние ранее созданной оплаты изменилось. Обновите список штрафов",
    );
  }
  await Promise.all([
    verifyFineOrder(Number(payment.orderId), lines, total),
    orderProperties(Number(payment.orderId)).then((properties) =>
      assertBuyer(properties, buyer),
    ),
  ]);
}
