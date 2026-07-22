import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import {
  formatRupees,
  getEmployeeRoleLabel,
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
} from "@/lib/attendance-payroll";

function label(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}
function tone(status: string) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (status === "FAILED" || status === "ON_HOLD") return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
}

export default async function PayslipsDirectoryPage({ searchParams }: { searchParams?: Promise<{ month?: string; q?: string }> }) {
  const { hasAccess } = await checkPermission("view_payslips", "/internal/attendance/payroll/payslips");
  if (!hasAccess) return <AccessDeniedCard title="Payslips Access Denied" description="You do not have permission to view employee payslips." backHref="/internal/dashboard" backLabel="Go to Dashboard" />;
  const query = await searchParams;
  const monthKey = isValidMonthKey(query?.month) ? query!.month! : getMonthKey();
  const search = String(query?.q ?? "").trim().toLowerCase();
  const payroll = await getPayrollSummary(monthKey);
  const finalized = payroll.payrollRun?.status === "FINALIZED";
  const rows = payroll.summary.filter((row) => !search || `${row.userName} ${row.userEmail} ${row.userRole}`.toLowerCase().includes(search));

  return <div className="space-y-5">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Payroll documents</p><h1 className="mt-2 text-3xl font-black text-slate-950 dark:text-white">Payslips</h1><p className="mt-2 text-sm text-slate-500">{label(monthKey)} · {finalized ? "Finalized" : "Estimate"}</p></div><Link href={`/internal/attendance/payroll?month=${monthKey}`} className="inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white">Open Payroll</Link></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><form className="grid gap-3 sm:grid-cols-[180px_1fr_auto]"><input type="month" name="month" defaultValue={monthKey} className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950" /><input name="q" defaultValue={query?.q ?? ""} placeholder="Search employee" className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950" /><button className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-black text-white dark:bg-white dark:text-slate-950">Apply</button></form></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-5 py-4">Employee</th><th className="px-4 py-4">Salary structure</th><th className="px-4 py-4">Attendance earnings</th><th className="px-4 py-4">Deductions</th><th className="px-4 py-4">Net</th><th className="px-4 py-4">Payment</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">No payslips found.</td></tr> : rows.map((row) => <tr key={row.userId}><td className="px-5 py-4"><p className="font-black">{row.userName}</p><p className="text-xs text-slate-400">{row.userEmail}<br />{getEmployeeRoleLabel(row.userRole)}</p></td><td className="px-4 py-4"><p className="font-black">{formatRupees(row.totalMonthlyEarnings)}</p><p className="text-xs text-slate-500">Base {formatRupees(row.monthlyBaseSalary)} + allowance {formatRupees(row.monthlyAllowance)}</p></td><td className="px-4 py-4 font-bold">{formatRupees(row.grossSalary + row.overtimePay)}</td><td className="px-4 py-4 font-bold text-rose-600">{formatRupees(row.approvedAdvance + row.monthlyDeduction)}</td><td className="px-4 py-4 font-black">{formatRupees(row.netPay)}</td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${tone(row.paymentStatus)}`}>{row.paymentStatus.replaceAll("_", " ")}</span></td><td className="px-5 py-4 text-right"><Link href={`/internal/attendance/payroll/payslip/${row.userId}?month=${monthKey}`} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-blue-600">View Payslip</Link></td></tr>)}</tbody></table></div></section>
  </div>;
}
