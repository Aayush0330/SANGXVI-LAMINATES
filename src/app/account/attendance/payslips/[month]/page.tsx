import { notFound } from "next/navigation";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { PayslipDocument } from "@/components/payroll-presentation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  type DecimalLike,
  isValidMonthKey,
} from "@/lib/attendance-payroll";

type PayslipRow = {
  userName: string;
  userEmail: string;
  userRole: string;
  monthlyBaseSalary: DecimalLike;
  monthlyAllowance: DecimalLike;
  monthlyDeduction: DecimalLike;
  perDaySalary: DecimalLike;
  fullDays: number;
  halfDays: number;
  paidLeaveDays: DecimalLike;
  paidSundayDays: number;
  paidHolidayDays: number;
  payableDays: DecimalLike;
  overtimeMinutes: number;
  grossSalary: DecimalLike;
  overtimePay: DecimalLike;
  approvedAdvance: DecimalLike;
  netPay: DecimalLike;
  paymentStatus: string;
  paidAt: Date | string | null;
  paidByName: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  finalizedAt: Date | string | null;
};

export default async function MyPayslipDetailPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { currentUser, hasAccess } = await checkPermission(
    "view_own_payslips",
    "/account/attendance/payslips",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Payslip Not Available"
        description="You cannot view employee payslips."
        backHref="/account/attendance"
        backLabel="Back to Attendance"
      />
    );
  }

  const { month } = await params;
  if (!isValidMonthKey(month)) notFound();

  const rows = await prisma.$queryRaw<PayslipRow[]>`
    SELECT item."userName", item."userEmail", item."userRole", item."monthlyBaseSalary",
      item."monthlyAllowance", item."monthlyDeduction", item."perDaySalary", item."fullDays",
      item."halfDays", item."paidLeaveDays", item."paidSundayDays", item."paidHolidayDays",
      item."payableDays", item."overtimeMinutes", item."grossSalary", item."overtimePay",
      item."approvedAdvance", item."netPay", item."paymentStatus"::text AS "paymentStatus",
      item."paidAt", item."paidByName", item."paymentReference", item."paymentNote", run."finalizedAt"
    FROM public."PayrollRunItem" item
    INNER JOIN public."PayrollRun" run ON run."id" = item."payrollRunId"
    WHERE item."userId" = ${currentUser.id}
      AND run."monthKey" = ${month}
      AND run."status" = 'FINALIZED'
    LIMIT 1
  `;
  const row = rows[0];

  if (!row) notFound();

  return (
    <div className="min-h-screen bg-[#f4f6f9] px-3 pb-28 pt-4 sm:px-5 sm:pt-5 lg:px-7 lg:pb-8 lg:pt-7 dark:bg-slate-950">
      <PayslipDocument
        monthKey={month}
        finalized
        data={row}
        backHref="/account/attendance/payslips"
        backLabel="Back to My Payslips"
      />
    </div>
  );
}
