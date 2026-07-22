import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { markStaleAttendanceForReview } from "./attendance-reconciliation";
import { getIndiaWorkDate } from "./office-attendance";
import type { UserRole } from "./permissions";

type PayrollQueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export type AttendanceRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type AttendanceLeaveType = "FULL_DAY" | "HALF_DAY" | "PAID" | "UNPAID" | "EMERGENCY";

export type DecimalLike = number | string | { toNumber?: () => number; toString?: () => string } | null | undefined;

export type PayrollUserRow = {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  userPhone: string | null;
  monthlyBaseSalary: DecimalLike;
  monthlyAllowance: DecimalLike;
  monthlyDeduction: DecimalLike;
  standardDailyMinutes: number | null;
  overtimeHourlyRate: DecimalLike;
  profileUpdatedAt: Date | string | null;
};

export type PayrollAttendanceRow = {
  attendanceId: string;
  userId: string;
  workDate: string;
  punchInAt: Date | string | null;
  punchOutAt: Date | string | null;
  status: string | null;
  netWorkingMinutes: number | null;
};

export type PayrollOvertimeCandidate = {
  attendanceId: string;
  userId: string;
  userName: string;
  workDate: string;
  calculatedMinutes: number;
  status: string;
  approvedMinutes: number;
};

type SalaryRevisionRow = {
  userId: string;
  effectiveFrom: string;
  monthlyBaseSalary: DecimalLike;
  monthlyAllowance: DecimalLike;
  monthlyDeduction: DecimalLike;
  standardDailyMinutes: number;
  overtimeHourlyRate: DecimalLike;
};

export type PayrollHolidayRow = {
  id: string;
  holidayDate: string;
  name: string;
  isPaid: boolean;
};

type OvertimeApprovalRow = {
  attendanceId: string;
  status: string;
  calculatedMinutes: number;
  approvedMinutes: number;
};

export type PayrollRunSummary = {
  id: string;
  monthKey: string;
  status: string;
  finalizedAt: Date | string | null;
  finalizedByName: string | null;
};

export type PayrollAdvanceRow = {
  id: string;
  userId: string;
  userName: string;
  amount: DecimalLike;
  reason: string | null;
  status: AttendanceRequestStatus | string;
  requestedAt: Date | string;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: Date | string | null;
  decisionNote: string | null;
};

export type PayrollLeaveRow = {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  leaveType: AttendanceLeaveType | string;
  days: DecimalLike;
  reason: string | null;
  status: AttendanceRequestStatus | string;
  requestedAt: Date | string;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: Date | string | null;
  decisionNote: string | null;
};

export type PayrollSummaryRow = {
  payrollItemId: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  monthlyBaseSalary: number;
  monthlyAllowance: number;
  monthlyDeduction: number;
  totalMonthlyEarnings: number;
  perDaySalary: number;
  standardDailyMinutes: number;
  overtimeHourlyRate: number;
  presentDays: number;
  fullDays: number;
  halfDays: number;
  unpaidShortDays: number;
  approvedPaidLeaveDays: number;
  paidSundayDays: number;
  paidHolidayDays: number;
  calendarPayDays: number;
  overtimeMinutes: number;
  todayWorkingMinutes: number;
  grossSalary: number;
  overtimePay: number;
  approvedAdvance: number;
  netPay: number;
  paymentStatus: string;
  paidAt: Date | string | null;
  paidByName: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  profileUpdatedAt: Date | string | null;
};

const employeeRoleLabels: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",

  DISPATCH_TEAM: "Physical Dispatch Team",
  ORDER_TEAM: "Order Receiving Team",
  QC_TEAM: "QC Team",
  DRIVER_TRANSPORT: "Driver / Transport",
  COLLECTION_TEAM: "Collection Team",
  SALES_FIELD_TEAM: "Sales / Field Team",
};

const appEmployeeRoles: UserRole[] = [
  "owner",
  "manager",
  "accountant",
  "dispatch_team",
  "order_team",
  "qc_team",
  "driver_transport",
  "collection_team",
  "sales_field_team",
];

export function canUsePayrollSelfService(role: UserRole) {
  return appEmployeeRoles.includes(role);
}

export function toMoneyNumber(value: DecimalLike) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatRupees(value: DecimalLike) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(toMoneyNumber(value)));
}

export function formatDecimalDays(value: DecimalLike) {
  const days = toMoneyNumber(value);
  if (Number.isInteger(days)) return String(days);
  return days.toFixed(1);
}

