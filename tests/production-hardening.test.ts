import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  getCancellationClosureQuantities,
  getItemFulfillmentSummary,
  getOrderFulfillmentSummary,
} from "../src/lib/order-fulfillment";
import {
  hashPassword,
  isStrongEnoughPassword,
  verifyPassword,
} from "../src/lib/password";
import {
  getBackupDirectory,
  isPathInside,
  resolveStoredFile,
} from "../src/lib/runtime-storage";
import { normalizeInternalHref } from "../src/lib/safe-internal-href";

test("password hashes verify only the original password", () => {
  const password = "Correct-Horse-9!";
  const hash = hashPassword(password);

  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("Wrong-Horse-9!", hash), false);
  assert.equal(verifyPassword(password, "invalid"), false);
});

test("password policy requires length and mixed character classes", () => {
  assert.equal(isStrongEnoughPassword("Strong-Pass-9!"), true);
  assert.equal(isStrongEnoughPassword("alllowercase9!"), false);
  assert.equal(isStrongEnoughPassword("NoSymbols1234"), false);
  assert.equal(isStrongEnoughPassword("Short-9!"), false);
});

test("fulfilment calculations clamp corrupt counters to requested quantity", () => {
  const item = getItemFulfillmentSummary({
    requestedQuantity: 5,
    quantity: 5,
    blockedQuantity: 99,
    deliveredQuantity: -2,
    cancelledQuantity: 9,
  });

  assert.deepEqual(item, {
    requested: 5,
    blocked: 5,
    delivered: 0,
    cancelled: 5,
    isFullyReserved: true,
    isFullyDelivered: false,
  });
});

test("cancellation closes the entire undelivered quantity", () => {
  assert.deepEqual(
    getCancellationClosureQuantities({
      requestedQuantity: 8,
      quantity: 8,
      deliveredQuantity: 3,
    }),
    {
      requested: 8,
      delivered: 3,
      cancelled: 5,
      workingQuantity: 8,
    },
  );
});

test("order totals remain deterministic across multiple items", () => {
  assert.deepEqual(
    getOrderFulfillmentSummary([
      {
        requestedQuantity: 4,
        quantity: 4,
        blockedQuantity: 4,
        deliveredQuantity: 0,
        cancelledQuantity: 0,
      },
      {
        requestedQuantity: 6,
        quantity: 6,
        blockedQuantity: 6,
        deliveredQuantity: 6,
        cancelledQuantity: 0,
      },
    ]),
    { requested: 10, blocked: 10, delivered: 6, cancelled: 0 },
  );
});

test("stored-file resolution rejects traversal and accepts descendants", () => {
  const root = path.resolve("/tmp/sanghvi-test-private");
  const inside = resolveStoredFile(root, "nested/backup.sql.gz");

  assert.equal(isPathInside(root, inside), true);
  assert.throws(
    () => resolveStoredFile(root, "../escaped.sql.gz"),
    /outside the configured private storage directory/,
  );
  assert.throws(
    () => resolveStoredFile(root, "/tmp/not-sanghvi/backup.sql.gz"),
    /outside the configured private storage directory/,
  );
});

test("notification links cannot escape the ERP origin", () => {
  assert.equal(normalizeInternalHref("/internal/orders?status=open"), "/internal/orders?status=open");
  assert.equal(normalizeInternalHref("//evil.example/path"), null);
  assert.equal(normalizeInternalHref("/\\evil.example/path"), null);
  assert.equal(normalizeInternalHref("https://evil.example/path"), null);
  assert.equal(normalizeInternalHref("/\u0000unsafe"), null);
});

test("production backup storage fails closed for missing or temporary paths", () => {
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBackupDir = process.env.BACKUP_DIR;

  try {
    mutableEnvironment.NODE_ENV = "production";
    delete mutableEnvironment.BACKUP_DIR;
    assert.throws(() => getBackupDirectory(), /required in production/);

    process.env.BACKUP_DIR = "/tmp/sanghvi-backups";
    assert.throws(() => getBackupDirectory(), /temporary storage/);

    process.env.BACKUP_DIR = "/";
    assert.throws(() => getBackupDirectory(), /filesystem root/);

    process.env.BACKUP_DIR = "/var/lib/sanghvi-erp/backups";
    assert.equal(
      getBackupDirectory(),
      path.resolve("/var/lib/sanghvi-erp/backups"),
    );
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
    else mutableEnvironment.NODE_ENV = originalNodeEnv;
    if (originalBackupDir === undefined) delete mutableEnvironment.BACKUP_DIR;
    else mutableEnvironment.BACKUP_DIR = originalBackupDir;
  }
});
