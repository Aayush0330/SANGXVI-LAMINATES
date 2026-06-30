-- Multiple transport options + signed duplicate invoice delivery proof
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'TRANSPORT_OPTION_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'TRANSPORT_OPTION_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'TRANSPORT_OPTION_DISABLED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'TRANSPORT_ASSIGNED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_PROOF_UPLOADED';

CREATE TABLE IF NOT EXISTS "TransportOption" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdByName" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransportOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TransportOption_name_key" ON "TransportOption"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportOption_name_lower_key" ON "TransportOption"(LOWER("name"));
CREATE INDEX IF NOT EXISTS "TransportOption_isActive_idx" ON "TransportOption"("isActive");
CREATE INDEX IF NOT EXISTS "TransportOption_sortOrder_idx" ON "TransportOption"("sortOrder");

ALTER TABLE "TransportOption"
  ADD CONSTRAINT "TransportOption_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TransportOption"
  ADD CONSTRAINT "TransportOption_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "transportOptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "transportLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "signedInvoiceStatus" TEXT NOT NULL DEFAULT 'NOT_UPLOADED',
  ADD COLUMN IF NOT EXISTS "signedInvoiceUploadedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_transportOptionId_idx" ON "Order"("transportOptionId");
CREATE INDEX IF NOT EXISTS "Order_signedInvoiceStatus_idx" ON "Order"("signedInvoiceStatus");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_transportOptionId_fkey"
  FOREIGN KEY ("transportOptionId") REFERENCES "TransportOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "DeliveryProof" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "proofType" TEXT NOT NULL DEFAULT 'SIGNED_DUPLICATE_INVOICE',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileDataUrl" TEXT NOT NULL,
  "note" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeliveryProof_orderId_idx" ON "DeliveryProof"("orderId");
CREATE INDEX IF NOT EXISTS "DeliveryProof_uploadedById_idx" ON "DeliveryProof"("uploadedById");
CREATE INDEX IF NOT EXISTS "DeliveryProof_proofType_idx" ON "DeliveryProof"("proofType");
CREATE INDEX IF NOT EXISTS "DeliveryProof_uploadedAt_idx" ON "DeliveryProof"("uploadedAt");

ALTER TABLE "DeliveryProof"
  ADD CONSTRAINT "DeliveryProof_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryProof"
  ADD CONSTRAINT "DeliveryProof_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TransportOption" ("id", "name", "description", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('transport_auto', 'Auto', 'Local auto delivery.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('transport_tempo', 'Tempo', 'Tempo / mini truck delivery.', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('transport_truck', 'Truck', 'Large truck dispatch.', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('transport_own_vehicle', 'Own Vehicle', 'Company owned vehicle.', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('transport_courier', 'Courier', 'Courier / third-party parcel service.', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('transport_other', 'Other', 'Custom transport option.', true, 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
