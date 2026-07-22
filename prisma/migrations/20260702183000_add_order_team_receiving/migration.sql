-- Add the dedicated Order Team role required for manual order receiving.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ORDER_TEAM';

-- Add manual receiving fields to the order journey.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "receivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receivingNotes" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Order_receivedById_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_receivedById_fkey"
      FOREIGN KEY ("receivedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Order_receivedById_idx" ON "Order"("receivedById");
CREATE INDEX IF NOT EXISTS "Order_receivedAt_idx" ON "Order"("receivedAt");

-- Security audit events for the receiving workflow.
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ORDER_RECEIVED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ORDER_RECEIVING_UPDATED';
