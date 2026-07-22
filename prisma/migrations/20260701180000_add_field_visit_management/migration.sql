-- Add field visit management for shop/dealer visit proof, GPS, notes, goals, and follow-ups.

ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'FIELD_VISIT_CREATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'FIELD_VISIT_UPDATED';

CREATE TYPE "FieldVisitStatus" AS ENUM (
  'VISIT_REPORTED',
  'GOAL_ACHIEVED',
  'GOAL_PENDING',
  'FOLLOW_UP_REQUIRED',
  'CLOSED'
);

CREATE TABLE "FieldVisit" (
  "id" TEXT NOT NULL,
  "visitNumber" TEXT NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "createdByRole" TEXT,
  "shopName" TEXT NOT NULL,
  "dealerName" TEXT,
  "contactPerson" TEXT,
  "contactPhone" TEXT,
  "visitType" TEXT NOT NULL DEFAULT 'DEALER_VISIT',
  "status" "FieldVisitStatus" NOT NULL DEFAULT 'VISIT_REPORTED',
  "description" TEXT NOT NULL,
  "pointsDiscussed" TEXT,
  "goalsAchieved" TEXT,
  "goalsPending" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION,
  "locationLabel" TEXT,
  "shopPhotoFileName" TEXT NOT NULL,
  "shopPhotoMimeType" TEXT NOT NULL,
  "shopPhotoDataUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FieldVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldVisit_visitNumber_key" ON "FieldVisit"("visitNumber");
CREATE INDEX "FieldVisit_createdById_idx" ON "FieldVisit"("createdById");
CREATE INDEX "FieldVisit_status_idx" ON "FieldVisit"("status");
CREATE INDEX "FieldVisit_visitType_idx" ON "FieldVisit"("visitType");
CREATE INDEX "FieldVisit_createdAt_idx" ON "FieldVisit"("createdAt");
CREATE INDEX "FieldVisit_nextFollowUpAt_idx" ON "FieldVisit"("nextFollowUpAt");

ALTER TABLE "FieldVisit"
  ADD CONSTRAINT "FieldVisit_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
