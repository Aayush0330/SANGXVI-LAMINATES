-- Product archive and catalogue details.
-- Existing products remain active, preserving all order and inventory history.
ALTER TABLE public."Product"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedByName" TEXT;

CREATE INDEX IF NOT EXISTS "Product_isActive_idx"
  ON public."Product"("isActive");
