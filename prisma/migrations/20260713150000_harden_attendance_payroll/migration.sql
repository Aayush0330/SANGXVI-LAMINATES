ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_STALE_REVIEW';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_OVERTIME_APPROVED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_OVERTIME_REJECTED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_HOLIDAY_UPDATED';
ALTER TYPE public."SecurityEventType" ADD VALUE IF NOT EXISTS 'PAYROLL_FINALIZED';

CREATE TABLE public."AttendanceSalaryRevision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "effectiveFrom" TEXT NOT NULL,
  "monthlyBaseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "standardDailyMinutes" INTEGER NOT NULL DEFAULT 480,
  "overtimeHourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceSalaryRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AttendanceHoliday" (
  "id" TEXT NOT NULL,
  "holidayDate" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isPaid" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceHoliday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AttendanceOvertimeApproval" (
  "id" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workDate" TEXT NOT NULL,
  "calculatedMinutes" INTEGER NOT NULL,
  "approvedMinutes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceOvertimeApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AttendanceCorrection" (
  "id" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "previousPunchIn" TIMESTAMP(3),
  "previousPunchOut" TIMESTAMP(3),
  "correctedPunchIn" TIMESTAMP(3) NOT NULL,
  "correctedPunchOut" TIMESTAMP(3) NOT NULL,
  "previousNetMinutes" INTEGER,
  "correctedNetMinutes" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT,
  "correctedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."PayrollRun" (
  "id" TEXT NOT NULL,
  "monthKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "finalizedAt" TIMESTAMP(3),
  "finalizedById" TEXT,
  "finalizedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."PayrollRunItem" (
  "id" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "userRole" TEXT NOT NULL,
  "monthlyBaseSalary" DECIMAL(12,2) NOT NULL,
  "perDaySalary" DECIMAL(12,2) NOT NULL,
  "standardDailyMinutes" INTEGER NOT NULL,
  "overtimeHourlyRate" DECIMAL(12,2) NOT NULL,
  "fullDays" INTEGER NOT NULL,
  "halfDays" INTEGER NOT NULL,
  "paidLeaveDays" DECIMAL(6,2) NOT NULL,
  "paidSundayDays" INTEGER NOT NULL,
  "paidHolidayDays" INTEGER NOT NULL,
  "payableDays" DECIMAL(6,2) NOT NULL,
  "overtimeMinutes" INTEGER NOT NULL,
  "grossSalary" DECIMAL(12,2) NOT NULL,
  "overtimePay" DECIMAL(12,2) NOT NULL,
  "approvedAdvance" DECIMAL(12,2) NOT NULL,
  "netPay" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollRunItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceSalaryRevision_userId_effectiveFrom_key" ON public."AttendanceSalaryRevision"("userId", "effectiveFrom");
CREATE INDEX "AttendanceSalaryRevision_userId_idx" ON public."AttendanceSalaryRevision"("userId");
CREATE INDEX "AttendanceSalaryRevision_effectiveFrom_idx" ON public."AttendanceSalaryRevision"("effectiveFrom");
CREATE UNIQUE INDEX "AttendanceHoliday_holidayDate_key" ON public."AttendanceHoliday"("holidayDate");
CREATE INDEX "AttendanceHoliday_holidayDate_idx" ON public."AttendanceHoliday"("holidayDate");
CREATE UNIQUE INDEX "AttendanceOvertimeApproval_attendanceId_key" ON public."AttendanceOvertimeApproval"("attendanceId");
CREATE INDEX "AttendanceOvertimeApproval_userId_idx" ON public."AttendanceOvertimeApproval"("userId");
CREATE INDEX "AttendanceOvertimeApproval_workDate_idx" ON public."AttendanceOvertimeApproval"("workDate");
CREATE INDEX "AttendanceOvertimeApproval_status_idx" ON public."AttendanceOvertimeApproval"("status");
CREATE INDEX "AttendanceCorrection_attendanceId_idx" ON public."AttendanceCorrection"("attendanceId");
CREATE INDEX "AttendanceCorrection_userId_idx" ON public."AttendanceCorrection"("userId");
CREATE INDEX "AttendanceCorrection_createdAt_idx" ON public."AttendanceCorrection"("createdAt");
CREATE UNIQUE INDEX "PayrollRun_monthKey_key" ON public."PayrollRun"("monthKey");
CREATE INDEX "PayrollRun_monthKey_idx" ON public."PayrollRun"("monthKey");
CREATE INDEX "PayrollRun_status_idx" ON public."PayrollRun"("status");
CREATE UNIQUE INDEX "PayrollRunItem_payrollRunId_userId_key" ON public."PayrollRunItem"("payrollRunId", "userId");
CREATE INDEX "PayrollRunItem_payrollRunId_idx" ON public."PayrollRunItem"("payrollRunId");
CREATE INDEX "PayrollRunItem_userId_idx" ON public."PayrollRunItem"("userId");

ALTER TABLE public."AttendanceSalaryRevision" ADD CONSTRAINT "AttendanceSalaryRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."AttendanceHoliday" ADD CONSTRAINT "AttendanceHoliday_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."AttendanceOvertimeApproval" ADD CONSTRAINT "AttendanceOvertimeApproval_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES public."OfficeAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."AttendanceOvertimeApproval" ADD CONSTRAINT "AttendanceOvertimeApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES public."OfficeAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES public."PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO public."AttendanceSalaryRevision" (
  "id", "userId", "effectiveFrom", "monthlyBaseSalary",
  "standardDailyMinutes", "overtimeHourlyRate", "createdById",
  "createdByName", "createdAt"
)
SELECT
  md5(profile."id" || '-salary-revision'),
  profile."userId",
  to_char(profile."createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-01'),
  profile."monthlyBaseSalary",
  profile."standardDailyMinutes",
  profile."overtimeHourlyRate",
  profile."updatedById",
  profile."updatedByName",
  profile."createdAt"
FROM public."AttendancePayProfile" profile
ON CONFLICT ("userId", "effectiveFrom") DO NOTHING;
