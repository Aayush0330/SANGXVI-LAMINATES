-- Add inventory inquiry and missed-sales tracking.
CREATE TYPE "InventoryInquiryStatus" AS ENUM (
  'NEW_INQUIRY',
  'FOLLOW_UP',
  'ORDER_PLACED',
  'NOT_IN_STOCK',
  'MISSED_SALE',
  'CLOSED'
);

ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'INVENTORY_INQUIRY_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'INVENTORY_INQUIRY_UPDATED';

CREATE TABLE "InventoryInquiry" (
  "id" TEXT NOT NULL,
  "inquiryNumber" TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "quantityAsked" INTEGER NOT NULL,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "dealerName" TEXT,
  "source" TEXT NOT NULL DEFAULT 'CALL',
  "status" "InventoryInquiryStatus" NOT NULL DEFAULT 'NEW_INQUIRY',
  "description" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "orderNumber" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryInquiry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryInquiry_quantityAsked_check" CHECK ("quantityAsked" > 0)
);

CREATE UNIQUE INDEX "InventoryInquiry_inquiryNumber_key" ON "InventoryInquiry"("inquiryNumber");
CREATE INDEX "InventoryInquiry_productId_idx" ON "InventoryInquiry"("productId");
CREATE INDEX "InventoryInquiry_createdById_idx" ON "InventoryInquiry"("createdById");
CREATE INDEX "InventoryInquiry_status_idx" ON "InventoryInquiry"("status");
CREATE INDEX "InventoryInquiry_createdAt_idx" ON "InventoryInquiry"("createdAt");
CREATE INDEX "InventoryInquiry_nextFollowUpAt_idx" ON "InventoryInquiry"("nextFollowUpAt");

ALTER TABLE "InventoryInquiry"
  ADD CONSTRAINT "InventoryInquiry_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryInquiry"
  ADD CONSTRAINT "InventoryInquiry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
