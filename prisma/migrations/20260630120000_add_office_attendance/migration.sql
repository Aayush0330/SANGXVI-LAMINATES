DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SecurityEventType') THEN
    ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'OFFICE_LOCATION_UPDATED';
    ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_PUNCH';
    ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_BLOCKED';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OfficeLocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'Main Office',
  "address" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "radiusMeters" INTEGER NOT NULL DEFAULT 200,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OfficeAttendance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "workDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUNCHED_IN',
  "punchInAt" TIMESTAMPTZ,
  "punchInLatitude" DOUBLE PRECISION,
  "punchInLongitude" DOUBLE PRECISION,
  "punchInAccuracyMeters" DOUBLE PRECISION,
  "punchInDistanceMeters" DOUBLE PRECISION,
  "punchInInsideGeofence" BOOLEAN NOT NULL DEFAULT false,
  "punchInPhotoDataUrl" TEXT,
  "punchOutAt" TIMESTAMPTZ,
  "punchOutLatitude" DOUBLE PRECISION,
  "punchOutLongitude" DOUBLE PRECISION,
  "punchOutAccuracyMeters" DOUBLE PRECISION,
  "punchOutDistanceMeters" DOUBLE PRECISION,
  "punchOutInsideGeofence" BOOLEAN NOT NULL DEFAULT false,
  "punchOutPhotoDataUrl" TEXT,
  "totalMinutes" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfficeAttendance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfficeAttendance_userId_workDate_key"
ON "OfficeAttendance"("userId", "workDate");

CREATE INDEX IF NOT EXISTS "OfficeAttendance_workDate_idx"
ON "OfficeAttendance"("workDate");

CREATE INDEX IF NOT EXISTS "OfficeAttendance_userId_idx"
ON "OfficeAttendance"("userId");

CREATE INDEX IF NOT EXISTS "OfficeAttendance_status_idx"
ON "OfficeAttendance"("status");

CREATE TABLE IF NOT EXISTS "OfficeAttendanceAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "distanceMeters" DOUBLE PRECISION,
  "insideGeofence" BOOLEAN NOT NULL DEFAULT false,
  "photoDataUrl" TEXT,
  "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfficeAttendanceAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OfficeAttendanceAttempt_userId_idx"
ON "OfficeAttendanceAttempt"("userId");

CREATE INDEX IF NOT EXISTS "OfficeAttendanceAttempt_actionType_idx"
ON "OfficeAttendanceAttempt"("actionType");

CREATE INDEX IF NOT EXISTS "OfficeAttendanceAttempt_status_idx"
ON "OfficeAttendanceAttempt"("status");

CREATE INDEX IF NOT EXISTS "OfficeAttendanceAttempt_attemptedAt_idx"
ON "OfficeAttendanceAttempt"("attemptedAt");
