import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { getAppRolesFromUser } from "@/lib/user-role-utils";
import { getMonthKey, isValidMonthKey, type DecimalLike, toMoneyNumber } from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";
import { createReportDownloadResponse, getReportFormat } from "@/lib/report-export";

type Row = { name: string; email: string; phone: string | null; status: string; userRole: string; employeeCode: string | null; department: string | null; designation: string | null; employmentType: string | null; joiningDate: string | null; probationEndDate: string | null; reportingManagerName: string | null; lastWorkingDate: string | null; monthlyBaseSalary: DecimalLike; monthlyAllowance: DecimalLike; monthlyDeduction: DecimalLike; paymentStatus: string | null; netPay: DecimalLike; paidAt: Date | string | null; paymentReference: string | null };
export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!hasPermission(getAppRolesFromUser(session.user), "view_hr_reports")) return new NextResponse("Forbidden", { status: 403 });
  const requested = request.nextUrl.searchParams.get("month");
  const monthKey = isValidMonthKey(requested) ? requested! : getMonthKey();
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u."name", u."email", u."phone", u."status"::text AS "status",
      COALESCE((SELECT a."role"::text FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER' ORDER BY a."isPrimary" DESC, a."createdAt" ASC LIMIT 1), NULLIF(u."role"::text, 'DEALER')) AS "userRole",
      profile."employeeCode", profile."department", profile."designation", profile."employmentType"::text AS "employmentType",
      profile."joiningDate", profile."probationEndDate", profile."reportingManagerName", profile."lastWorkingDate",
      COALESCE(pay."monthlyBaseSalary", 0) AS "monthlyBaseSalary", COALESCE(pay."monthlyAllowance", 0) AS "monthlyAllowance",
      COALESCE(pay."monthlyDeduction", 0) AS "monthlyDeduction", item."paymentStatus"::text AS "paymentStatus",
      item."netPay", item."paidAt", item."paymentReference"
    FROM public."User" u
    LEFT JOIN public."EmployeeProfile" profile ON profile."userId" = u."id"
    LEFT JOIN public."AttendancePayProfile" pay ON pay."userId" = u."id"
    LEFT JOIN public."PayrollRun" run ON run."monthKey" = ${monthKey} AND run."status" = 'FINALIZED'
    LEFT JOIN public."PayrollRunItem" item ON item."payrollRunId" = run."id" AND item."userId" = u."id"
    WHERE u."role"::text <> 'DEALER' OR EXISTS (SELECT 1 FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER')
    ORDER BY u."name" ASC
  `;
  const columns = ["Month", "Employee", "Email", "Phone", "Account Status", "Role", "Employee Code", "Department", "Designation", "Employment Type", "Joining Date", "Probation End", "Reporting Manager", "Last Working Date", "Monthly Base", "Monthly Allowance", "Fixed Deduction", "Payroll Payment Status", "Net Pay", "Paid At", "Payment Reference"];
  const reportRows = rows.map((row) => [monthKey, row.name, row.email, row.phone, row.status, row.userRole, row.employeeCode, row.department, row.designation, row.employmentType, row.joiningDate, row.probationEndDate, row.reportingManagerName, row.lastWorkingDate, toMoneyNumber(row.monthlyBaseSalary), toMoneyNumber(row.monthlyAllowance), toMoneyNumber(row.monthlyDeduction), row.paymentStatus, toMoneyNumber(row.netPay), row.paidAt ? new Date(row.paidAt).toISOString() : "", row.paymentReference]);
  return createReportDownloadResponse(
    getReportFormat(request.nextUrl.searchParams.get("format")),
    {
      title: "HR and Workforce Report",
      subtitle: `Month: ${monthKey}`,
      fileName: `hr-workforce-${monthKey}`,
      columns,
      rows: reportRows,
    },
  );
}
