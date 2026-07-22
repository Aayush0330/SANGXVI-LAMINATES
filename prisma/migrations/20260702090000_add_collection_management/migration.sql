CREATE TYPE "CollectionStatus" AS ENUM (
  'ASSIGNED',
  'ON_THE_WAY',
  'REACHED',
  'PARTIALLY_COLLECTED',
  'COLLECTED',
  'FAILED',
  'RESCHEDULED',
  'VERIFIED',
  'CANCELLED'
);

CREATE TYPE "CollectionPaymentMode" AS ENUM (
  'CASH',
  'CHEQUE',
  'UPI',
  'BANK_TRANSFER',
  'OWNER_COLLECTED',
  'OTHER'
);

ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'COLLECTION_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'COLLECTION_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'COLLECTION_STATUS_CHANGED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'COLLECTION_PROOF_UPLOADED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'COLLECTION_VERIFIED';

CREATE TABLE "CollectionAssignment" (
  "id" TEXT NOT NULL,
  "collectionNumber" TEXT NOT NULL,
  "dealerId" TEXT,
  "dealerName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "contactPhone" TEXT,
  "assignedToId" TEXT,
  "amountToCollect" INTEGER NOT NULL,
  "amountCollected" INTEGER NOT NULL DEFAULT 0,
  "paymentMode" "CollectionPaymentMode" NOT NULL DEFAULT 'CASH',
  "status" "CollectionStatus" NOT NULL DEFAULT 'ASSIGNED',
  "dueAt" TIMESTAMP(3),
  "notes" TEXT,
  "onTheWayAt" TIMESTAMP(3),
  "reachedAt" TIMESTAMP(3),
  "collectedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "rescheduledAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "collectedById" TEXT,
  "collectedByName" TEXT,
  "verifiedById" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionAssignment_collectionNumber_key" ON "CollectionAssignment"("collectionNumber");
CREATE INDEX "CollectionAssignment_dealerId_idx" ON "CollectionAssignment"("dealerId");
CREATE INDEX "CollectionAssignment_assignedToId_idx" ON "CollectionAssignment"("assignedToId");
CREATE INDEX "CollectionAssignment_collectedById_idx" ON "CollectionAssignment"("collectedById");
CREATE INDEX "CollectionAssignment_verifiedById_idx" ON "CollectionAssignment"("verifiedById");
CREATE INDEX "CollectionAssignment_createdById_idx" ON "CollectionAssignment"("createdById");
CREATE INDEX "CollectionAssignment_status_idx" ON "CollectionAssignment"("status");
CREATE INDEX "CollectionAssignment_paymentMode_idx" ON "CollectionAssignment"("paymentMode");
CREATE INDEX "CollectionAssignment_dueAt_idx" ON "CollectionAssignment"("dueAt");
CREATE INDEX "CollectionAssignment_createdAt_idx" ON "CollectionAssignment"("createdAt");

ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionAssignment" ADD CONSTRAINT "CollectionAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CollectionProof" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "proofType" TEXT NOT NULL DEFAULT 'PAYMENT_PROOF',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileDataUrl" TEXT NOT NULL,
  "note" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectionProof_collectionId_idx" ON "CollectionProof"("collectionId");
CREATE INDEX "CollectionProof_uploadedById_idx" ON "CollectionProof"("uploadedById");
CREATE INDEX "CollectionProof_proofType_idx" ON "CollectionProof"("proofType");
CREATE INDEX "CollectionProof_uploadedAt_idx" ON "CollectionProof"("uploadedAt");

ALTER TABLE "CollectionProof" ADD CONSTRAINT "CollectionProof_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CollectionAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionProof" ADD CONSTRAINT "CollectionProof_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
