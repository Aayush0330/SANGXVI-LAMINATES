-- Phase 3: delivery proof integrity, duplicate protection and audited replacement.
-- This migration is data-preserving and intentionally does not delete proof rows.

ALTER TYPE public."SecurityEventType"
  ADD VALUE IF NOT EXISTS 'DELIVERY_PROOF_ASSISTANCE_CANCELLED';

ALTER TYPE public."SecurityEventType"
  ADD VALUE IF NOT EXISTS 'DELIVERY_PROOF_REPLACED';

ALTER TABLE public."DeliveryProof"
  ADD COLUMN IF NOT EXISTS "fileSizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "fileSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "replacedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "replacedById" TEXT,
  ADD COLUMN IF NOT EXISTS "replacedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "replacementReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DeliveryProof_replacedById_fkey'
  ) THEN
    ALTER TABLE public."DeliveryProof"
      ADD CONSTRAINT "DeliveryProof_replacedById_fkey"
      FOREIGN KEY ("replacedById")
      REFERENCES public."User"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

-- Existing databases may contain repeated proof uploads from the legacy actions.
-- Preserve all rows, keep the newest signed proof active, and archive older rows.
WITH ranked AS (
  SELECT
    proof."id",
    proof."orderId",
    proof."proofType",
    proof."uploadedAt",
    ROW_NUMBER() OVER (
      PARTITION BY proof."orderId", proof."proofType"
      ORDER BY proof."uploadedAt" DESC, proof."id" DESC
    ) AS row_number,
    MAX(proof."uploadedAt") OVER (
      PARTITION BY proof."orderId", proof."proofType"
    ) AS latest_uploaded_at
  FROM public."DeliveryProof" proof
  WHERE proof."proofType" = 'SIGNED_DUPLICATE_INVOICE'
)
UPDATE public."DeliveryProof" proof
SET
  "isActive" = FALSE,
  "replacedAt" = COALESCE(proof."replacedAt", ranked.latest_uploaded_at),
  "replacedByName" = COALESCE(proof."replacedByName", 'System Migration'),
  "replacementReason" = COALESCE(
    proof."replacementReason",
    'Legacy duplicate normalized during Phase 3 migration.'
  )
FROM ranked
WHERE proof."id" = ranked."id"
  AND ranked.row_number > 1;

WITH ranked AS (
  SELECT
    proof."id",
    ROW_NUMBER() OVER (
      PARTITION BY proof."orderId", proof."proofType"
      ORDER BY proof."uploadedAt" DESC, proof."id" DESC
    ) AS row_number
  FROM public."DeliveryProof" proof
  WHERE proof."proofType" = 'SIGNED_DUPLICATE_INVOICE'
)
UPDATE public."DeliveryProof" proof
SET "isActive" = TRUE
FROM ranked
WHERE proof."id" = ranked."id"
  AND ranked.row_number = 1;

-- Fail closed if the order claims that a signed proof exists but no proof row is available.
DO $$
DECLARE
  inconsistent_orders TEXT;
BEGIN
  SELECT string_agg(o."orderNumber", ', ' ORDER BY o."orderNumber")
  INTO inconsistent_orders
  FROM public."Order" o
  WHERE o."signedInvoiceStatus" = 'UPLOADED'
    AND NOT EXISTS (
      SELECT 1
      FROM public."DeliveryProof" proof
      WHERE proof."orderId" = o."id"
        AND proof."proofType" = 'SIGNED_DUPLICATE_INVOICE'
        AND proof."isActive" = TRUE
    );

  IF inconsistent_orders IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 3 migration stopped: signedInvoiceStatus is UPLOADED but no active proof exists for order(s): %',
      inconsistent_orders;
  END IF;
END
$$;

-- Align assistance state with the active proof mode without erasing request audit fields.
UPDATE public."Order" o
SET
  "deliveryProofAssistanceStatus" = CASE
    WHEN active_proof."uploadMode" = 'MANAGER_ASSISTED'::public."DeliveryProofUploadMode"
      THEN 'COMPLETED'::public."DeliveryProofAssistanceStatus"
    WHEN o."deliveryProofRequestedAt" IS NOT NULL
      THEN 'CANCELLED'::public."DeliveryProofAssistanceStatus"
    ELSE 'NOT_REQUESTED'::public."DeliveryProofAssistanceStatus"
  END,
  "deliveryProofCompletedById" = CASE
    WHEN active_proof."uploadMode" = 'MANAGER_ASSISTED'::public."DeliveryProofUploadMode"
      THEN active_proof."uploadedById"
    ELSE NULL
  END,
  "deliveryProofCompletedByName" = CASE
    WHEN active_proof."uploadMode" = 'MANAGER_ASSISTED'::public."DeliveryProofUploadMode"
      THEN uploader."name"
    ELSE NULL
  END,
  "deliveryProofCompletedAt" = CASE
    WHEN active_proof."uploadMode" = 'MANAGER_ASSISTED'::public."DeliveryProofUploadMode"
      THEN active_proof."uploadedAt"
    ELSE NULL
  END
FROM public."DeliveryProof" active_proof
LEFT JOIN public."User" uploader ON uploader."id" = active_proof."uploadedById"
WHERE active_proof."orderId" = o."id"
  AND active_proof."proofType" = 'SIGNED_DUPLICATE_INVOICE'
  AND active_proof."isActive" = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryProof_one_active_signed_proof_per_order_key"
  ON public."DeliveryProof"("orderId")
  WHERE "proofType" = 'SIGNED_DUPLICATE_INVOICE' AND "isActive" = TRUE;

CREATE INDEX IF NOT EXISTS "DeliveryProof_orderId_fileSha256_idx"
  ON public."DeliveryProof"("orderId", "fileSha256");

CREATE INDEX IF NOT EXISTS "DeliveryProof_replacedById_idx"
  ON public."DeliveryProof"("replacedById");

CREATE INDEX IF NOT EXISTS "DeliveryProof_isActive_idx"
  ON public."DeliveryProof"("isActive");

ALTER TABLE public."DeliveryProof"
  DROP CONSTRAINT IF EXISTS "DeliveryProof_fileSizeBytes_check";

ALTER TABLE public."DeliveryProof"
  ADD CONSTRAINT "DeliveryProof_fileSizeBytes_check"
  CHECK ("fileSizeBytes" IS NULL OR ("fileSizeBytes" > 0 AND "fileSizeBytes" <= 3145728));

ALTER TABLE public."DeliveryProof"
  DROP CONSTRAINT IF EXISTS "DeliveryProof_replacement_metadata_check";

ALTER TABLE public."DeliveryProof"
  ADD CONSTRAINT "DeliveryProof_replacement_metadata_check"
  CHECK (
    ("isActive" = TRUE AND "replacedAt" IS NULL AND "replacementReason" IS NULL)
    OR
    ("isActive" = FALSE AND "replacedAt" IS NOT NULL AND length(trim(COALESCE("replacementReason", ''))) >= 10)
  );
