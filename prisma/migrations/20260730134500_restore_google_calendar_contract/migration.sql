-- Restore the Order payment/calendar contract that already exists in the
-- migration history, backfill real order totals, and make every business
-- update eligible for one-way Google Calendar resynchronisation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderPaymentTag' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."OrderPaymentTag" AS ENUM (
      'NORMAL_PAYMENT',
      'CREDIT',
      'CASH_IN_CARRY'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderPaymentStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."OrderPaymentStatus" AS ENUM (
      'NOT_STARTED',
      'IN_PROGRESS',
      'COMPLETED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrderCalendarStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public."OrderCalendarStatus" AS ENUM (
      'NOT_SYNCED',
      'READY_TO_SYNC',
      'SYNCED',
      'SYNC_FAILED'
    );
  END IF;
END
$$;

ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS "paymentTag"
    public."OrderPaymentTag" NOT NULL DEFAULT 'NORMAL_PAYMENT',
  ADD COLUMN IF NOT EXISTS "orderAmount"
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amountReceived"
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "balanceAmount"
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentStatus"
    public."OrderPaymentStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "paymentTimelineAt"
    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderCalendarStatus"
    public."OrderCalendarStatus" NOT NULL DEFAULT 'READY_TO_SYNC',
  ADD COLUMN IF NOT EXISTS "orderCalendarEventId"
    TEXT,
  ADD COLUMN IF NOT EXISTS "orderCalendarSyncedAt"
    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderCalendarSyncError"
    TEXT;

UPDATE public."Order" AS orders
SET
  "orderAmount" = totals.total_amount,
  "amountReceived" = LEAST(
    GREATEST(COALESCE(orders."amountReceived", 0), 0),
    totals.total_amount
  ),
  "balanceAmount" = GREATEST(
    totals.total_amount - LEAST(
      GREATEST(COALESCE(orders."amountReceived", 0), 0),
      totals.total_amount
    ),
    0
  ),
  "paymentStatus" = CASE
    WHEN totals.total_amount > 0
      AND COALESCE(orders."amountReceived", 0) >= totals.total_amount
      THEN 'COMPLETED'::public."OrderPaymentStatus"
    WHEN COALESCE(orders."amountReceived", 0) > 0
      THEN 'IN_PROGRESS'::public."OrderPaymentStatus"
    ELSE 'NOT_STARTED'::public."OrderPaymentStatus"
  END,
  "orderCalendarStatus" = 'READY_TO_SYNC'::public."OrderCalendarStatus"
FROM (
  SELECT
    items."orderId",
    GREATEST(ROUND(SUM(items."lineTotal"))::INTEGER, 0) AS total_amount
  FROM public."OrderItem" AS items
  GROUP BY items."orderId"
) AS totals
WHERE orders."id" = totals."orderId";

CREATE INDEX IF NOT EXISTS "Order_paymentTag_idx"
  ON public."Order"("paymentTag");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_idx"
  ON public."Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "Order_paymentTimelineAt_idx"
  ON public."Order"("paymentTimelineAt");
CREATE INDEX IF NOT EXISTS "Order_orderCalendarStatus_idx"
  ON public."Order"("orderCalendarStatus");

CREATE OR REPLACE FUNCTION public.mark_order_calendar_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt"
    AND NEW."orderCalendarStatus" IS NOT DISTINCT FROM OLD."orderCalendarStatus"
  THEN
    NEW."orderCalendarStatus" := 'READY_TO_SYNC'::public."OrderCalendarStatus";
    NEW."orderCalendarSyncError" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_calendar_ready_on_business_update
  ON public."Order";

CREATE TRIGGER order_calendar_ready_on_business_update
BEFORE UPDATE ON public."Order"
FOR EACH ROW
EXECUTE FUNCTION public.mark_order_calendar_ready();

CREATE OR REPLACE FUNCTION public.mark_task_calendar_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt"
    AND NEW."calendarStatus" IS NOT DISTINCT FROM OLD."calendarStatus"
  THEN
    IF NEW."dueAt" IS NULL THEN
      NEW."calendarStatus" := 'NOT_SYNCED';
    ELSE
      NEW."calendarStatus" := 'READY_TO_SYNC';
    END IF;
    NEW."googleSyncError" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_calendar_ready_on_business_update
  ON public."WorkTask";

CREATE TRIGGER task_calendar_ready_on_business_update
BEFORE UPDATE ON public."WorkTask"
FOR EACH ROW
EXECUTE FUNCTION public.mark_task_calendar_ready();
