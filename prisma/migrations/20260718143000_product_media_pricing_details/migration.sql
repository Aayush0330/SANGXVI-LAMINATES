-- Add persistent product image, GST and catalogue pricing details.
-- Existing products keep the standard 18% GST rate and nullable price/image fields.
ALTER TABLE public."Product"
  ADD COLUMN IF NOT EXISTS "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  ADD COLUMN IF NOT EXISTS "purchasePrice" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "sellingPrice" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "dealerPrice" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "imageData" BYTEA,
  ADD COLUMN IF NOT EXISTS "imageMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "imageFileName" TEXT;
