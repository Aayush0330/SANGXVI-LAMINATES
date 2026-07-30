import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveOrderPayment,
  getOrderPaymentStatusLabel,
  getOrderPaymentTagLabel,
  normalizeOrderPaymentTag,
} from "../src/lib/order-payment";

test("order payment totals are normalized for Calendar events", () => {
  assert.deepEqual(
    deriveOrderPayment({ orderAmount: 1235.4, amountReceived: 235.2 }),
    {
      orderAmount: 1235,
      amountReceived: 235,
      balanceAmount: 1000,
      paymentStatus: "IN_PROGRESS",
    },
  );

  assert.deepEqual(
    deriveOrderPayment({ orderAmount: 500, amountReceived: 900 }),
    {
      orderAmount: 500,
      amountReceived: 500,
      balanceAmount: 0,
      paymentStatus: "COMPLETED",
    },
  );

  assert.deepEqual(
    deriveOrderPayment({ orderAmount: -10, amountReceived: -50 }),
    {
      orderAmount: 0,
      amountReceived: 0,
      balanceAmount: 0,
      paymentStatus: "NOT_STARTED",
    },
  );
});

test("payment type input is allow-listed and receives client-facing labels", () => {
  assert.equal(normalizeOrderPaymentTag("credit"), "CREDIT");
  assert.equal(normalizeOrderPaymentTag("CASH_IN_CARRY"), "CASH_IN_CARRY");
  assert.equal(normalizeOrderPaymentTag("unexpected"), "NORMAL_PAYMENT");
  assert.equal(getOrderPaymentTagLabel("CASH_IN_CARRY"), "Cash-and-Carry");
  assert.equal(getOrderPaymentStatusLabel("IN_PROGRESS"), "In Progress");
});
