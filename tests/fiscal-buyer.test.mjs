import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  assertBuyer,
  buyerPropertyValues,
} from "../app/lib/fiscal-data.ts";

test("записывает EMAIL, PHONE и FIO покупателя в свойства заказа", () => {
  const current = [
    { code: "FIO", orderPropsId: 10, value: "" },
    { code: "EMAIL", orderPropsId: 11, value: "" },
    { code: "PHONE", orderPropsId: 12, value: "" },
    { code: "COMMENT", orderPropsId: 13, value: "сохранить" },
  ];
  const buyer = {
    fullName: "Иванов Иван",
    email: "client@example.ru",
    phone: "+79991234567",
  };
  const values = buyerPropertyValues(current, buyer);
  const written = values.map((entry, index) => ({
    code: current[index].code,
    orderPropsId: entry.orderPropsId,
    value: entry.value,
  }));

  assert.doesNotThrow(() => assertBuyer(written, buyer));
  assert.equal(
    written.find((entry) => entry.code === "EMAIL")?.value,
    buyer.email,
  );
  assert.equal(
    written.find((entry) => entry.code === "COMMENT")?.value,
    "сохранить",
  );
});

test("не создаёт платёж до записи и проверки покупателя", () => {
  const route = fs.readFileSync(
    new URL("../app/api/payment/route.ts", import.meta.url),
    "utf8",
  );
  const setBuyer = route.indexOf("await setFineBuyer(orderId, buyer)");
  const verifyOrder = route.indexOf("await verifyFineOrder(orderId, lines, total)");
  const createPayment = route.indexOf('vibeRequest("/v1/payments"');

  assert.ok(setBuyer >= 0);
  assert.ok(verifyOrder > setBuyer);
  assert.ok(createPayment > verifyOrder);
  assert.match(route, /await verifyReusableFinePayment\(paymentId, lines, total, buyer\)/u);
});

test("повторяет сверку и использует Bitrix REST при сбое VibeCode", () => {
  const portal = fs.readFileSync(
    new URL("../app/FinesPortal.tsx", import.meta.url),
    "utf8",
  );
  const workflow = fs.readFileSync(
    new URL("../app/lib/workflow.ts", import.meta.url),
    "utf8",
  );
  const fines = fs.readFileSync(
    new URL("../app/lib/fines.ts", import.meta.url),
    "utf8",
  );

  assert.match(portal, /attempt < 6/u);
  assert.match(portal, /checkoutToken, reconcile: true/u);
  assert.match(workflow, /"sale\.payment\.get"/u);
  assert.match(fines, /"crm\.item\.get"/u);
  assert.match(fines, /"crm\.item\.update"/u);
});