export function getMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}

export function isValidMonthKey(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

export function isValidWorkDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getMonthBounds(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    calendarDays: end.getUTCDate(),
  };
}

export function calculateInclusiveDays(startDate: string, endDate: string) {
  if (!isValidWorkDate(startDate) || !isValidWorkDate(endDate)) return 0;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(0, diffDays);
}

export function getEmployeeRoleLabel(role: string) {
  return employeeRoleLabels[role] ?? role.replaceAll("_", " ");
}

export function getLeaveTypeLabel(leaveType: string) {
  if (leaveType === "FULL_DAY") return "Full Day";
  if (leaveType === "HALF_DAY") return "Half Day";
  if (leaveType === "PAID") return "Paid Leave";
  if (leaveType === "UNPAID") return "Unpaid Leave";
  if (leaveType === "EMERGENCY") return "Emergency";
  return leaveType.replaceAll("_", " ");
}

export function getStatusLabel(status: string) {
  if (status === "PENDING") return "Pending";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  if (status === "CANCELLED") return "Cancelled";
  return status;
}

export function getStatusClass(status: string) {
  if (status === "APPROVED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (status === "REJECTED" || status === "CANCELLED") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300";
}

export function getOwnerRecordStatusLabel(status: string) {
  if (status === "APPROVED") return "Recorded";
  if (status === "PENDING") return "Recorded";
  return getStatusLabel(status);
}

export function getOwnerRecordStatusClass(status: string) {
  if (status === "APPROVED" || status === "PENDING") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300";
  }
  return getStatusClass(status);
}

export async function normalizeOwnerPendingLeaveRecords(userId: string, userName: string) {
  await prisma.$executeRaw`
    UPDATE public."AttendanceLeaveRequest"
    SET
      "status" = 'APPROVED'::public."AttendanceRequestStatus",
      "decidedById" = ${userId},
      "decidedByName" = ${userName},
      "decidedAt" = COALESCE("decidedAt", CURRENT_TIMESTAMP),
      "decisionNote" = COALESCE("decisionNote", 'Owner availability record. No approval required.'),
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
      AND "status" = 'PENDING'::public."AttendanceRequestStatus"
  `;
}


