-- Phase 6: supplier directory, product-supplier mapping, reorder suggestions,
-- purchase approvals, transit tracking and auditable stock receiving.
-- No existing product, order, stock block or audit data is deleted.

CREATE TYPE public."PurchaseRequestStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED'
);

CREATE TYPE public."PurchaseRequestPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_CREATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_ARCHIVED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_REACTIVATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PRODUCT_SUPPLIER_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_CREATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_SUBMITTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_APPROVED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_REJECTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_ORDERED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_IN_TRANSIT';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_CANCELLED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PURCHASE_STOCK_RECEIVED';

CREATE TABLE public."Supplier" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "gstNumber" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "paymentTerms" TEXT,
  "defaultLeadTimeDays" INTEGER NOT NULL DEFAULT 0,
  "internalNotes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "archivedById" TEXT,
  "archivedByName" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Supplier_code_nonempty" CHECK (LENGTH(BTRIM("code")) > 0),
  CONSTRAINT "Supplier_companyName_nonempty" CHECK (LENGTH(BTRIM("companyName")) > 0),
  CONSTRAINT "Supplier_leadTime_nonnegative" CHECK ("defaultLeadTimeDays" >= 0)
);

CREATE UNIQUE INDEX "Supplier_code_key" ON public."Supplier"("code");
CREATE UNIQUE INDEX "Supplier_gstNumber_key" ON public."Supplier"("gstNumber");
CREATE INDEX "Supplier_companyName_idx" ON public."Supplier"("companyName");
CREATE INDEX "Supplier_isActive_idx" ON public."Supplier"("isActive");
CREATE INDEX "Supplier_city_idx" ON public."Supplier"("city");
CREATE INDEX "Supplier_state_idx" ON public."Supplier"("state");
CREATE INDEX "Supplier_updatedAt_idx" ON public."Supplier"("updatedAt");

CREATE TABLE public."ProductSupplier" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "supplierProductCode" TEXT,
  "isPreferred" BOOLEAN NOT NULL DEFAULT false,
  "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1,
  "lastPurchasePrice" DECIMAL(12,2),
  "leadTimeDays" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductSupplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductSupplier_moq_positive" CHECK ("minimumOrderQuantity" > 0),
  CONSTRAINT "ProductSupplier_price_nonnegative" CHECK ("lastPurchasePrice" IS NULL OR "lastPurchasePrice" >= 0),
  CONSTRAINT "ProductSupplier_leadTime_nonnegative" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0)
);

CREATE UNIQUE INDEX "ProductSupplier_productId_supplierId_key"
  ON public."ProductSupplier"("productId", "supplierId");
CREATE UNIQUE INDEX "ProductSupplier_one_preferred_per_product"
  ON public."ProductSupplier"("productId")
  WHERE "isPreferred" = true AND "isActive" = true;
CREATE INDEX "ProductSupplier_productId_idx" ON public."ProductSupplier"("productId");
CREATE INDEX "ProductSupplier_supplierId_idx" ON public."ProductSupplier"("supplierId");
CREATE INDEX "ProductSupplier_isPreferred_idx" ON public."ProductSupplier"("isPreferred");
CREATE INDEX "ProductSupplier_isActive_idx" ON public."ProductSupplier"("isActive");

ALTER TABLE public."ProductSupplier"
  ADD CONSTRAINT "ProductSupplier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES public."Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductSupplier_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES public."Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE public."PurchaseRequest" (
  "id" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" public."PurchaseRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "priority" public."PurchaseRequestPriority" NOT NULL DEFAULT 'NORMAL',
  "requestedById" TEXT,
  "requestedByName" TEXT,
  "requestedByRole" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectedByName" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "cancelledById" TEXT,
  "cancelledByName" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "orderedById" TEXT,
  "orderedByName" TEXT,
  "orderedAt" TIMESTAMP(3),
  "purchaseOrderNumber" TEXT,
  "inTransitAt" TIMESTAMP(3),
  "expectedDeliveryDate" TIMESTAMP(3),
  "actualDeliveryDate" TIMESTAMP(3),
  "supplierInvoiceNumber" TEXT,
  "notes" TEXT,
  "estimatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseRequest_total_nonnegative" CHECK ("estimatedTotal" >= 0)
);

