-- Phase 2 policy: complete ordered quantity only.
-- This migration preserves existing orders and audit rows while removing active
-- partial-fulfilment enum values. Do not run prisma migrate reset.
--
-- Safety rule for legacy PARTIALLY_DELIVERED / PARTIALLY_CANCELLED rows:
-- the migration converts only orders whose line quantities already form a
-- closed final result (delivered and/or cancelled equals the full order).
-- Any order with a remaining quantity stops the migration so it can be reviewed
-- and explicitly classified before the enum is removed.

DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO ambiguous_count
  FROM public."Order" o
  WHERE o."status"::text IN ('PARTIALLY_DELIVERED', 'PARTIALLY_CANCELLED')
    AND EXISTS (
      SELECT 1
      FROM public."OrderItem" oi
      WHERE oi."orderId" = o."id"
        AND GREATEST(
          COALESCE(NULLIF(oi."requestedQuantity", 0), oi."quantity")
          - COALESCE(oi."deliveredQuantity", 0)
          - COALESCE(oi."cancelledQuantity", 0),
          0
        ) > 0
    );

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION
      'Partial-fulfilment cleanup stopped: % legacy order(s) still have remaining quantity. Review and classify them as DELIVERED or CANCELLED before applying this migration.',
      ambiguous_count;
  END IF;
END $$;

-- PARTIALLY_BLOCKED was never a valid full-quantity final state. Preserve the
-- blocker by moving it to the normal stock-blocked state.
UPDATE public."Order"
SET "status" = 'STOCK_BLOCKED'::public."OrderStatus"
WHERE "status" = 'PARTIALLY_BLOCKED'::public."OrderStatus";

-- Closed legacy records become one normal final state. Orders with any actual
-- delivered quantity become DELIVERED; orders closed entirely by cancellation
-- become CANCELLED. Ambiguous records were rejected by the preflight block.
UPDATE public."Order" o
SET "status" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public."OrderItem" oi
    WHERE oi."orderId" = o."id"
      AND COALESCE(oi."deliveredQuantity", 0) > 0
  )
    THEN 'DELIVERED'::public."OrderStatus"
  ELSE 'CANCELLED'::public."OrderStatus"
END
WHERE o."status"::text IN ('PARTIALLY_DELIVERED', 'PARTIALLY_CANCELLED');

-- Normalize legacy history enum values. Historical titles/descriptions remain
-- intact so the original audit narrative is not lost.
UPDATE public."OrderStatusHistory"
SET "fromStatus" = CASE "fromStatus"::text
  WHEN 'PARTIALLY_BLOCKED' THEN 'STOCK_BLOCKED'::public."OrderStatus"
  WHEN 'PARTIALLY_DELIVERED' THEN 'DELIVERED'::public."OrderStatus"
  WHEN 'PARTIALLY_CANCELLED' THEN 'CANCELLED'::public."OrderStatus"
  ELSE "fromStatus"
END
WHERE "fromStatus"::text IN (
  'PARTIALLY_BLOCKED',
  'PARTIALLY_DELIVERED',
  'PARTIALLY_CANCELLED'
);

UPDATE public."OrderStatusHistory"
SET "toStatus" = CASE "toStatus"::text
  WHEN 'PARTIALLY_BLOCKED' THEN 'STOCK_BLOCKED'::public."OrderStatus"
  WHEN 'PARTIALLY_DELIVERED' THEN 'DELIVERED'::public."OrderStatus"
  WHEN 'PARTIALLY_CANCELLED' THEN 'CANCELLED'::public."OrderStatus"
  ELSE "toStatus"
END
WHERE "toStatus"::text IN (
  'PARTIALLY_BLOCKED',
  'PARTIALLY_DELIVERED',
  'PARTIALLY_CANCELLED'
);

-- Remove the old approved/adjusted quantity meaning. The working quantity is
-- now always exactly the dealer's ordered quantity.
UPDATE public."OrderItem"
SET "requestedQuantity" = "quantity"
WHERE "requestedQuantity" IS NULL OR "requestedQuantity" <= 0;

DO $$
DECLARE
  invalid_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO invalid_item_count
  FROM public."OrderItem"
  WHERE "requestedQuantity" <= 0;

  IF invalid_item_count > 0 THEN
    RAISE EXCEPTION
      'Full-quantity cleanup stopped: % order item(s) have a non-positive ordered quantity.',
      invalid_item_count;
  END IF;
END $$;

UPDATE public."OrderItem"
SET "quantity" = "requestedQuantity"
WHERE "quantity" IS DISTINCT FROM "requestedQuantity";

-- Recreate the PostgreSQL enum without partial-fulfilment values.
ALTER TABLE public."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE public."Order" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE public."OrderStatusHistory" ALTER COLUMN "fromStatus" TYPE TEXT USING "fromStatus"::text;
ALTER TABLE public."OrderStatusHistory" ALTER COLUMN "toStatus" TYPE TEXT USING "toStatus"::text;

DROP TYPE public."OrderStatus";

CREATE TYPE public."OrderStatus" AS ENUM (
  'NEW_ORDER',
  'PENDING_TEAM_ASSIGNMENT',
  'PHYSICAL_CHECK_ASSIGNED',
  'PHYSICAL_CHECK_IN_PROGRESS',
  'PHYSICAL_CHECK_ISSUE',
  'QC_REWORK',
  'PENDING_STOCK_CHECK',
  'STOCK_CHECKED',
  'STOCK_BLOCKED',
  'BACKORDERED',
  'PENDING_QC',
  'READY_FOR_DISPATCH',
  'QC_APPROVED',
  'CANCELLATION_REQUESTED',
  'TRANSPORT_ASSIGNED',
  'ON_THE_WAY',
  'DELIVERED',
  'INVOICE_UPLOADED',
  'CANCELLED'
);

ALTER TABLE public."Order"
  ALTER COLUMN "status" TYPE public."OrderStatus"
  USING "status"::public."OrderStatus";
ALTER TABLE public."Order"
  ALTER COLUMN "status" SET DEFAULT 'NEW_ORDER'::public."OrderStatus";

ALTER TABLE public."OrderStatusHistory"
  ALTER COLUMN "fromStatus" TYPE public."OrderStatus"
  USING "fromStatus"::public."OrderStatus";
ALTER TABLE public."OrderStatusHistory"
  ALTER COLUMN "toStatus" TYPE public."OrderStatus"
  USING "toStatus"::public."OrderStatus";

-- Database-level guard: no order item can use a reduced/approved quantity.
ALTER TABLE public."OrderItem"
  DROP CONSTRAINT IF EXISTS "OrderItem_full_quantity_only";
ALTER TABLE public."OrderItem"
  ADD CONSTRAINT "OrderItem_full_quantity_only"
  CHECK (
    "requestedQuantity" > 0
    AND "quantity" = "requestedQuantity"
  );
