-- Phase 4B: persistent dealer cart.
-- Additive migration. Existing orders and local browser carts are untouched.

CREATE TABLE public."DealerCart" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealerCart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."DealerCartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "gstRateSnapshot" DECIMAL(5,2) NOT NULL,
  "priceSourceSnapshot" public."OrderItemPriceSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealerCartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealerCart_dealerId_key"
  ON public."DealerCart"("dealerId");
CREATE INDEX "DealerCart_updatedAt_idx"
  ON public."DealerCart"("updatedAt");

CREATE UNIQUE INDEX "DealerCartItem_cartId_productId_key"
  ON public."DealerCartItem"("cartId", "productId");
CREATE INDEX "DealerCartItem_cartId_idx"
  ON public."DealerCartItem"("cartId");
CREATE INDEX "DealerCartItem_productId_idx"
  ON public."DealerCartItem"("productId");
CREATE INDEX "DealerCartItem_updatedAt_idx"
  ON public."DealerCartItem"("updatedAt");

ALTER TABLE public."DealerCart"
  ADD CONSTRAINT "DealerCart_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."DealerCartItem"
  ADD CONSTRAINT "DealerCartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES public."DealerCart"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."DealerCartItem"
  ADD CONSTRAINT "DealerCartItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES public."Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."DealerCart"
  ADD CONSTRAINT "DealerCart_version_positive_check"
  CHECK ("version" > 0);

ALTER TABLE public."DealerCartItem"
  ADD CONSTRAINT "DealerCartItem_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE public."DealerCartItem"
  ADD CONSTRAINT "DealerCartItem_price_snapshot_nonnegative_check"
  CHECK (
    "unitPriceSnapshot" >= 0
    AND "gstRateSnapshot" >= 0
  );