export function formatIndiaPayrollDateTime(value?: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatIndiaPayrollDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export async function getPayrollUsers(db: PayrollQueryClient = prisma) {
  return db.$queryRaw<PayrollUserRow[]>`
    SELECT
      u."id" AS "userId",
      u."name" AS "userName",
      u."email" AS "userEmail",
      COALESCE(
        (
          SELECT assignment."role"::text
          FROM public."UserRoleAssignment" assignment
          WHERE assignment."userId" = u."id"
            AND assignment."role"::text <> 'DEALER'
          ORDER BY assignment."isPrimary" DESC, assignment."createdAt" ASC
          LIMIT 1
        ),
        NULLIF(u."role"::text, 'DEALER')
      ) AS "userRole",
      u."phone" AS "userPhone",
      COALESCE(profile."monthlyBaseSalary", 0) AS "monthlyBaseSalary",
      COALESCE(profile."monthlyAllowance", 0) AS "monthlyAllowance",
      COALESCE(profile."monthlyDeduction", 0) AS "monthlyDeduction",
      COALESCE(profile."standardDailyMinutes", 480) AS "standardDailyMinutes",
      COALESCE(profile."overtimeHourlyRate", 0) AS "overtimeHourlyRate",
      profile."updatedAt" AS "profileUpdatedAt"
    FROM public."User" u
    LEFT JOIN public."AttendancePayProfile" profile ON profile."userId" = u."id"
    WHERE u."status" = 'ACTIVE'::public."UserStatus"
      AND (
        u."role"::text <> 'DEALER'
        OR EXISTS (
          SELECT 1
          FROM public."UserRoleAssignment" assignment
          WHERE assignment."userId" = u."id"
            AND assignment."role"::text <> 'DEALER'
        )
      )
    ORDER BY u."name" ASC
  `;
}

export async function getPayrollAttendanceRows(
  monthKey: string,
  db: PayrollQueryClient = prisma,
) {
  const { startDate, endDate } = getMonthBounds(monthKey);

  return db.$queryRaw<PayrollAttendanceRow[]>`
    SELECT
      "id" AS "attendanceId",
      "userId",
      "workDate",
      "punchInAt",
      "punchOutAt",
      "status",
      CASE
        WHEN "punchOutAt" IS NOT NULL THEN COALESCE("netWorkingMinutes", 0)
        ELSE GREATEST(
          0,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "punchInAt")) / 60)::int)
          - (
            COALESCE("breakMinutes", 0) + CASE
              WHEN "currentBreakStartedAt" IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "currentBreakStartedAt")) / 60)::int)
              ELSE 0
            END
          )
        )
      END AS "netWorkingMinutes"
    FROM public."OfficeAttendance"
    WHERE "workDate" >= ${startDate}
      AND "workDate" <= ${endDate}
      AND "punchInAt" IS NOT NULL
  `;
}

export async function getPayrollAdvanceRequests({
  status,
  userId,
  limit = 200,
}: {
  status?: string;
  userId?: string;
  limit?: number;
} = {}, db: PayrollQueryClient = prisma) {
  const rows = await db.$queryRaw<PayrollAdvanceRow[]>`
    SELECT
      request."id",
      request."userId",
      u."name" AS "userName",
      request."amount",
      request."reason",
      request."status"::text AS "status",
      request."requestedAt",
      request."decidedById",
      request."decidedByName",
      request."decidedAt",
      request."decisionNote"
    FROM public."AttendanceAdvanceRequest" request
    INNER JOIN public."User" u ON u."id" = request."userId"
    ORDER BY request."requestedAt" DESC
    LIMIT ${limit}
  `;

  return rows.filter((row) => {
    const statusMatches = !status || status === "ALL" || row.status === status;
    const userMatches = !userId || row.userId === userId;
    return statusMatches && userMatches;
  });
}

export async function getPayrollLeaveRequests({
  status,
  userId,
  limit = 200,
}: {
  status?: string;
  userId?: string;
  limit?: number;
} = {}, db: PayrollQueryClient = prisma) {
  const rows = await db.$queryRaw<PayrollLeaveRow[]>`
    SELECT
      request."id",
      request."userId",
      u."name" AS "userName",
      request."startDate",
      request."endDate",
      request."leaveType"::text AS "leaveType",
      request."days",
      request."reason",
      request."status"::text AS "status",
      request."requestedAt",
      request."decidedById",
      request."decidedByName",
      request."decidedAt",
      request."decisionNote"
    FROM public."AttendanceLeaveRequest" request
    INNER JOIN public."User" u ON u."id" = request."userId"
    ORDER BY request."requestedAt" DESC
    LIMIT ${limit}
  `;

  return rows.filter((row) => {
    const statusMatches = !status || status === "ALL" || row.status === status;
    const userMatches = !userId || row.userId === userId;
    return statusMatches && userMatches;
  });
}

function getApprovedPaidLeaveDaysForMonth(
  leaves: PayrollLeaveRow[],
  monthKey: string,
  userId: string,
  accrualEndDate: string | null,
  attendanceFractions: Map<string, number>,
  paidHolidayDates: Set<string>,
) {
  if (!accrualEndDate) return 0;
  const { startDate, endDate } = getMonthBounds(monthKey);
  const finalDate = accrualEndDate < endDate ? accrualEndDate : endDate;
  const leaveFractions = new Map<string, number>();

  for (const leave of leaves) {
    if (leave.userId !== userId || leave.status !== "APPROVED" || leave.leaveType === "UNPAID") continue;
    const overlapStart = leave.startDate > startDate ? leave.startDate : startDate;
    const overlapEnd = leave.endDate < finalDate ? leave.endDate : finalDate;
    if (overlapStart > overlapEnd) continue;

    const dates = leave.leaveType === "HALF_DAY"
      ? [overlapStart]
      : enumerateDates(overlapStart, overlapEnd);
    const fraction = leave.leaveType === "HALF_DAY" ? 0.5 : 1;

    for (const date of dates) {
      const isSunday = new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
      if (attendanceFractions.has(date) || isSunday || paidHolidayDates.has(date)) continue;
      leaveFractions.set(date, Math.max(leaveFractions.get(date) ?? 0, fraction));
    }
  }

  return Array.from(leaveFractions.values()).reduce((total, fraction) => total + fraction, 0);
}

function getApprovedAdvanceForMonth(advances: PayrollAdvanceRow[], monthKey: string, userId: string) {
  return advances
    .filter((advance) => {
      if (advance.userId !== userId || advance.status !== "APPROVED") return false;
      const requestedAt = new Date(advance.requestedAt);
      if (Number.isNaN(requestedAt.getTime())) return false;
      return getMonthKey(requestedAt) === monthKey;
    })
    .reduce((total, advance) => total + toMoneyNumber(advance.amount), 0);
}

function enumerateDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getAccrualEndDate(monthKey: string) {
  const { startDate, endDate } = getMonthBounds(monthKey);
  const today = getIndiaWorkDate();

  if (today < startDate) return null;
  return today < endDate ? today : endDate;
}

async function getSalaryRevisions(
  endDate: string,
  db: PayrollQueryClient = prisma,
) {
  return db.$queryRaw<SalaryRevisionRow[]>`
    SELECT
      "userId",
      "effectiveFrom",
      "monthlyBaseSalary",
      "monthlyAllowance",
      "monthlyDeduction",
      "standardDailyMinutes",
      "overtimeHourlyRate"
    FROM public."AttendanceSalaryRevision"
    WHERE "effectiveFrom" <= ${endDate}
    ORDER BY "userId" ASC, "effectiveFrom" ASC
  `;
}

async function getPayrollHolidays(
  monthKey: string,
  db: PayrollQueryClient = prisma,
) {
  const { startDate, endDate } = getMonthBounds(monthKey);
  return db.$queryRaw<PayrollHolidayRow[]>`
    SELECT "id", "holidayDate", "name", "isPaid"
    FROM public."AttendanceHoliday"
    WHERE "holidayDate" >= ${startDate}
      AND "holidayDate" <= ${endDate}
    ORDER BY "holidayDate" ASC
  `;
}

async function getOvertimeApprovals(
  monthKey: string,
  db: PayrollQueryClient = prisma,
) {
  const { startDate, endDate } = getMonthBounds(monthKey);
  return db.$queryRaw<OvertimeApprovalRow[]>`
    SELECT
      "attendanceId",
      "status",
      "calculatedMinutes",
      "approvedMinutes"
    FROM public."AttendanceOvertimeApproval"
    WHERE "workDate" >= ${startDate}
      AND "workDate" <= ${endDate}
  `;
}

export async function getPayrollRun(
  monthKey: string,
  db: PayrollQueryClient = prisma,
) {
  const rows = await db.$queryRaw<PayrollRunSummary[]>`
    SELECT "id", "monthKey", "status", "finalizedAt", "finalizedByName"
    FROM public."PayrollRun"
    WHERE "monthKey" = ${monthKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getFinalizedPayrollItems(
  runId: string,
  db: PayrollQueryClient = prisma,
) {
  return db.$queryRaw<Array<PayrollSummaryRow & { paidLeaveDays: DecimalLike; payableDays: DecimalLike }>>`
    SELECT
      "id" AS "payrollItemId",
      "userId", "userName", "userEmail", "userRole",
      "monthlyBaseSalary", "monthlyAllowance", "monthlyDeduction",
      ("monthlyBaseSalary" + "monthlyAllowance") AS "totalMonthlyEarnings",
      "perDaySalary", "standardDailyMinutes",
      "overtimeHourlyRate", "fullDays", "halfDays",
      0 AS "unpaidShortDays", "paidLeaveDays",
      "paidSundayDays", "paidHolidayDays", "payableDays",
      "overtimeMinutes", 0 AS "todayWorkingMinutes", "grossSalary",
      "overtimePay", "approvedAdvance", "netPay",
      "paymentStatus"::text AS "paymentStatus", "paidAt", "paidByName",
      "paymentReference", "paymentNote", NULL AS "profileUpdatedAt"
    FROM public."PayrollRunItem"
    WHERE "payrollRunId" = ${runId}
    ORDER BY "userName" ASC
  `;
}

export async function getPayrollSummary(
  monthKey: string,
  options: { db?: PayrollQueryClient; reconcile?: boolean } = {},
) {
  const db = options.db ?? prisma;
  if (options.reconcile !== false) await markStaleAttendanceForReview();
  const { calendarDays, endDate } = getMonthBounds(monthKey);
  const users = await getPayrollUsers(db);
  const [attendanceRows, advances, leaves, revisions, holidays, approvals, payrollRun] =
    await Promise.all([
      getPayrollAttendanceRows(monthKey, db),
      getPayrollAdvanceRequests({ limit: 500 }, db),
      getPayrollLeaveRequests({ limit: 500 }, db),
      getSalaryRevisions(endDate, db),
      getPayrollHolidays(monthKey, db),
      getOvertimeApprovals(monthKey, db),
      getPayrollRun(monthKey, db),
    ]);

  if (payrollRun?.status === "FINALIZED") {
    const items = await getFinalizedPayrollItems(payrollRun.id, db);
    return {
      users,
      advances,
      leaves,
      holidays,
      overtimeCandidates: [] as PayrollOvertimeCandidate[],
      payrollRun,
      summary: items.map((item) => ({
        ...item,
        monthlyBaseSalary: toMoneyNumber(item.monthlyBaseSalary),
        monthlyAllowance: toMoneyNumber(item.monthlyAllowance),
        monthlyDeduction: toMoneyNumber(item.monthlyDeduction),
        totalMonthlyEarnings: toMoneyNumber(item.totalMonthlyEarnings),
        perDaySalary: toMoneyNumber(item.perDaySalary),
        overtimeHourlyRate: toMoneyNumber(item.overtimeHourlyRate),
        presentDays: Number(item.fullDays) + Number(item.halfDays) * 0.5,
        approvedPaidLeaveDays: toMoneyNumber(item.paidLeaveDays),
        calendarPayDays: toMoneyNumber(item.payableDays),
        grossSalary: toMoneyNumber(item.grossSalary),
        overtimePay: toMoneyNumber(item.overtimePay),
        approvedAdvance: toMoneyNumber(item.approvedAdvance),
        netPay: toMoneyNumber(item.netPay),
      })),
    };
  }

  const latestRevisionByUser = new Map<string, SalaryRevisionRow>();
  for (const revision of revisions) latestRevisionByUser.set(revision.userId, revision);
  const approvalsByAttendance = new Map(
    approvals.map((approval) => [approval.attendanceId, approval]),
  );
  const userNameById = new Map(users.map((user) => [user.userId, user.userName]));
  const accrualEndDate = getAccrualEndDate(monthKey);
  const accruedDates = accrualEndDate
    ? enumerateDates(`${monthKey}-01`, accrualEndDate)
    : [];
  const paidHolidayDates = new Set(
    holidays
      .filter((holiday) => holiday.isPaid && (!accrualEndDate || holiday.holidayDate <= accrualEndDate))
      .map((holiday) => holiday.holidayDate),
  );
  const overtimeCandidates: PayrollOvertimeCandidate[] = [];

  const attendanceByUser = new Map<string, PayrollAttendanceRow[]>();
  for (const row of attendanceRows) {
    const currentRows = attendanceByUser.get(row.userId) ?? [];
    currentRows.push(row);
    attendanceByUser.set(row.userId, currentRows);
  }

  const summary = users.map<PayrollSummaryRow>((user) => {
    const revision = latestRevisionByUser.get(user.userId);
    const monthlyBaseSalary = toMoneyNumber(
      revision?.monthlyBaseSalary ?? user.monthlyBaseSalary,
    );
    const monthlyAllowance = toMoneyNumber(
      revision?.monthlyAllowance ?? user.monthlyAllowance,
    );
    const monthlyDeduction = toMoneyNumber(
      revision?.monthlyDeduction ?? user.monthlyDeduction,
    );
    const totalMonthlyEarnings = monthlyBaseSalary + monthlyAllowance;
    const perDaySalary = calendarDays > 0 ? totalMonthlyEarnings / calendarDays : 0;
    const standardDailyMinutes = Math.max(
      60,
      Number(revision?.standardDailyMinutes ?? user.standardDailyMinutes ?? 480),
    );
    const fallbackHourlyRate = standardDailyMinutes > 0 ? perDaySalary / (standardDailyMinutes / 60) : 0;
    const overtimeHourlyRate =
      toMoneyNumber(revision?.overtimeHourlyRate ?? user.overtimeHourlyRate) ||
      fallbackHourlyRate;
    const userAttendance = attendanceByUser.get(user.userId) ?? [];
    const attendanceFractions = new Map<string, number>();
    let fullDays = 0;
    let halfDays = 0;
    let unpaidShortDays = 0;
    let overtimeMinutes = 0;

    for (const row of userAttendance) {
      if (row.status !== "COMPLETED" || !row.punchOutAt) continue;
      const minutes = Number(row.netWorkingMinutes ?? 0);
      if (minutes >= standardDailyMinutes) {
        fullDays += 1;
        attendanceFractions.set(row.workDate, 1);
      } else if (minutes >= Math.ceil(standardDailyMinutes / 2)) {
        halfDays += 1;
        attendanceFractions.set(row.workDate, 0.5);
      } else {
        unpaidShortDays += 1;
      }

      const calculatedMinutes = Math.max(0, minutes - standardDailyMinutes);
      if (calculatedMinutes > 0) {
        const approval = approvalsByAttendance.get(row.attendanceId);
        if (approval?.status === "APPROVED") {
          overtimeMinutes += Math.min(
            calculatedMinutes,
            Number(approval.approvedMinutes ?? 0),
          );
        } else {
          overtimeCandidates.push({
            attendanceId: row.attendanceId,
            userId: row.userId,
            userName: userNameById.get(row.userId) ?? user.userName,
            workDate: row.workDate,
            calculatedMinutes,
            status: approval?.status ?? "PENDING",
            approvedMinutes: Number(approval?.approvedMinutes ?? 0),
          });
        }
      }
    }

    const todayWorkDate = getIndiaWorkDate();
    const todayWorkingMinutes = Number(
      userAttendance.find((row) => row.workDate === todayWorkDate)
        ?.netWorkingMinutes ?? 0,
    );
    const approvedPaidLeaveDays = getApprovedPaidLeaveDaysForMonth(
      leaves,
      monthKey,
      user.userId,
      accrualEndDate,
      attendanceFractions,
      paidHolidayDates,
    );
    const approvedAdvance = getApprovedAdvanceForMonth(advances, monthKey, user.userId);
    const presentDays = fullDays + halfDays * 0.5;
    const paidSundayDays = accruedDates.filter((date) => {
      const isSunday = new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
      return isSunday && !attendanceFractions.has(date);
    }).length;
    const paidHolidayDays = Array.from(paidHolidayDates).filter((date) => {
      const isSunday = new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
      return !isSunday && !attendanceFractions.has(date);
    }).length;
    const calendarPayDays =
      presentDays + approvedPaidLeaveDays + paidSundayDays + paidHolidayDays;
    const grossSalary = calendarPayDays * perDaySalary;
    const overtimePay = (overtimeMinutes / 60) * overtimeHourlyRate;

    return {
      payrollItemId: null,
      userId: user.userId,
      userName: user.userName,
      userEmail: user.userEmail,
      userRole: user.userRole,
      monthlyBaseSalary,
      monthlyAllowance,
      monthlyDeduction,
      totalMonthlyEarnings,
      perDaySalary,
      standardDailyMinutes,
      overtimeHourlyRate,
      presentDays,
      fullDays,
      halfDays,
      unpaidShortDays,
      approvedPaidLeaveDays,
      paidSundayDays,
      paidHolidayDays,
      calendarPayDays,
      overtimeMinutes,
      todayWorkingMinutes,
      grossSalary,
      overtimePay,
      approvedAdvance,
      netPay: Math.max(0, grossSalary + overtimePay - approvedAdvance - monthlyDeduction),
      paymentStatus: "PENDING",
      paidAt: null,
      paidByName: null,
      paymentReference: null,
      paymentNote: null,
      profileUpdatedAt: user.profileUpdatedAt,
    };
  });

  return {
    users,
    advances,
    leaves,
    holidays,
    overtimeCandidates,
    payrollRun,
    summary,
  };
}

export async function getMyAdvanceRequests(userId: string) {
  return getPayrollAdvanceRequests({ userId, limit: 50 });
}

export async function getMyLeaveRequests(userId: string) {
  return getPayrollLeaveRequests({ userId, limit: 50 });
}

export function filterPayrollSummary(summary: PayrollSummaryRow[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return summary;

  return summary.filter((row) => {
    return [row.userName, row.userEmail, getEmployeeRoleLabel(row.userRole)]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export function filterPendingRows<T extends { status: string }>(rows: T[]) {
  return rows.filter((row) => row.status === "PENDING");
}

export function getSelectableUserIds(users: PayrollUserRow[]) {
  return users.map((user) => user.userId);
}

export function toSafeUserId(value: string, allowedUserIds: string[]) {
  return allowedUserIds.includes(value) ? value : null;
}

export function buildUserFilterClause(userIds: string[]) {
  return userIds.length ? Prisma.join(userIds) : Prisma.empty;
}
