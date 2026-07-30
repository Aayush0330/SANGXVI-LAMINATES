import "dotenv/config";

import { spawn } from "node:child_process";
import { Client } from "pg";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is missing.");

const source = new URL(sourceUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) {
  throw new Error("Fresh migration verification is restricted to a local PostgreSQL server.");
}

const databaseName = `phase10_fresh_${Date.now()}`;
const freshUrl = new URL(sourceUrl);
freshUrl.pathname = `/${databaseName}`;

function runMigrations() {
  return new Promise<void>((resolve, reject) => {
    const executable = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(executable, ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: freshUrl.toString() },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Fresh migration deploy failed with exit code ${code}.`));
    });
  });
}

async function expectConstraintRejection(
  client: Client,
  label: string,
  text: string,
  values: unknown[] = [],
) {
  try {
    await client.query(text, values);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23514"
    ) {
      return;
    }
    throw new Error(
      `${label} failed for an unexpected reason: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  throw new Error(`${label} was accepted, but the database should reject it.`);
}

async function verifyProductionIntegrity(client: Client) {
  const marker = Date.now().toString(36);
  const dealerId = `integrity_dealer_${marker}`;
  const categoryId = `integrity_category_${marker}`;
  const brandId = `integrity_brand_${marker}`;
  const productId = `integrity_product_${marker}`;
  const deliveryOrderId = `integrity_delivery_order_${marker}`;
  const cancelOrderId = `integrity_cancel_order_${marker}`;
  const incompleteOrderId = `integrity_incomplete_order_${marker}`;
  const deliveryItemId = `integrity_delivery_item_${marker}`;
  const cancelItemId = `integrity_cancel_item_${marker}`;
  const incompleteItemId = `integrity_incomplete_item_${marker}`;
  const supplierId = `integrity_supplier_${marker}`;
  const purchaseId = `integrity_purchase_${marker}`;
  const collectionId = `integrity_collection_${marker}`;
  const purchaseItemId = `integrity_purchase_item_${marker}`;

  await client.query(`
    INSERT INTO public."User" (
      "id","name","email","role","status","geofenceMode",
      "mustChangePassword","createdAt","updatedAt"
    ) VALUES (
      '${dealerId}','Integrity Dealer','integrity-dealer-${marker}@example.com',
      'DEALER','ACTIVE','OFFICE_REQUIRED',FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );

    INSERT INTO public."ProductCategory" (
      "id","name","isActive","createdAt","updatedAt"
    ) VALUES (
      '${categoryId}','Integrity Category ${marker}',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );

    INSERT INTO public."ProductBrand" (
      "id","name","isActive","createdAt","updatedAt"
    ) VALUES (
      '${brandId}','Integrity Brand ${marker}',TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );

    INSERT INTO public."Product" (
      "id","code","name","categoryId","brandId","stack","unit",
      "quantity","blocked","minimumStock","maximumStock","status","isActive",
      "gstRate","createdAt","updatedAt"
    ) VALUES (
      '${productId}','INT-${marker}','Integrity Product',
      '${categoryId}','${brandId}','T1','Sheets',
      20,0,2,40,'AVAILABLE',TRUE,18,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );

    INSERT INTO public."Order" (
      "id","orderNumber","dealerId","status","source","priority",
      "signedInvoiceStatus","deliveryProofAssistanceStatus","createdAt","updatedAt"
    ) VALUES
      (
        '${deliveryOrderId}','INT-DELIVERY-${marker}','${dealerId}',
        'NEW_ORDER','DEALER_PORTAL','NORMAL','NOT_UPLOADED','NOT_REQUESTED',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      ),
      (
        '${cancelOrderId}','INT-CANCEL-${marker}','${dealerId}',
        'NEW_ORDER','DEALER_PORTAL','NORMAL','NOT_UPLOADED','NOT_REQUESTED',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      ),
      (
        '${incompleteOrderId}','INT-INCOMPLETE-${marker}','${dealerId}',
        'NEW_ORDER','DEALER_PORTAL','NORMAL','NOT_UPLOADED','NOT_REQUESTED',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      );

    INSERT INTO public."OrderItem" (
      "id","orderId","productId","requestedQuantity","quantity",
      "blockedQuantity","deliveredQuantity","cancelledQuantity",
      "unitPrice","gstRate","lineSubtotal","taxAmount","lineTotal","priceSource",
      "createdAt","updatedAt"
    ) VALUES
      (
        '${deliveryItemId}','${deliveryOrderId}','${productId}',
        2,2,0,0,0,100,18,200,36,236,'DEALER_PRICE',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      ),
      (
        '${cancelItemId}','${cancelOrderId}','${productId}',
        2,2,0,0,0,100,18,200,36,236,'DEALER_PRICE',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      ),
      (
        '${incompleteItemId}','${incompleteOrderId}','${productId}',
        2,2,0,0,0,100,18,200,36,236,'DEALER_PRICE',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      );

    INSERT INTO public."Supplier" (
      "id","code","companyName","isActive","defaultLeadTimeDays",
      "createdAt","updatedAt"
    ) VALUES (
      '${supplierId}','INT-SUP-${marker}','Integrity Supplier',TRUE,0,
      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );

    INSERT INTO public."PurchaseRequest" (
      "id","requestNumber","supplierId","status","priority","estimatedTotal",
      "createdAt","updatedAt"
    ) VALUES (
      '${purchaseId}','INT-PR-${marker}','${supplierId}','SUBMITTED',
      'NORMAL',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );
  `);

  await expectConstraintRejection(
    client,
    "Partial stock reservation",
    `UPDATE public."OrderItem"
     SET "blockedQuantity"=1
     WHERE "id"='${deliveryItemId}'`,
  );

  await expectConstraintRejection(
    client,
    "Premature delivered order",
    `UPDATE public."Order"
     SET "status"='DELIVERED'
     WHERE "id"='${incompleteOrderId}'`,
  );

  await client.query(`
    UPDATE public."OrderItem"
    SET "blockedQuantity"=2
    WHERE "id"='${deliveryItemId}';

    UPDATE public."OrderItem"
    SET "blockedQuantity"=0,"deliveredQuantity"=2
    WHERE "id"='${deliveryItemId}';

    UPDATE public."Order"
    SET "status"='DELIVERED'
    WHERE "id"='${deliveryOrderId}';
  `);

  await expectConstraintRejection(
    client,
    "Delivered order resurrection",
    `UPDATE public."Order"
     SET "status"='NEW_ORDER'
     WHERE "id"='${deliveryOrderId}'`,
  );

  await expectConstraintRejection(
    client,
    "Delivered item mutation",
    `UPDATE public."OrderItem"
     SET "deliveredQuantity"=0
     WHERE "id"='${deliveryItemId}'`,
  );

  await expectConstraintRejection(
    client,
    "Delivered item deletion",
    `DELETE FROM public."OrderItem"
     WHERE "id"='${deliveryItemId}'`,
  );

  await client.query(`
    UPDATE public."OrderItem"
    SET "cancelledQuantity"=2
    WHERE "id"='${cancelItemId}';

    UPDATE public."Order"
    SET "status"='CANCELLED'
    WHERE "id"='${cancelOrderId}';
  `);

  await expectConstraintRejection(
    client,
    "Cancelled order resurrection",
    `UPDATE public."Order"
     SET "status"='NEW_ORDER'
     WHERE "id"='${cancelOrderId}'`,
  );

  await expectConstraintRejection(
    client,
    "Negative product stock",
    `UPDATE public."Product"
     SET "quantity"=-1
     WHERE "id"='${productId}'`,
  );

  await expectConstraintRejection(
    client,
    "Collection overpayment",
    `INSERT INTO public."CollectionAssignment" (
       "id","collectionNumber","dealerName","amountToCollect","amountCollected",
       "paymentMode","status","createdAt","updatedAt"
     ) VALUES (
       '${collectionId}','INT-COL-${marker}','Integrity Dealer',100,101,
       'CASH','ASSIGNED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
     )`,
  );

  await expectConstraintRejection(
    client,
    "Invalid purchase quantity progression",
    `INSERT INTO public."PurchaseRequestItem" (
       "id","purchaseRequestId","productId","requestedQuantity",
       "approvedQuantity","orderedQuantity","receivedQuantity",
       "damagedQuantity","rejectedQuantity","estimatedUnitPrice","lineTotal",
       "createdAt","updatedAt"
     ) VALUES (
       '${purchaseItemId}','${purchaseId}','${productId}',
       5,6,0,0,0,0,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
     )`,
  );
}

async function main() {
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    await runMigrations();

    const fresh = new Client({ connectionString: freshUrl.toString() });
    await fresh.connect();
    try {
      const migrationResult = await fresh.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      const tableResult = await fresh.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
      );
      const migrations = Number(migrationResult.rows[0]?.count ?? 0);
      const tables = Number(tableResult.rows[0]?.count ?? 0);
      if (migrations < 1 || tables < 2) throw new Error("Fresh database schema verification failed.");
      await verifyProductionIntegrity(fresh);
      console.log(
        `Fresh database migration verification passed: ${migrations} migrations, ${tables} tables, 9 integrity rejection checks.`,
      );
    } finally {
      await fresh.end();
    }
  } finally {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
      [databaseName],
    ).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
