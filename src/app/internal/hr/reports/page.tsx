import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { type DecimalLike, formatRupees, getMonthKey, isValidMonthKey } from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";

type CountRow = { count: bigint };
type DepartmentRow = { department: string; count: bigint };
type LifecycleRow = { eventType: string; count: bigint };
type PayrollTotals = { employeeCount: bigint; netPay: DecimalLike; paidCount: bigint; pendingCount: bigint; paidAmount: DecimalLike; pendingAmount: DecimalLike };

function label(month: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00.000Z`)); }

export default async function HrReportsPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const { hasAccess } = await checkPermission("view_hr_reports", "/internal/hr/reports");
  if (!hasAccess) return <AccessDeniedCard title="HR Reports Access Denied" description="You do not have permission to view HR and payroll reports." backHref="/internal/dashboard" backLabel="Go to Dashboard" />;
  const params = await searchParams;
  const monthKey = isValidMonthKey(params?.month) ? params!.month! : getMonthKey();
  const startDate = `${monthKey}-01`;
  const [year, month] = monthKey.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const [headcountRows, activeRows, departmentRows, lifecycleRows, leaveRows, correctionRows, payrollRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count" FROM public."User" u
      WHERE u."role"::text <> 'DEALER' OR EXISTS (SELECT 1 FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER')
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count" FROM public."User" u
      WHERE u."status" = 'ACTIVE'::public."UserStatus"
        AND (u."role"::text <> 'DEALER' OR EXISTS (SELECT 1 FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER'))
    `,
    prisma.$queryRaw<DepartmentRow[]>`
      SELECT COALESCE(NULLIF(TRIM(profile."department"), ''), 'Not assigned') AS "department", COUNT(*)::bigint AS "count"
      FROM public."User" u LEFT JOIN public."EmployeeProfile" profile ON profile."userId" = u."id"
      WHERE u."role"::text <> 'DEALER' OR EXISTS (SELECT 1 FROM public."UserRoleAssignment" a WHERE a."userId" = u."id" AND a."role"::text <> 'DEALER')
      GROUP BY 1 ORDER BY "count" DESC, "department" ASC
    `,
    prisma.$queryRaw<LifecycleRow[]>`
      SELECT "eventType"::text AS "eventType", COUNT(*)::bigint AS "count"
      FROM public."EmployeeLifecycleEvent"
      WHERE "effectiveDate" >= ${startDate} AND "effectiveDate" <= ${endDate}
      GROUP BY "eventType" ORDER BY "count" DESC
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count" FROM public."AttendanceLeaveRequest"
      WHERE "startDate" <= ${endDate} AND "endDate" >= ${startDate}
        AND "status" = 'APPROVED'::public."AttendanceRequestStatus"
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS "count" FROM public."AttendanceCorrectionRequest"
      WHERE "workDate" >= ${startDate} AND "workDate" <= ${endDate}
    `,
    prisma.$queryRaw<PayrollTotals[]>`
      SELECT COUNT(item."id")::bigint AS "employeeCount", COALESCE(SUM(item."netPay"), 0) AS "netPay",
        COUNT(item."id") FILTER (WHERE item."paymentStatus" = 'PAID'::public."PayrollPaymentStatus")::bigint AS "paidCount",
        COUNT(item."id") FILTER (WHERE item."paymentStatus" <> 'PAID'::public."PayrollPaymentStatus")::bigint AS "pendingCount",
        COALESCE(SUM(item."netPay") FILTER (WHERE item."paymentStatus" = 'PAID'::public."PayrollPaymentStatus"), 0) AS "paidAmount",
        COALESCE(SUM(item."netPay") FILTER (WHERE item."paymentStatus" <> 'PAID'::public."PayrollPaymentStatus"), 0) AS "pendingAmount"
      FROM public."PayrollRun" run LEFT JOIN public."PayrollRunItem" item ON item."payrollRunId" = run."id"
      WHERE run."monthKey" = ${monthKey} AND run."status" = 'FINALIZED'
    `,
  ]);
  const payroll = payrollRows[0] ?? { employeeCount: BigInt(0), netPay: 0, paidCount: BigInt(0), pendingCount: BigInt(0), paidAmount: 0, pendingAmount: 0 };
  const metrics = [
    ["Total employees", String(Number(headcountRows[0]?.count ?? 0))],
    ["Active employees", String(Number(activeRows[0]?.count ?? 0))],
    ["Approved leave records", String(Number(leaveRows[0]?.count ?? 0))],
    ["Attendance corrections", String(Number(correctionRows[0]?.count ?? 0))],
    ["Finalized payroll", formatRupees(payroll.netPay)],
    ["Pending payment", formatRupees(payroll.pendingAmount)],
  ];

  return <div className="space-y-6"><section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-600">HR Analytics</p><h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">HR & Payroll Reports</h1><p className="mt-2 text-sm text-slate-500">Headcount, lifecycle, leave, corrections and payment status for {label(monthKey)}.</p></div><div className="flex flex-wrap gap-3"><Link href="/internal/hr" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black dark:border-slate-700 dark:text-white">HR Center</Link><Link href={`/internal/hr/reports/export?month=${monthKey}`} className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Export CSV</Link></div></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><form className="flex flex-col gap-3 sm:flex-row"><input type="month" name="month" defaultValue={monthKey} className="h-11 rounded-xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white">Open Month</button></form></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{metrics.map(([key, value]) => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">{key}</p><p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p></div>)}</section>
    <section className="grid gap-5 lg:grid-cols-3"><ReportCard title="Department Headcount" rows={departmentRows.map((row) => [row.department, Number(row.count)])} /><ReportCard title="Lifecycle Events" rows={lifecycleRows.map((row) => [row.eventType.replaceAll("_", " "), Number(row.count)])} /><div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Payroll Payment</p><div className="mt-5 space-y-4"><Metric label="Employees" value={String(Number(payroll.employeeCount))} /><Metric label="Paid" value={`${Number(payroll.paidCount)} · ${formatRupees(payroll.paidAmount)}`} /><Metric label="Pending / Other" value={`${Number(payroll.pendingCount)} · ${formatRupees(payroll.pendingAmount)}`} /><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Number(payroll.employeeCount) ? Math.round((Number(payroll.paidCount) / Number(payroll.employeeCount)) * 100) : 0}%` }} /></div><p className="text-xs text-slate-500">{Number(payroll.employeeCount) ? Math.round((Number(payroll.paidCount) / Number(payroll.employeeCount)) * 100) : 0}% payments completed</p></div></div></section>
  </div>;
}
function ReportCard({ title, rows }: { title: string; rows: [string, number][] }) { const total = rows.reduce((sum, row) => sum + row[1], 0); return <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{title}</p><div className="mt-5 space-y-3">{rows.length === 0 ? <p className="text-sm text-slate-500">No records for this month.</p> : rows.map(([name, count]) => <div key={name}><div className="flex justify-between text-sm"><span className="font-bold text-slate-600 dark:text-slate-300">{name}</span><span className="font-black dark:text-white">{count}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${total ? Math.max(5, Math.round((count / total) * 100)) : 0}%` }} /></div></div>)}</div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-sm font-semibold text-slate-500">{label}</span><span className="text-sm font-black text-slate-950 dark:text-white">{value}</span></div>; }
