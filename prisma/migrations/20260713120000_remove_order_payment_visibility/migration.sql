DROP INDEX IF EXISTS public."Order_paymentTag_idx";
DROP INDEX IF EXISTS public."Order_paymentStatus_idx";
DROP INDEX IF EXISTS public."Order_paymentTimelineAt_idx";
DROP INDEX IF EXISTS public."Order_orderCalendarStatus_idx";

ALTER TABLE public."Order"
  DROP COLUMN IF EXISTS "paymentTag",
  DROP COLUMN IF EXISTS "orderAmount",
  DROP COLUMN IF EXISTS "amountReceived",
  DROP COLUMN IF EXISTS "balanceAmount",
  DROP COLUMN IF EXISTS "paymentStatus",
  DROP COLUMN IF EXISTS "paymentTimelineAt",
  DROP COLUMN IF EXISTS "orderCalendarStatus",
  DROP COLUMN IF EXISTS "orderCalendarEventId",
  DROP COLUMN IF EXISTS "orderCalendarSyncedAt",
  DROP COLUMN IF EXISTS "orderCalendarSyncError";

DROP TYPE IF EXISTS public."OrderPaymentTag";
DROP TYPE IF EXISTS public."OrderPaymentStatus";
DROP TYPE IF EXISTS public."OrderCalendarStatus";
