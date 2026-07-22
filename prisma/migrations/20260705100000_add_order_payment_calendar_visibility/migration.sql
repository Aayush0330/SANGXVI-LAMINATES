DO $$
BEGIN
  CREATE TYPE "OrderPaymentTag" AS ENUM ('NORMAL_PAYMENT', 'CREDIT', 'CASH_IN_CARRY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OrderPaymentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OrderCalendarStatus" AS ENUM ('NOT_SYNCED', 'READY_TO_SYNC', 'SYNCED', 'SYNC_FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paymentTag" "OrderPaymentTag" NOT NULL DEFAULT 'NORMAL_PAYMENT',
  ADD COLUMN IF NOT EXISTS "orderAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amountReceived" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "paymentTimelineAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderCalendarStatus" "OrderCalendarStatus" NOT NULL DEFAULT 'READY_TO_SYNC',
  ADD COLUMN IF NOT EXISTS "orderCalendarEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "orderCalendarSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderCalendarSyncError" TEXT;

UPDATE "Order"
SET "paymentStatus" = CASE
  WHEN "orderAmount" > 0 AND "amountReceived" >= "orderAmount" THEN 'COMPLETED'::"OrderPaymentStatus"
  WHEN "amountReceived" > 0 THEN 'IN_PROGRESS'::"OrderPaymentStatus"
  ELSE 'NOT_STARTED'::"OrderPaymentStatus"
END;

CREATE INDEX IF NOT EXISTS "Order_paymentTag_idx" ON "Order"("paymentTag");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "Order_paymentTimelineAt_idx" ON "Order"("paymentTimelineAt");
CREATE INDEX IF NOT EXISTS "Order_orderCalendarStatus_idx" ON "Order"("orderCalendarStatus");
