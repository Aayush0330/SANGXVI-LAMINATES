import Link from "next/link";
import { PrintPayslipButton } from "@/components/print-payslip-button";
import {
  type DecimalLike,
  formatDecimalDays,
  formatIndiaPayrollDateTime,
  formatRupees,
  getEmployeeRoleLabel,
  toMoneyNumber,
} from "@/lib/attendance-payroll";

export type PayrollTone =
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "slate";

export type PayslipPresentationData = {
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

export function formatPayrollMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

export function PayrollIcon({
  tone,
  className = "h-5 w-5",
}: {
  tone: PayrollTone;
  className?: string;
}) {
  const commonProps = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (tone === "emerald") {
    return (
      <svg {...commonProps}>
        <path d="m5 12 4 4L19 6" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }

  if (tone === "amber") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (tone === "rose") {
    return (
      <svg {...commonProps}>
        <path d="M12 8v5M12 17h.01" />
        <path d="M10.2 4.7 3.4 17a2 2 0 0 0 1.8 3h13.6a2 2 0 0 0 1.8-3L13.8 4.7a2 2 0 0 0-3.6 0Z" />
      </svg>
    );
  }

  if (tone === "violet") {
    return (
      <svg {...commonProps}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    );
  }

  if (tone === "slate") {
    return (
      <svg {...commonProps}>
        <path d="M4 6h16M7 3v6M17 3v6M5 10h14v10H5z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18M8 15h2" />
    </svg>
  );
}

export function PayrollMetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: PayrollTone;
}) {
  const classes = {
    blue: {
      icon: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
      value: "text-blue-700 dark:text-blue-300",
      accent: "bg-blue-500",
    },
    emerald: {
      icon:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      value: "text-emerald-700 dark:text-emerald-300",
      accent: "bg-emerald-500",
    },
    amber: {
      icon:
        "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      value: "text-amber-700 dark:text-amber-300",
      accent: "bg-amber-500",
    },
    rose: {
      icon: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
      value: "text-rose-700 dark:text-rose-300",
      accent: "bg-rose-500",
    },
    violet: {
      icon:
        "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
      value: "text-violet-700 dark:text-violet-300",
      accent: "bg-violet-500",
    },
    slate: {
      icon: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
      value: "text-slate-800 dark:text-slate-100",
      accent: "bg-slate-400",
    },
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
      <span className={`absolute inset-y-0 left-0 w-0.5 ${classes.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p
            className={`mt-2 truncate text-2xl font-black tracking-tight ${classes.value}`}
          >
            {value}
          </p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${classes.icon}`}
        >
          <PayrollIcon tone={tone} />
        </span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">{helper}</p>
    </article>
  );
}

export function PaymentStatusBadge({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const statusClass =
    status === "PAID"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
      : status === "FAILED" || status === "ON_HOLD"
        ? "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20"
        : status === "PROCESSING"
          ? "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20"
          : "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ring-1 ${statusClass} ${className}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function BreakdownRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-300"
        : "text-slate-900 dark:text-white";

  return (
    <div className="flex items-center justify-between gap-5 border-b border-slate-100 py-3 last:border-b-0 dark:border-white/10">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className={`text-right text-sm font-black ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

export function PayslipDocument({
  monthKey,
  finalized,
  data,
  backHref,
  backLabel,
}: {
  monthKey: string;
  finalized: boolean;
  data: PayslipPresentationData;
  backHref: string;
  backLabel: string;
}) {
  const totalDeductions =
    toMoneyNumber(data.approvedAdvance) +
    toMoneyNumber(data.monthlyDeduction);
  const totalEarnings =
    toMoneyNumber(data.grossSalary) + toMoneyNumber(data.overtimePay);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {backLabel}
        </Link>
        <PrintPayslipButton />
      </div>

      <article className="payslip-print-surface overflow-hidden rounded-[30px] border border-slate-200/90 bg-white text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900 dark:text-white print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400" />

        <div className="p-5 sm:p-8 lg:p-10 print:p-7">
          <header className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-7 sm:flex-row sm:items-start dark:border-white/10">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white dark:bg-blue-600">
                  S
                </span>
                <div>
                  <p className="text-sm font-black tracking-tight text-slate-950 dark:text-white">
                    Sanghvi ERP
                  </p>
                  <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Payroll Operations
                  </p>
                </div>
              </div>

              <h1 className="mt-7 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                Employee Payslip
              </h1>
              <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                Pay period · {formatPayrollMonthLabel(monthKey)}
              </p>
            </div>

            <div className="sm:text-right">
              <span
                className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                  finalized
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                }`}
              >
                {finalized ? "Finalized" : "Estimate"}
              </span>
              <div className="mt-3">
                <PaymentStatusBadge status={data.paymentStatus} />
              </div>
              <p className="mt-3 text-[10px] font-bold text-slate-400">
                Finalized {formatIndiaPayrollDateTime(data.finalizedAt)}
              </p>
            </div>
          </header>

          <section className="grid gap-4 border-b border-slate-200 py-7 sm:grid-cols-2 dark:border-white/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Employee
              </p>
              <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                {data.userName}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {data.userEmail}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Position
              </p>
              <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                {getEmployeeRoleLabel(data.userRole)}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Standard payroll cycle
              </p>
            </div>
          </section>

          <section className="grid gap-3 py-7 sm:grid-cols-3">
            <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/[0.08]">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
                Total earnings
              </p>
              <p className="mt-2 text-xl font-black text-blue-700 dark:text-blue-200">
                {formatRupees(totalEarnings)}
              </p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/[0.08]">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-600 dark:text-rose-300">
                Total deductions
              </p>
              <p className="mt-2 text-xl font-black text-rose-700 dark:text-rose-200">
                {formatRupees(totalDeductions)}
              </p>
            </div>
            <div className="payslip-print-inverse rounded-2xl bg-slate-950 p-4 text-white dark:bg-blue-600">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                Net pay
              </p>
              <p className="mt-2 text-xl font-black text-white">
                {formatRupees(data.netPay)}
              </p>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 dark:border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                Earnings breakdown
              </p>
              <div className="mt-2">
                <BreakdownRow
                  label="Monthly base salary"
                  value={formatRupees(data.monthlyBaseSalary)}
                />
                <BreakdownRow
                  label="Monthly allowance"
                  value={formatRupees(data.monthlyAllowance)}
                />
                <BreakdownRow
                  label="Attendance-linked gross"
                  value={formatRupees(data.grossSalary)}
                />
                <BreakdownRow
                  label={`Overtime · ${data.overtimeMinutes} min`}
                  value={formatRupees(data.overtimePay)}
                  tone="positive"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 dark:border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-300">
                Deduction breakdown
              </p>
              <div className="mt-2">
                <BreakdownRow
                  label="Advance recovery"
                  value={formatRupees(data.approvedAdvance)}
                  tone="negative"
                />
                <BreakdownRow
                  label="Fixed monthly deduction"
                  value={formatRupees(data.monthlyDeduction)}
                  tone="negative"
                />
                <BreakdownRow
                  label="Total deductions"
                  value={formatRupees(totalDeductions)}
                  tone="negative"
                />
                <BreakdownRow
                  label="Salary per calendar day"
                  value={formatRupees(data.perDaySalary)}
                />
              </div>
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-slate-200 p-4 sm:p-5 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
                Attendance contribution
              </p>
              <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                {formatDecimalDays(data.payableDays)} payable days
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Full Days", String(data.fullDays)],
                ["Half Days", String(data.halfDays)],
                ["Paid Leave", formatDecimalDays(data.paidLeaveDays)],
                ["Paid Sundays", String(data.paidSundayDays)],
                ["Paid Holidays", String(data.paidHolidayDays)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-slate-50 p-3 text-center dark:bg-white/[0.04]"
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1.5 text-sm font-black text-slate-900 dark:text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <footer className="payslip-print-inverse mt-5 flex flex-col justify-between gap-3 rounded-2xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center dark:bg-blue-600">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                Final take-home salary
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Earnings less approved deductions
              </p>
            </div>
            <p className="text-3xl font-black tracking-tight text-white">
              {formatRupees(data.netPay)}
            </p>
          </footer>

          {finalized ? (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm dark:border-white/10 dark:bg-white/[0.035]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Payment record
                  </p>
                  <p className="mt-1 font-black text-slate-900 dark:text-white">
                    {data.paymentStatus.replaceAll("_", " ")}
                  </p>
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {formatIndiaPayrollDateTime(data.paidAt)}
                </p>
              </div>
              <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2 dark:text-slate-400">
                <p>Recorded by: {data.paidByName ?? "Not recorded"}</p>
                <p className="sm:text-right">
                  Reference: {data.paymentReference ?? "Not added"}
                </p>
              </div>
              {data.paymentNote ? (
                <p className="mt-2 border-t border-slate-200 pt-2 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Note: {data.paymentNote}
                </p>
              ) : null}
            </section>
          ) : (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/[0.08] dark:text-amber-200">
              Estimate only. Values lock after monthly payroll finalization.
            </div>
          )}

          <p className="mt-6 text-center text-[10px] font-semibold leading-5 text-slate-400">
            This system-generated payslip is based on finalized attendance,
            approved leave, overtime and recorded payroll deductions.
          </p>
        </div>
      </article>
    </div>
  );
}
