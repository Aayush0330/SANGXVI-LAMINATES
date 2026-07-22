import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { type DecimalLike, formatIndiaPayrollDateTime, formatRupees } from "@/lib/attendance-payroll";

type PayslipRow = {
  monthKey: string;
  netPay: DecimalLike;
  paymentStatus: string;
  paidAt: Date | string | null;
  paymentReference: string | null;
  finalizedAt: Date | string | null;
};

function label(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}
function tone(status: string) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (status === "FAILED" || status === "ON_HOLD") return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
}

export default async function MyPayslipsPage() {
  const { currentUser, hasAccess } = await checkPermission("view_own_payslips", "/account/attendance/payslips");
  if (!hasAccess) return <AccessDeniedCard title="Payslips Not Available" description="You do not have access to employee payslips." backHref="/account/attendance" backLabel="Back to Attendance" />;
  const rows = await prisma.$queryRaw<PayslipRow[]>`
    SELECT run."monthKey", item."netPay", item."paymentStatus"::text AS "paymentStatus",
      item."paidAt", item."paymentReference", run."finalizedAt"
    FROM public."PayrollRunItem" item
    INNER JOIN public."PayrollRun" run ON run."id" = item."payrollRunId"
    WHERE item."userId" = ${currentUser.id} AND run."status" = 'FINALIZED'
    ORDER BY run."monthKey" DESC
  `;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950"><div className="mx-auto max-w-5xl space-y-6"><section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">Payroll Self-Service</p><h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">My Payslips</h1><p className="mt-2 text-sm text-slate-500">Finalized monthly payslips and salary payment status.</p></div><Link href="/account/attendance" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black dark:border-slate-700 dark:text-white">Back to Attendance</Link></div></section><section className="grid gap-4 md:grid-cols-2">{rows.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">No finalized payslips are available yet.</div> : rows.map((row) => <article key={row.monthKey} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Salary month</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{label(row.monthKey)}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${tone(row.paymentStatus)}`}>{row.paymentStatus.replaceAll("_", " ")}</span></div><p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Net pay</p><p className="mt-2 text-3xl font-black text-emerald-700 dark:text-emerald-300">{formatRupees(row.netPay)}</p><p className="mt-3 text-xs text-slate-500">Paid: {formatIndiaPayrollDateTime(row.paidAt)}{row.paymentReference ? ` · ${row.paymentReference}` : ""}</p><Link href={`/account/attendance/payslips/${row.monthKey}`} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">Open Payslip</Link></article>)}</section></div></main>;
}
