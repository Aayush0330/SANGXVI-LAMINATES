import { notFound } from "next/navigation";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { PayslipDocument } from "@/components/payroll-presentation";
import { checkPermission } from "@/lib/auth-guards";
import {
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
} from "@/lib/attendance-payroll";

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ month?: string }>;
}) {
  const { hasAccess } = await checkPermission(
    "view_payslips",
    "/internal/attendance/payroll/payslip",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Payslip Access Denied"
        description="You do not have permission to view employee payslips."
        backHref="/internal/attendance/payroll"
        backLabel="Back to Payroll"
      />
    );
  }

  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const monthKey = isValidMonthKey(query?.month)
    ? query!.month!
    : getMonthKey();
  const payroll = await getPayrollSummary(monthKey);
  const row = payroll.summary.find((item) => item.userId === userId);

  if (!row) notFound();

  const finalized = payroll.payrollRun?.status === "FINALIZED";

  return (
    <PayslipDocument
      monthKey={monthKey}
      finalized={finalized}
      backHref={`/internal/attendance/payroll?month=${monthKey}`}
      backLabel="Back to Payroll"
      data={{
        userName: row.userName,
        userEmail: row.userEmail,
        userRole: row.userRole,
        monthlyBaseSalary: row.monthlyBaseSalary,
        monthlyAllowance: row.monthlyAllowance,
        monthlyDeduction: row.monthlyDeduction,
        perDaySalary: row.perDaySalary,
        fullDays: row.fullDays,
        halfDays: row.halfDays,
        paidLeaveDays: row.approvedPaidLeaveDays,
        paidSundayDays: row.paidSundayDays,
        paidHolidayDays: row.paidHolidayDays,
        payableDays: row.calendarPayDays,
        overtimeMinutes: row.overtimeMinutes,
        grossSalary: row.grossSalary,
        overtimePay: row.overtimePay,
        approvedAdvance: row.approvedAdvance,
        netPay: row.netPay,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt,
        paidByName: row.paidByName,
        paymentReference: row.paymentReference,
        paymentNote: row.paymentNote,
        finalizedAt: payroll.payrollRun?.finalizedAt ?? null,
      }}
    />
  );
}
