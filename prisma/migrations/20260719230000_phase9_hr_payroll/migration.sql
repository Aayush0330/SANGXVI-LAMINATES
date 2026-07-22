-- Phase 9: HR and Payroll completion.
-- This migration is additive and preserves all existing attendance, payroll and user history.

DO $$ BEGIN
  CREATE TYPE public."EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."EmployeeLifecycleType" AS ENUM ('JOINED', 'PROFILE_UPDATED', 'TRANSFERRED', 'PROMOTED', 'STATUS_CHANGED', 'EXITED', 'REACTIVATED', 'NOTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public."PayrollPaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'ON_HOLD', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PAYROLL_PAYMENT_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_PROFILE_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_LIFECYCLE_RECORDED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_REQUESTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_APPROVED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_REJECTED';

ALTER TABLE public."AttendancePayProfile"
  ADD COLUMN IF NOT EXISTS "monthlyAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public."AttendanceSalaryRevision"
  ADD COLUMN IF NOT EXISTS "monthlyAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public."PayrollRunItem"
  ADD COLUMN IF NOT EXISTS "monthlyAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentStatus" public."PayrollPaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidById" TEXT,
  ADD COLUMN IF NOT EXISTS "paidByName" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentNote" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS public."EmployeeProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "employeeCode" TEXT,
  "department" TEXT,
  "designation" TEXT,
  "employmentType" public."EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "joiningDate" TEXT,
  "probationEndDate" TEXT,
  "reportingManagerId" TEXT,
  "reportingManagerName" TEXT,
  "emergencyContactName" TEXT,
  "emergencyContactPhone" TEXT,
  "lastWorkingDate" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."EmployeeLifecycleEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" public."EmployeeLifecycleType" NOT NULL,
  "effectiveDate" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "previousValue" TEXT,
  "newValue" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."AttendanceCorrectionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workDate" TEXT NOT NULL,
  "requestedPunchIn" TIMESTAMP(3) NOT NULL,
  "requestedPunchOut" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" public."AttendanceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "appliedAttendanceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeProfile_userId_key" ON public."EmployeeProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeProfile_employeeCode_key" ON public."EmployeeProfile"("employeeCode");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeProfile_employeeCode_lower_key" ON public."EmployeeProfile" (LOWER("employeeCode")) WHERE "employeeCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmployeeProfile_department_idx" ON public."EmployeeProfile"("department");
CREATE INDEX IF NOT EXISTS "EmployeeProfile_designation_idx" ON public."EmployeeProfile"("designation");
CREATE INDEX IF NOT EXISTS "EmployeeProfile_employmentType_idx" ON public."EmployeeProfile"("employmentType");
CREATE INDEX IF NOT EXISTS "EmployeeProfile_reportingManagerId_idx" ON public."EmployeeProfile"("reportingManagerId");
CREATE INDEX IF NOT EXISTS "EmployeeProfile_joiningDate_idx" ON public."EmployeeProfile"("joiningDate");

CREATE INDEX IF NOT EXISTS "EmployeeLifecycleEvent_userId_idx" ON public."EmployeeLifecycleEvent"("userId");
CREATE INDEX IF NOT EXISTS "EmployeeLifecycleEvent_eventType_idx" ON public."EmployeeLifecycleEvent"("eventType");
CREATE INDEX IF NOT EXISTS "EmployeeLifecycleEvent_effectiveDate_idx" ON public."EmployeeLifecycleEvent"("effectiveDate");
CREATE INDEX IF NOT EXISTS "EmployeeLifecycleEvent_createdAt_idx" ON public."EmployeeLifecycleEvent"("createdAt");

CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_userId_idx" ON public."AttendanceCorrectionRequest"("userId");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_workDate_idx" ON public."AttendanceCorrectionRequest"("workDate");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_status_idx" ON public."AttendanceCorrectionRequest"("status");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_requestedAt_idx" ON public."AttendanceCorrectionRequest"("requestedAt");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_decidedById_idx" ON public."AttendanceCorrectionRequest"("decidedById");
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_pending_user_date_key"
  ON public."AttendanceCorrectionRequest"("userId", "workDate") WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "PayrollRunItem_paymentStatus_idx" ON public."PayrollRunItem"("paymentStatus");
CREATE INDEX IF NOT EXISTS "PayrollRunItem_paidAt_idx" ON public."PayrollRunItem"("paidAt");
CREATE INDEX IF NOT EXISTS "PayrollRunItem_paidById_idx" ON public."PayrollRunItem"("paidById");

DO $$ BEGIN
  ALTER TABLE public."EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_reportingManagerId_fkey"
    FOREIGN KEY ("reportingManagerId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."EmployeeLifecycleEvent" ADD CONSTRAINT "EmployeeLifecycleEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."EmployeeLifecycleEvent" ADD CONSTRAINT "EmployeeLifecycleEvent_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_paidById_fkey"
    FOREIGN KEY ("paidById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public."AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_time_order_check"
    CHECK ("requestedPunchOut" > "requestedPunchIn");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."AttendancePayProfile" ADD CONSTRAINT "AttendancePayProfile_phase9_amounts_check"
    CHECK ("monthlyAllowance" >= 0 AND "monthlyDeduction" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."AttendanceSalaryRevision" ADD CONSTRAINT "AttendanceSalaryRevision_phase9_amounts_check"
    CHECK ("monthlyAllowance" >= 0 AND "monthlyDeduction" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public."PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_phase9_amounts_check"
    CHECK ("monthlyAllowance" >= 0 AND "monthlyDeduction" >= 0 AND "netPay" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
