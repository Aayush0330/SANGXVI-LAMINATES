-- Repair databases where the order payment/calendar migration was skipped,
-- partially applied, or marked as applied while the PostgreSQL enum types
-- and columns were still missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderPaymentTag' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."OrderPaymentTag" AS ENUM (
      'NORMAL_PAYMENT',
      'CREDIT',
      'CASH_IN_CARRY'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderPaymentStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."OrderPaymentStatus" AS ENUM (
      'NOT_STARTED',
      'IN_PROGRESS',
      'COMPLETED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderCalendarStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."OrderCalendarStatus" AS ENUM (
      'NOT_SYNCED',
      'READY_TO_SYNC',
      'SYNCED',
      'SYNC_FAILED'
    );
  END IF;
END $$;

ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS "paymentTag" public."OrderPaymentTag",
  ADD COLUMN IF NOT EXISTS "orderAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "amountReceived" INTEGER,
  ADD COLUMN IF NOT EXISTS "balanceAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "paymentStatus" public."OrderPaymentStatus",
  ADD COLUMN IF NOT EXISTS "paymentTimelineAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderCalendarStatus" public."OrderCalendarStatus",
  ADD COLUMN IF NOT EXISTS "orderCalendarEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "orderCalendarSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderCalendarSyncError" TEXT;

-- Convert drifted text/varchar columns back to the Prisma enum types.
DO $$
DECLARE
  current_udt TEXT;
BEGIN
  SELECT udt_name INTO current_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'Order'
    AND column_name = 'paymentTag';

  IF current_udt IS DISTINCT FROM 'OrderPaymentTag' THEN
    ALTER TABLE public."Order" ALTER COLUMN "paymentTag" DROP DEFAULT;
    ALTER TABLE public."Order"
      ALTER COLUMN "paymentTag" TYPE public."OrderPaymentTag"
      USING (
        CASE UPPER(COALESCE("paymentTag"::TEXT, 'NORMAL_PAYMENT'))
          WHEN 'CREDIT' THEN 'CREDIT'
          WHEN 'CASH_IN_CARRY' THEN 'CASH_IN_CARRY'
          ELSE 'NORMAL_PAYMENT'
        END
      )::public."OrderPaymentTag";
  END IF;
END $$;

DO $$
DECLARE
  current_udt TEXT;
BEGIN
  SELECT udt_name INTO current_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'Order'
    AND column_name = 'paymentStatus';

  IF current_udt IS DISTINCT FROM 'OrderPaymentStatus' THEN
    ALTER TABLE public."Order" ALTER COLUMN "paymentStatus" DROP DEFAULT;
    ALTER TABLE public."Order"
      ALTER COLUMN "paymentStatus" TYPE public."OrderPaymentStatus"
      USING (
        CASE UPPER(COALESCE("paymentStatus"::TEXT, 'NOT_STARTED'))
          WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
          WHEN 'COMPLETED' THEN 'COMPLETED'
          ELSE 'NOT_STARTED'
        END
      )::public."OrderPaymentStatus";
  END IF;
END $$;

DO $$
DECLARE
  current_udt TEXT;
BEGIN
  SELECT udt_name INTO current_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'Order'
    AND column_name = 'orderCalendarStatus';

  IF current_udt IS DISTINCT FROM 'OrderCalendarStatus' THEN
    ALTER TABLE public."Order" ALTER COLUMN "orderCalendarStatus" DROP DEFAULT;
    ALTER TABLE public."Order"
      ALTER COLUMN "orderCalendarStatus" TYPE public."OrderCalendarStatus"
      USING (
        CASE UPPER(COALESCE("orderCalendarStatus"::TEXT, 'READY_TO_SYNC'))
          WHEN 'NOT_SYNCED' THEN 'NOT_SYNCED'
          WHEN 'SYNCED' THEN 'SYNCED'
          WHEN 'SYNC_FAILED' THEN 'SYNC_FAILED'
          ELSE 'READY_TO_SYNC'
        END
      )::public."OrderCalendarStatus";
  END IF;
END $$;

UPDATE public."Order"
SET
  "paymentTag" = COALESCE("paymentTag", 'NORMAL_PAYMENT'::public."OrderPaymentTag"),
  "orderAmount" = COALESCE("orderAmount", 0),
  "amountReceived" = COALESCE("amountReceived", 0),
  "balanceAmount" = COALESCE(
    "balanceAmount",
    GREATEST(COALESCE("orderAmount", 0) - COALESCE("amountReceived", 0), 0)
  ),
  "paymentStatus" = COALESCE(
    "paymentStatus",
    CASE
      WHEN COALESCE("orderAmount", 0) > 0
        AND COALESCE("amountReceived", 0) >= COALESCE("orderAmount", 0)
        THEN 'COMPLETED'::public."OrderPaymentStatus"
      WHEN COALESCE("amountReceived", 0) > 0
        THEN 'IN_PROGRESS'::public."OrderPaymentStatus"
      ELSE 'NOT_STARTED'::public."OrderPaymentStatus"
    END
  ),
  "orderCalendarStatus" = COALESCE(
    "orderCalendarStatus",
    'READY_TO_SYNC'::public."OrderCalendarStatus"
  );

ALTER TABLE public."Order"
  ALTER COLUMN "paymentTag" SET DEFAULT 'NORMAL_PAYMENT'::public."OrderPaymentTag",
  ALTER COLUMN "paymentTag" SET NOT NULL,
  ALTER COLUMN "orderAmount" SET DEFAULT 0,
  ALTER COLUMN "orderAmount" SET NOT NULL,
  ALTER COLUMN "amountReceived" SET DEFAULT 0,
  ALTER COLUMN "amountReceived" SET NOT NULL,
  ALTER COLUMN "balanceAmount" SET DEFAULT 0,
  ALTER COLUMN "balanceAmount" SET NOT NULL,
  ALTER COLUMN "paymentStatus" SET DEFAULT 'NOT_STARTED'::public."OrderPaymentStatus",
  ALTER COLUMN "paymentStatus" SET NOT NULL,
  ALTER COLUMN "orderCalendarStatus" SET DEFAULT 'READY_TO_SYNC'::public."OrderCalendarStatus",
  ALTER COLUMN "orderCalendarStatus" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Order_paymentTag_idx"
  ON public."Order"("paymentTag");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_idx"
  ON public."Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "Order_paymentTimelineAt_idx"
  ON public."Order"("paymentTimelineAt");
CREATE INDEX IF NOT EXISTS "Order_orderCalendarStatus_idx"
  ON public."Order"("orderCalendarStatus");
