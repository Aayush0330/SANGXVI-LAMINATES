import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  PaymentStatusBadge,
  PayrollMetricCard,
  formatPayrollMonthLabel,
} from "@/components/payroll-presentation";
import { checkPermission } from "@/lib/auth-guards";
import {
  formatRupees,
  getEmployeeRoleLabel,
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
} from "@/lib/attendance-payroll";

export default async function PayslipsDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; q?: string }>;
}) {
  const { hasAccess } = await checkPermission(
    "view_payslips",
    "/internal/attendance/payroll/payslips",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Payslips Access Denied"
        description="You do not have permission to view employee payslips."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const query = await searchParams;
  const monthKey = isValidMonthKey(query?.month)
    ? query!.month!
    : getMonthKey();
  const search = String(query?.q ?? "").trim().toLowerCase();
  const payroll = await getPayrollSummary(monthKey);
  const finalized = payroll.payrollRun?.status === "FINALIZED";
  const rows = payroll.summary.filter(
    (row) =>
      !search ||
      `${row.userName} ${row.userEmail} ${row.userRole}`
        .toLowerCase()
        .includes(search),
  );
  const totalNet = rows.reduce((sum, row) => sum + row.netPay, 0);
  const totalDeductions = rows.reduce(
    (sum, row) => sum + row.approvedAdvance + row.monthlyDeduction,
    0,
  );
  const paidCount = rows.filter(
    (row) => row.paymentStatus === "PAID",
  ).length;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-7 dark:border-white/10 dark:bg-slate-900">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-3xl dark:bg-violet-500/10"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
              Payroll documents
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl dark:text-white">
              Payslip Directory
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              Review employee salary statements, payment status and printable
              month-end payroll documents.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/internal/attendance/payroll?month=${monthKey}`}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white shadow-[0_8px_20px_rgba(37,99,235,0.16)] transition hover:bg-blue-700"
              >
                Open Payroll
              </Link>
              <Link
                href={`/internal/attendance/summary?month=${monthKey}`}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
              >
                Attendance Summary
              </Link>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 xl:w-[380px] dark:border-white/10 dark:bg-white/[0.035]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">
                  Document period
                </p>
                <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                  {formatPayrollMonthLabel(monthKey)}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
                  finalized
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                }`}
              >
                {finalized ? "Finalized" : "Estimate"}
              </span>
            </div>

            <form className="mt-4 grid gap-2 sm:grid-cols-[150px_1fr_auto] xl:grid-cols-[145px_1fr_auto]">
              <input
                aria-label="Payslip month"
                type="month"
                name="month"
                defaultValue={monthKey}
                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
              />
              <input
                aria-label="Search employee"
                name="q"
                defaultValue={query?.q ?? ""}
                placeholder="Search employee"
                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
              />
              <button className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700">
                Apply
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PayrollMetricCard
          label="Documents"
          value={rows.length.toLocaleString("en-IN")}
          helper={finalized ? "Finalized payslips" : "Current estimates"}
          tone="blue"
        />
        <PayrollMetricCard
          label="Net Payroll"
          value={formatRupees(totalNet)}
          helper="Current filtered total"
          tone="emerald"
        />
        <PayrollMetricCard
          label="Deductions"
          value={formatRupees(totalDeductions)}
          helper="Advances plus fixed"
          tone="rose"
        />
        <PayrollMetricCard
          label="Payments"
          value={`${paidCount}/${rows.length}`}
          helper={finalized ? "Marked as paid" : "Available after finalization"}
          tone="violet"
        />
      </section>

      {!finalized ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/[0.08] dark:text-amber-200">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          These documents are payroll estimates. Values become official and
          payment controls activate after finalization.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
              Employee statements
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              {formatPayrollMonthLabel(monthKey)}
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {rows.length} results
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-black text-slate-800 dark:text-slate-200">
              No payslips found
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Try another employee name or reporting month.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 bg-slate-50/60 p-3 sm:p-4 xl:grid-cols-2 dark:bg-slate-950/35">
            {rows.map((row) => {
              const deductions =
                row.approvedAdvance + row.monthlyDeduction;
              const earnings = row.grossSalary + row.overtimePay;

              return (
                <article
                  key={row.userId}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 transition hover:border-blue-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-400/30 dark:hover:shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950 dark:text-white">
                        {row.userName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                        {row.userEmail}
                      </p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {getEmployeeRoleLabel(row.userRole)}
                      </p>
                    </div>
                    <PaymentStatusBadge status={row.paymentStatus} />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [
                        "Structure",
                        formatRupees(row.totalMonthlyEarnings),
                        "text-slate-900 dark:text-white",
                      ],
                      [
                        "Earned",
                        formatRupees(earnings),
                        "text-blue-700 dark:text-blue-300",
                      ],
                      [
                        "Deductions",
                        formatRupees(deductions),
                        "text-rose-700 dark:text-rose-300",
                      ],
                      [
                        "Net Pay",
                        formatRupees(row.netPay),
                        "text-emerald-700 dark:text-emerald-300",
                      ],
                    ].map(([label, value, tone]) => (
                      <div
                        key={label}
                        className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]"
                      >
                        <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                          {label}
                        </p>
                        <p className={`mt-1.5 text-xs font-black ${tone}`}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
                    <p className="text-[10px] font-semibold text-slate-400">
                      {row.fullDays} full · {row.halfDays} half ·{" "}
                      {row.overtimeMinutes} OT min
                    </p>
                    <Link
                      href={`/internal/attendance/payroll/payslip/${row.userId}?month=${monthKey}`}
                      className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-black text-white transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
                    >
                      {finalized ? "View Payslip" : "Preview Payslip"}
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14M14 7l5 5-5 5" />
                      </svg>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
