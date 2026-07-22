-- Product master foundation: categories, brands, units and maximum-stock targets.
CREATE TABLE IF NOT EXISTS public."ProductCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ProductBrand" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductBrand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_name_key" ON public."ProductCategory"("name");
CREATE INDEX IF NOT EXISTS "ProductCategory_isActive_idx" ON public."ProductCategory"("isActive");
CREATE INDEX IF NOT EXISTS "ProductCategory_name_idx" ON public."ProductCategory"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductBrand_name_key" ON public."ProductBrand"("name");
CREATE INDEX IF NOT EXISTS "ProductBrand_isActive_idx" ON public."ProductBrand"("isActive");
CREATE INDEX IF NOT EXISTS "ProductBrand_name_idx" ON public."ProductBrand"("name");

INSERT INTO public."ProductCategory" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES ('product_category_uncategorized', 'Uncategorized', 'Default category for existing products.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO public."ProductBrand" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES ('product_brand_unbranded', 'Unbranded', 'Default brand for existing products.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE public."Product"
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "brandId" TEXT,
  ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'Sheets',
  ADD COLUMN IF NOT EXISTS "maximumStock" INTEGER NOT NULL DEFAULT 0;

UPDATE public."Product"
SET
  "categoryId" = COALESCE("categoryId", (SELECT "id" FROM public."ProductCategory" WHERE "name" = 'Uncategorized' LIMIT 1)),
  "brandId" = COALESCE("brandId", (SELECT "id" FROM public."ProductBrand" WHERE "name" = 'Unbranded' LIMIT 1)),
  "unit" = CASE WHEN BTRIM(COALESCE("unit", '')) = '' THEN 'Sheets' ELSE BTRIM("unit") END,
  "maximumStock" = GREATEST(
    COALESCE("maximumStock", 0),
    COALESCE("quantity", 0) + COALESCE("blocked", 0),
    COALESCE("minimumStock", 0) * 2,
    COALESCE("minimumStock", 0),
    1
  );

ALTER TABLE public."Product"
  ALTER COLUMN "categoryId" SET NOT NULL,
  ALTER COLUMN "brandId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON public."Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_brandId_idx" ON public."Product"("brandId");
CREATE INDEX IF NOT EXISTS "Product_status_idx" ON public."Product"("status");
CREATE INDEX IF NOT EXISTS "Product_minimumStock_idx" ON public."Product"("minimumStock");
CREATE INDEX IF NOT EXISTS "Product_maximumStock_idx" ON public."Product"("maximumStock");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_categoryId_fkey') THEN
    ALTER TABLE public."Product"
      ADD CONSTRAINT "Product_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES public."ProductCategory"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_brandId_fkey') THEN
    ALTER TABLE public."Product"
      ADD CONSTRAINT "Product_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES public."ProductBrand"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_stock_thresholds_check') THEN
    ALTER TABLE public."Product"
      ADD CONSTRAINT "Product_stock_thresholds_check"
      CHECK (
        "quantity" >= 0
        AND "blocked" >= 0
        AND "minimumStock" >= 0
        AND "maximumStock" >= "minimumStock"
        AND BTRIM("unit") <> ''
      );
  END IF;
END $$;
