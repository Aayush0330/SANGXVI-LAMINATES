import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { getAppRolesFromUser } from "@/lib/user-role-utils";
import { getMonthKey, isValidMonthKey, type DecimalLike, toMoneyNumber } from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";

type Row = { name: string; email: string; phone: string | null; status: string; userRole: string; employeeCode: string | null; department: string | null; designation: string | null; employmentType: string | null; joiningDate: string | null; probationEndDate: string | null; reportingManagerName: string | null; lastWorkingDate: string | null; monthlyBaseSalary: DecimalLike; monthlyAllowance: DecimalLike; monthlyDeduction: DecimalLike; paymentStatus: string | null; netPay: DecimalLike; paidAt: Date | string | null; paymentReference: string | null };
function cell(value: unknown) { let text = String(value ?? ""); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }

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
  const table: unknown[][] = [["Month", "Employee", "Email", "Phone", "Account Status", "Role", "Employee Code", "Department", "Designation", "Employment Type", "Joining Date", "Probation End", "Reporting Manager", "Last Working Date", "Monthly Base", "Monthly Allowance", "Fixed Deduction", "Payroll Payment Status", "Net Pay", "Paid At", "Payment Reference"], ...rows.map((row) => [monthKey, row.name, row.email, row.phone, row.status, row.userRole, row.employeeCode, row.department, row.designation, row.employmentType, row.joiningDate, row.probationEndDate, row.reportingManagerName, row.lastWorkingDate, toMoneyNumber(row.monthlyBaseSalary).toFixed(2), toMoneyNumber(row.monthlyAllowance).toFixed(2), toMoneyNumber(row.monthlyDeduction).toFixed(2), row.paymentStatus, toMoneyNumber(row.netPay).toFixed(2), row.paidAt ? new Date(row.paidAt).toISOString() : "", row.paymentReference])];
  const csv = `\uFEFF${table.map((row) => row.map(cell).join(",")).join("\r\n")}`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hr-workforce-${monthKey}.csv"`, "Cache-Control": "no-store" } });
}
