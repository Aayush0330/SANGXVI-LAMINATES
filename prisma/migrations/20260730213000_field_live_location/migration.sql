CREATE TYPE "FieldLocationSessionStatus" AS ENUM ('ACTIVE', 'STOPPED');

ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'FIELD_LOCATION_STARTED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'FIELD_LOCATION_STOPPED';

CREATE TABLE "FieldLocationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "FieldLocationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastAccuracyMeters" DOUBLE PRECISION,
    "lastHeading" DOUBLE PRECISION,
    "lastSpeedMps" DOUBLE PRECISION,
    "lastRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldLocationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FieldLocationPoint" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldLocationPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldLocationSession_userId_status_idx"
ON "FieldLocationSession"("userId", "status");

CREATE INDEX "FieldLocationSession_status_lastRecordedAt_idx"
ON "FieldLocationSession"("status", "lastRecordedAt");

CREATE INDEX "FieldLocationSession_startedAt_idx"
ON "FieldLocationSession"("startedAt");

CREATE INDEX "FieldLocationPoint_sessionId_capturedAt_idx"
ON "FieldLocationPoint"("sessionId", "capturedAt");

CREATE INDEX "FieldLocationPoint_receivedAt_idx"
ON "FieldLocationPoint"("receivedAt");

ALTER TABLE "FieldLocationSession"
ADD CONSTRAINT "FieldLocationSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FieldLocationPoint"
ADD CONSTRAINT "FieldLocationPoint_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "FieldLocationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
