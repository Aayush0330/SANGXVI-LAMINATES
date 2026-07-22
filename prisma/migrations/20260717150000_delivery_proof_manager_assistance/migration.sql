DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryProofAssistanceStatus') THEN
    CREATE TYPE public."DeliveryProofAssistanceStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'COMPLETED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryProofUploadMode') THEN
    CREATE TYPE public."DeliveryProofUploadMode" AS ENUM ('DRIVER_SELF', 'MANAGER_ASSISTED', 'INTERNAL_UPLOAD');
  END IF;
END $$;

ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_PROOF_ASSISTANCE_REQUESTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_PROOF_ASSISTANCE_COMPLETED';

ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS "deliveredById" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredByName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryProofAssistanceStatus" public."DeliveryProofAssistanceStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN IF NOT EXISTS "deliveryProofRequestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryProofRequestedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryProofRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryProofRequestNote" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryProofCompletedById" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryProofCompletedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryProofCompletedAt" TIMESTAMP(3);

ALTER TABLE public."DeliveryProof"
  ADD COLUMN IF NOT EXISTS "uploadMode" public."DeliveryProofUploadMode" NOT NULL DEFAULT 'DRIVER_SELF',
  ADD COLUMN IF NOT EXISTS "deliveredByName" TEXT;

DO $$ BEGIN
  ALTER TABLE public."Order" ADD CONSTRAINT "Order_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Order" ADD CONSTRAINT "Order_deliveryProofRequestedById_fkey" FOREIGN KEY ("deliveryProofRequestedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Order" ADD CONSTRAINT "Order_deliveryProofCompletedById_fkey" FOREIGN KEY ("deliveryProofCompletedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Order_deliveredById_idx" ON public."Order"("deliveredById");
CREATE INDEX IF NOT EXISTS "Order_deliveryProofAssistanceStatus_idx" ON public."Order"("deliveryProofAssistanceStatus");
CREATE INDEX IF NOT EXISTS "Order_deliveryProofRequestedById_idx" ON public."Order"("deliveryProofRequestedById");
CREATE INDEX IF NOT EXISTS "Order_deliveryProofCompletedById_idx" ON public."Order"("deliveryProofCompletedById");
CREATE INDEX IF NOT EXISTS "DeliveryProof_uploadMode_idx" ON public."DeliveryProof"("uploadMode");

UPDATE public."Order" AS orders
SET
  "deliveredById" = COALESCE(orders."deliveredById", orders."assignedDriverId"),
  "deliveredByName" = COALESCE(orders."deliveredByName", driver."name"),
  "deliveredAt" = COALESCE(orders."deliveredAt", orders."updatedAt")
FROM public."User" AS driver
WHERE orders."assignedDriverId" = driver."id"
  AND orders."status" IN ('PARTIALLY_DELIVERED', 'DELIVERED', 'INVOICE_UPLOADED');

UPDATE public."Order"
SET
  "deliveryProofAssistanceStatus" = 'COMPLETED',
  "deliveryProofCompletedAt" = COALESCE("signedInvoiceUploadedAt", "updatedAt")
WHERE "signedInvoiceStatus" = 'UPLOADED';
