-- Attendance Payroll + Leave add-on
-- Doc scope: salary per day, advance pay request, leave apply approval, overtime, and Sunday-inclusive salary calendar.

DO $$
BEGIN
  CREATE TYPE "AttendanceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AttendanceLeaveType" AS ENUM ('FULL_DAY', 'HALF_DAY', 'PAID', 'UNPAID', 'EMERGENCY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_PAY_PROFILE_UPDATED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_ADVANCE_REQUESTED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_ADVANCE_APPROVED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_ADVANCE_REJECTED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_LEAVE_REQUESTED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_LEAVE_APPROVED';
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_LEAVE_REJECTED';

CREATE TABLE IF NOT EXISTS "AttendancePayProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dailySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "standardDailyMinutes" INTEGER NOT NULL DEFAULT 480,
  "overtimeHourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendancePayProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AttendanceAdvanceRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT,
  "status" "AttendanceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceAdvanceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AttendanceLeaveRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "leaveType" "AttendanceLeaveType" NOT NULL DEFAULT 'FULL_DAY',
  "days" DECIMAL(6,2) NOT NULL DEFAULT 1,
  "reason" TEXT,
  "status" "AttendanceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceLeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendancePayProfile_userId_key" ON "AttendancePayProfile"("userId");
CREATE INDEX IF NOT EXISTS "AttendancePayProfile_userId_idx" ON "AttendancePayProfile"("userId");
CREATE INDEX IF NOT EXISTS "AttendancePayProfile_updatedById_idx" ON "AttendancePayProfile"("updatedById");
CREATE INDEX IF NOT EXISTS "AttendancePayProfile_updatedAt_idx" ON "AttendancePayProfile"("updatedAt");

CREATE INDEX IF NOT EXISTS "AttendanceAdvanceRequest_userId_idx" ON "AttendanceAdvanceRequest"("userId");
CREATE INDEX IF NOT EXISTS "AttendanceAdvanceRequest_status_idx" ON "AttendanceAdvanceRequest"("status");
CREATE INDEX IF NOT EXISTS "AttendanceAdvanceRequest_requestedAt_idx" ON "AttendanceAdvanceRequest"("requestedAt");
CREATE INDEX IF NOT EXISTS "AttendanceAdvanceRequest_decidedById_idx" ON "AttendanceAdvanceRequest"("decidedById");

CREATE INDEX IF NOT EXISTS "AttendanceLeaveRequest_userId_idx" ON "AttendanceLeaveRequest"("userId");
CREATE INDEX IF NOT EXISTS "AttendanceLeaveRequest_status_idx" ON "AttendanceLeaveRequest"("status");
CREATE INDEX IF NOT EXISTS "AttendanceLeaveRequest_startDate_idx" ON "AttendanceLeaveRequest"("startDate");
CREATE INDEX IF NOT EXISTS "AttendanceLeaveRequest_endDate_idx" ON "AttendanceLeaveRequest"("endDate");
CREATE INDEX IF NOT EXISTS "AttendanceLeaveRequest_requestedAt_idx" ON "AttendanceLeaveRequest"("requestedAt");
CREATE INDEX IF NOT EXISTS "AttendanceLeaveRequest_decidedById_idx" ON "AttendanceLeaveRequest"("decidedById");

DO $$
BEGIN
  ALTER TABLE "AttendancePayProfile"
    ADD CONSTRAINT "AttendancePayProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AttendancePayProfile"
    ADD CONSTRAINT "AttendancePayProfile_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AttendanceAdvanceRequest"
    ADD CONSTRAINT "AttendanceAdvanceRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AttendanceAdvanceRequest"
    ADD CONSTRAINT "AttendanceAdvanceRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AttendanceLeaveRequest"
    ADD CONSTRAINT "AttendanceLeaveRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AttendanceLeaveRequest"
    ADD CONSTRAINT "AttendanceLeaveRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
