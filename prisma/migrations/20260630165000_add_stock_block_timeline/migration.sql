CREATE TABLE IF NOT EXISTS "StockBlockTimeline" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "blockReason" TEXT NOT NULL DEFAULT 'ORDER_STOCK_BLOCKED',
  "releaseReason" TEXT,
  "blockedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedUntil" TIMESTAMPTZ,
  "releasedAt" TIMESTAMPTZ,
  "blockedById" TEXT,
  "blockedByName" TEXT,
  "blockedByEmail" TEXT,
  "releasedById" TEXT,
  "releasedByName" TEXT,
  "releasedByEmail" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockBlockTimeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockBlockTimeline_productId_idx"
ON "StockBlockTimeline"("productId");

CREATE INDEX IF NOT EXISTS "StockBlockTimeline_orderId_idx"
ON "StockBlockTimeline"("orderId");

CREATE INDEX IF NOT EXISTS "StockBlockTimeline_orderItemId_idx"
ON "StockBlockTimeline"("orderItemId");

CREATE INDEX IF NOT EXISTS "StockBlockTimeline_status_idx"
ON "StockBlockTimeline"("status");

CREATE INDEX IF NOT EXISTS "StockBlockTimeline_blockedAt_idx"
ON "StockBlockTimeline"("blockedAt");

CREATE INDEX IF NOT EXISTS "StockBlockTimeline_releasedAt_idx"
ON "StockBlockTimeline"("releasedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockBlockTimeline_productId_fkey'
      AND table_name = 'StockBlockTimeline'
  ) THEN
    ALTER TABLE "StockBlockTimeline"
      ADD CONSTRAINT "StockBlockTimeline_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockBlockTimeline_orderId_fkey'
      AND table_name = 'StockBlockTimeline'
  ) THEN
    ALTER TABLE "StockBlockTimeline"
      ADD CONSTRAINT "StockBlockTimeline_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockBlockTimeline_orderItemId_fkey'
      AND table_name = 'StockBlockTimeline'
  ) THEN
    ALTER TABLE "StockBlockTimeline"
      ADD CONSTRAINT "StockBlockTimeline_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockBlockTimeline_blockedById_fkey'
      AND table_name = 'StockBlockTimeline'
  ) THEN
    ALTER TABLE "StockBlockTimeline"
      ADD CONSTRAINT "StockBlockTimeline_blockedById_fkey"
      FOREIGN KEY ("blockedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StockBlockTimeline_releasedById_fkey'
      AND table_name = 'StockBlockTimeline'
  ) THEN
    ALTER TABLE "StockBlockTimeline"
      ADD CONSTRAINT "StockBlockTimeline_releasedById_fkey"
      FOREIGN KEY ("releasedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "StockBlockTimeline" (
  "id",
  "productId",
  "orderId",
  "orderItemId",
  "quantity",
  "status",
  "blockReason",
  "blockedAt",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'backfill_' || oi."id",
  oi."productId",
  oi."orderId",
  oi."id",
  oi."blockedQuantity",
  'ACTIVE',
  'BACKFILLED_FROM_EXISTING_BLOCKED_STOCK',
  oi."updatedAt",
  'Active blocked stock that existed before the stock block timeline module was added.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "OrderItem" oi
WHERE oi."blockedQuantity" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "StockBlockTimeline" sbt
    WHERE sbt."orderItemId" = oi."id"
      AND sbt."status" = 'ACTIVE'
  );
