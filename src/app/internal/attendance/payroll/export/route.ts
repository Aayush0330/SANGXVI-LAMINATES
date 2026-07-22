import { NextRequest, NextResponse } from "next/server";
import {
  formatDecimalDays,
  formatIndiaPayrollDateTime,
  getEmployeeRoleLabel,
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
} from "@/lib/attendance-payroll";
import { hasPermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { getAppRolesFromUser } from "@/lib/user-role-utils";

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!hasPermission(getAppRolesFromUser(session.user), "manage_payroll")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const requestedMonth = request.nextUrl.searchParams.get("month");
  const monthKey = isValidMonthKey(requestedMonth) ? requestedMonth! : getMonthKey();
  const payroll = await getPayrollSummary(monthKey);
  const rows: Array<Array<string | number>> = [
    [
      "Month", "Payroll Status", "Employee", "Email", "Role",
      "Monthly Base", "Monthly Allowance", "Total Monthly Earnings",
      "Fixed Monthly Deduction", "Per Day", "Full Days", "Half Days",
      "Short Unpaid Days", "Paid Leave Days", "Paid Sundays", "Paid Holidays",
      "Total Payable Days", "Approved OT Minutes", "Gross Salary", "Overtime Pay",
      "Advance Deduction", "Net Pay", "Payment Status", "Paid At", "Paid By",
      "Payment Reference", "Payment Note",
    ],
    ...payroll.summary.map((row) => [
      monthKey,
      payroll.payrollRun?.status === "FINALIZED" ? "Finalized" : "Estimated",
      row.userName,
      row.userEmail,
      getEmployeeRoleLabel(row.userRole),
      row.monthlyBaseSalary.toFixed(2),
      row.monthlyAllowance.toFixed(2),
      row.totalMonthlyEarnings.toFixed(2),
      row.monthlyDeduction.toFixed(2),
      row.perDaySalary.toFixed(2),
      row.fullDays,
      row.halfDays,
      row.unpaidShortDays,
      formatDecimalDays(row.approvedPaidLeaveDays),
      row.paidSundayDays,
      row.paidHolidayDays,
      formatDecimalDays(row.calendarPayDays),
      row.overtimeMinutes,
      row.grossSalary.toFixed(2),
      row.overtimePay.toFixed(2),
      row.approvedAdvance.toFixed(2),
      row.netPay.toFixed(2),
      row.paymentStatus,
      formatIndiaPayrollDateTime(row.paidAt),
      row.paidByName ?? "",
      row.paymentReference ?? "",
      row.paymentNote ?? "",
    ]),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${monthKey}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