CREATE UNIQUE INDEX "PurchaseRequest_requestNumber_key" ON public."PurchaseRequest"("requestNumber");
CREATE UNIQUE INDEX "PurchaseRequest_purchaseOrderNumber_key" ON public."PurchaseRequest"("purchaseOrderNumber");
CREATE INDEX "PurchaseRequest_supplierId_idx" ON public."PurchaseRequest"("supplierId");
CREATE INDEX "PurchaseRequest_status_idx" ON public."PurchaseRequest"("status");
CREATE INDEX "PurchaseRequest_priority_idx" ON public."PurchaseRequest"("priority");
CREATE INDEX "PurchaseRequest_expectedDeliveryDate_idx" ON public."PurchaseRequest"("expectedDeliveryDate");
CREATE INDEX "PurchaseRequest_createdAt_idx" ON public."PurchaseRequest"("createdAt");

ALTER TABLE public."PurchaseRequest"
  ADD CONSTRAINT "PurchaseRequest_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES public."Supplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE public."PurchaseRequestItem" (
  "id" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "approvedQuantity" INTEGER NOT NULL DEFAULT 0,
  "orderedQuantity" INTEGER NOT NULL DEFAULT 0,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
  "rejectedQuantity" INTEGER NOT NULL DEFAULT 0,
  "estimatedUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseRequestItem_quantities_nonnegative" CHECK (
    "requestedQuantity" > 0 AND
    "approvedQuantity" >= 0 AND
    "orderedQuantity" >= 0 AND
    "receivedQuantity" >= 0 AND
    "damagedQuantity" >= 0 AND
    "rejectedQuantity" >= 0
  ),
  CONSTRAINT "PurchaseRequestItem_price_nonnegative" CHECK (
    "estimatedUnitPrice" >= 0 AND "lineTotal" >= 0
  ),
  CONSTRAINT "PurchaseRequestItem_received_not_above_ordered" CHECK (
    "receivedQuantity" + "damagedQuantity" + "rejectedQuantity" <= GREATEST("orderedQuantity", "approvedQuantity", "requestedQuantity")
  )
);

CREATE UNIQUE INDEX "PurchaseRequestItem_purchaseRequestId_productId_key"
  ON public."PurchaseRequestItem"("purchaseRequestId", "productId");
CREATE INDEX "PurchaseRequestItem_purchaseRequestId_idx" ON public."PurchaseRequestItem"("purchaseRequestId");
CREATE INDEX "PurchaseRequestItem_productId_idx" ON public."PurchaseRequestItem"("productId");

ALTER TABLE public."PurchaseRequestItem"
  ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES public."PurchaseRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseRequestItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES public."Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE public."PurchaseReceipt" (
  "id" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "supplierInvoiceReference" TEXT,
  "challanReference" TEXT,
  "receivedById" TEXT,
  "receivedByName" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseReceipt_receiptNumber_key" ON public."PurchaseReceipt"("receiptNumber");
CREATE INDEX "PurchaseReceipt_purchaseRequestId_idx" ON public."PurchaseReceipt"("purchaseRequestId");
CREATE INDEX "PurchaseReceipt_receivedAt_idx" ON public."PurchaseReceipt"("receivedAt");

ALTER TABLE public."PurchaseReceipt"
  ADD CONSTRAINT "PurchaseReceipt_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES public."PurchaseRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE public."PurchaseReceiptItem" (
  "id" TEXT NOT NULL,
  "purchaseReceiptId" TEXT NOT NULL,
  "purchaseRequestItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "receivedQuantity" INTEGER NOT NULL,
  "acceptedQuantity" INTEGER NOT NULL,
  "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
  "rejectedQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReceiptItem_quantities_valid" CHECK (
    "receivedQuantity" > 0 AND
    "acceptedQuantity" >= 0 AND
    "damagedQuantity" >= 0 AND
    "rejectedQuantity" >= 0 AND
    "acceptedQuantity" + "damagedQuantity" + "rejectedQuantity" = "receivedQuantity"
  ),
  CONSTRAINT "PurchaseReceiptItem_unitCost_nonnegative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0)
);

CREATE INDEX "PurchaseReceiptItem_purchaseReceiptId_idx" ON public."PurchaseReceiptItem"("purchaseReceiptId");
CREATE INDEX "PurchaseReceiptItem_purchaseRequestItemId_idx" ON public."PurchaseReceiptItem"("purchaseRequestItemId");
CREATE INDEX "PurchaseReceiptItem_productId_idx" ON public."PurchaseReceiptItem"("productId");

ALTER TABLE public."PurchaseReceiptItem"
  ADD CONSTRAINT "PurchaseReceiptItem_purchaseReceiptId_fkey"
  FOREIGN KEY ("purchaseReceiptId") REFERENCES public."PurchaseReceipt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseReceiptItem_purchaseRequestItemId_fkey"
  FOREIGN KEY ("purchaseRequestItemId") REFERENCES public."PurchaseRequestItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseReceiptItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES public."Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
