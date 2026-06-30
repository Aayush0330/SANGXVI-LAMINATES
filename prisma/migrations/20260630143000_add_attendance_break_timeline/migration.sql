ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_BREAK';

ALTER TABLE "OfficeAttendance"
  ADD COLUMN IF NOT EXISTS "currentBreakType" TEXT,
  ADD COLUMN IF NOT EXISTS "currentBreakStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netWorkingMinutes" INTEGER;

CREATE TABLE IF NOT EXISTS "OfficeAttendanceEvent" (
  "id" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "distanceMeters" DOUBLE PRECISION,
  "insideGeofence" BOOLEAN NOT NULL DEFAULT false,
  "photoDataUrl" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfficeAttendanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfficeAttendanceEvent_attendanceId_idx" ON "OfficeAttendanceEvent"("attendanceId");
CREATE INDEX IF NOT EXISTS "OfficeAttendanceEvent_userId_idx" ON "OfficeAttendanceEvent"("userId");
CREATE INDEX IF NOT EXISTS "OfficeAttendanceEvent_eventType_idx" ON "OfficeAttendanceEvent"("eventType");
CREATE INDEX IF NOT EXISTS "OfficeAttendanceEvent_createdAt_idx" ON "OfficeAttendanceEvent"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OfficeAttendanceEvent_attendanceId_fkey'
      AND table_name = 'OfficeAttendanceEvent'
  ) THEN
    ALTER TABLE "OfficeAttendanceEvent"
      ADD CONSTRAINT "OfficeAttendanceEvent_attendanceId_fkey"
      FOREIGN KEY ("attendanceId") REFERENCES "OfficeAttendance"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OfficeAttendanceEvent_userId_fkey'
      AND table_name = 'OfficeAttendanceEvent'
  ) THEN
    ALTER TABLE "OfficeAttendanceEvent"
      ADD CONSTRAINT "OfficeAttendanceEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
