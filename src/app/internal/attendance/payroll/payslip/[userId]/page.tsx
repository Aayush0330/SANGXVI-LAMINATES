import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { PrintPayslipButton } from "@/components/print-payslip-button";
import { checkPermission } from "@/lib/auth-guards";
import {
  formatDecimalDays,
  formatIndiaPayrollDateTime,
  formatRupees,
  getEmployeeRoleLabel,
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
} from "@/lib/attendance-payroll";

function monthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

export default async function PayslipPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams?: Promise<{ month?: string }> }) {
  const { hasAccess } = await checkPermission("view_payslips", "/internal/attendance/payroll/payslip");
  if (!hasAccess) return <AccessDeniedCard title="Payslip Access Denied" description="You do not have permission to view employee payslips." backHref="/internal/attendance/payroll" backLabel="Back to Payroll" />;
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const monthKey = isValidMonthKey(query?.month) ? query!.month! : getMonthKey();
  const payroll = await getPayrollSummary(monthKey);
  const row = payroll.summary.find((item) => item.userId === userId);
  if (!row) notFound();
  const finalized = payroll.payrollRun?.status === "FINALIZED";
  const details = [
    ["Monthly base salary", formatRupees(row.monthlyBaseSalary)],
    ["Monthly allowance", formatRupees(row.monthlyAllowance)],
    ["Total monthly earnings", formatRupees(row.totalMonthlyEarnings)],
    ["Salary per calendar day", formatRupees(row.perDaySalary)],
    ["Full / half days", `${row.fullDays} / ${row.halfDays}`],
    ["Paid leave days", formatDecimalDays(row.approvedPaidLeaveDays)],
    ["Paid Sundays / holidays", `${row.paidSundayDays} / ${row.paidHolidayDays}`],
    ["Total payable days", formatDecimalDays(row.calendarPayDays)],
    ["Gross salary", formatRupees(row.grossSalary)],
    ["Overtime", `${row.overtimeMinutes} min · ${formatRupees(row.overtimePay)}`],
    ["Advance deduction", formatRupees(row.approvedAdvance)],
    ["Fixed deduction", formatRupees(row.monthlyDeduction)],
  ];
  return <main className="mx-auto max-w-4xl p-4 sm:p-8 print:max-w-none print:p-0"><div className="mb-5 flex items-center justify-between print:hidden"><Link href={`/internal/attendance/payroll?month=${monthKey}`} className="text-sm font-black text-blue-600">Back to Payroll</Link><PrintPayslipButton /></div><article className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none"><header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Sanghvi ERP</p><h1 className="mt-3 text-4xl font-black">Employee Payslip</h1><p className="mt-2 font-bold text-slate-500">{monthLabel(monthKey)}</p></div><div className="text-right"><span className={`rounded-full px-4 py-2 text-xs font-black ${finalized ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{finalized ? "FINALIZED" : "ESTIMATE"}</span><p className="mt-3 text-xs font-bold text-slate-500">Payment: {row.paymentStatus.replaceAll("_", " ")}</p></div></header><section className="grid gap-5 border-b border-slate-200 py-7 sm:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Employee</p><p className="mt-2 text-xl font-black">{row.userName}</p><p className="mt-1 text-sm text-slate-500">{row.userEmail}</p></div><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Role</p><p className="mt-2 text-xl font-black">{getEmployeeRoleLabel(row.userRole)}</p></div></section><section className="divide-y divide-slate-100 py-4">{details.map(([label, value]) => <div key={label} className="flex justify-between gap-5 py-3 text-sm"><span className="font-bold text-slate-500">{label}</span><span className="text-right font-black">{value}</span></div>)}</section><footer className="mt-3 flex items-center justify-between rounded-2xl bg-slate-950 p-5 text-white"><span className="text-sm font-black uppercase tracking-[0.18em] text-slate-300">Net Pay</span><span className="text-3xl font-black">{formatRupees(row.netPay)}</span></footer>{finalized ? <div className="mt-5 rounded-2xl border border-slate-200 p-4 text-sm"><p className="font-black">Payment record</p><p className="mt-2 text-slate-500">Status: {row.paymentStatus.replaceAll("_", " ")} · Paid: {formatIndiaPayrollDateTime(row.paidAt)}</p><p className="mt-1 text-slate-500">By: {row.paidByName ?? "-"} · Reference: {row.paymentReference ?? "-"}</p>{row.paymentNote ? <p className="mt-1 text-slate-500">Note: {row.paymentNote}</p> : null}</div> : <p className="mt-5 text-center text-xs font-bold text-amber-700">Estimate only. Final values lock after payroll finalization.</p>}</article></main>;
}
