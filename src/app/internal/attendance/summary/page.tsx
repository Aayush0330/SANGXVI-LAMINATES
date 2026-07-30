import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import {
  formatRupees,
  getMonthBounds,
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
} from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";

type SummaryTone =
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "slate";

function getMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

function formatAttendanceTime(value?: Date | null) {
  if (!value) return "Missing";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function formatWorkDate(value: Date | string) {
  const date =
    value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function SummaryIcon({ tone }: { tone: SummaryTone }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    className: "h-5 w-5",
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
      <path d="M5 20V9l7-5 7 5v11" />
      <path d="M9 20v-6h6v6M3 20h18" />
    </svg>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: SummaryTone;
}) {
  const classes = {
    blue: {
      icon: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
      value: "text-blue-700 dark:text-blue-300",
      accent: "bg-blue-500",
    },
    emerald: {
      icon: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      value: "text-emerald-700 dark:text-emerald-300",
      accent: "bg-emerald-500",
    },
    amber: {
      icon: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      value: "text-amber-700 dark:text-amber-300",
      accent: "bg-amber-500",
    },
    rose: {
      icon: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
      value: "text-rose-700 dark:text-rose-300",
      accent: "bg-rose-500",
    },
    violet: {
      icon: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
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
          <SummaryIcon tone={tone} />
        </span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">{helper}</p>
    </article>
  );
}

function ReadinessBadge({ needsReview }: { needsReview: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
        needsReview
          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
      }`}
    >
      {needsReview ? "Needs review" : "Payroll ready"}
    </span>
  );
}

export default async function AttendanceSummaryPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const { hasAccess } = await checkPermission(
    "view_attendance_summary",
    "/internal/attendance/summary",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Attendance Summary Access Denied"
        description="You do not have permission to view payroll attendance summaries."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const query = await searchParams;
  const monthKey = isValidMonthKey(query?.month)
    ? query!.month!
    : getMonthKey();
  const { startDate, endDate } = getMonthBounds(monthKey);
  const [payroll, incompleteRows] = await Promise.all([
    getPayrollSummary(monthKey),
    prisma.officeAttendance.findMany({
      where: {
        workDate: { gte: startDate, lte: endDate },
        OR: [{ status: { not: "COMPLETED" } }, { punchOutAt: null }],
      },
      select: {
        id: true,
        workDate: true,
        status: true,
        punchInAt: true,
        punchOutAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ workDate: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
  ]);

  const totalEmployees = payroll.summary.length;
  const presentDays = payroll.summary.reduce(
    (sum, row) => sum + row.presentDays,
    0,
  );
  const shortDays = payroll.summary.reduce(
    (sum, row) => sum + row.unpaidShortDays,
    0,
  );
  const pendingOvertime = payroll.overtimeCandidates.filter(
    (row) => row.status === "PENDING",
  ).length;
  const salaryImpact = payroll.summary.reduce(
    (sum, row) => sum + row.perDaySalary * row.unpaidShortDays,
    0,
  );
  const payrollReady = payroll.summary.filter(
    (row) => row.monthlyBaseSalary > 0 && row.unpaidShortDays === 0,
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
              Payroll control layer
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl dark:text-white">
              Attendance Summary
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              Review payroll-impacting attendance, missing punches and
              month-end exceptions for {getMonthLabel(monthKey)}.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/internal/attendance"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
              >
                Team Attendance
              </Link>
              <Link
                href={`/internal/attendance/payroll?month=${monthKey}`}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white shadow-[0_8px_20px_rgba(37,99,235,0.16)] transition hover:bg-blue-700"
              >
                Open Payroll
              </Link>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 xl:w-[360px] dark:border-white/10 dark:bg-white/[0.035]">
            <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">
              Reporting period
            </p>
            <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
              {getMonthLabel(monthKey)}
            </p>

            <form className="mt-4 flex gap-2">
              <input
                aria-label="Attendance summary month"
                type="month"
                name="month"
                defaultValue={monthKey}
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
              />
              <button className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700">
                View
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryMetric
          label="Employees"
          value={totalEmployees.toLocaleString("en-IN")}
          helper={`${payrollReady} payroll ready`}
          tone="blue"
        />
        <SummaryMetric
          label="Present Days"
          value={presentDays.toLocaleString("en-IN", {
            maximumFractionDigits: 1,
          })}
          helper="Recorded in period"
          tone="emerald"
        />
        <SummaryMetric
          label="Incomplete"
          value={incompleteRows.length.toLocaleString("en-IN")}
          helper="Punch records pending"
          tone="rose"
        />
        <SummaryMetric
          label="Short Days"
          value={shortDays.toLocaleString("en-IN")}
          helper="Unpaid impact"
          tone="amber"
        />
        <SummaryMetric
          label="Pending OT"
          value={pendingOvertime.toLocaleString("en-IN")}
          helper="Approval required"
          tone="violet"
        />
        <SummaryMetric
          label="Est. Deduction"
          value={formatRupees(salaryImpact)}
          helper="Short-day estimate"
          tone="slate"
        />
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
              Monthly register
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Employee payroll attendance
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Read-only payroll preview. Corrections remain controlled by the
              attendance manager.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {payroll.summary.length} records
          </span>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5 font-black">Employee</th>
                <th className="px-3 py-3.5 font-black">Present</th>
                <th className="px-3 py-3.5 font-black">Full / Half</th>
                <th className="px-3 py-3.5 font-black">Short</th>
                <th className="px-3 py-3.5 font-black">Paid Leave</th>
                <th className="px-3 py-3.5 font-black">OT Minutes</th>
                <th className="px-3 py-3.5 font-black">Net Pay</th>
                <th className="px-5 py-3.5 text-right font-black">Readiness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {payroll.summary.map((row) => {
                const needsReview =
                  row.monthlyBaseSalary <= 0 || row.unpaidShortDays > 0;

                return (
                  <tr
                    key={row.userId}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-white/[0.025]"
                  >
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900 dark:text-white">
                        {row.userName}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-400">
                        {row.userEmail}
                      </p>
                    </td>
                    <td className="px-3 py-4 font-black text-slate-700 dark:text-slate-200">
                      {row.presentDays.toFixed(1)}
                    </td>
                    <td className="px-3 py-4 font-semibold text-slate-500 dark:text-slate-400">
                      {row.fullDays} / {row.halfDays}
                    </td>
                    <td className="px-3 py-4 font-black text-rose-600 dark:text-rose-300">
                      {row.unpaidShortDays}
                    </td>
                    <td className="px-3 py-4 font-semibold text-slate-500 dark:text-slate-400">
                      {row.approvedPaidLeaveDays.toFixed(1)}
                    </td>
                    <td className="px-3 py-4 font-semibold text-slate-500 dark:text-slate-400">
                      {row.overtimeMinutes}
                    </td>
                    <td className="px-3 py-4 font-black text-slate-900 dark:text-white">
                      {formatRupees(row.netPay)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ReadinessBadge needsReview={needsReview} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 bg-slate-50/60 p-3 lg:hidden dark:bg-slate-950/35">
          {payroll.summary.map((row) => {
            const needsReview =
              row.monthlyBaseSalary <= 0 || row.unpaidShortDays > 0;

            return (
              <article
                key={row.userId}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                      {row.userName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                      {row.userEmail}
                    </p>
                  </div>
                  <ReadinessBadge needsReview={needsReview} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    ["Present", row.presentDays.toFixed(1)],
                    ["Full / Half", `${row.fullDays} / ${row.halfDays}`],
                    ["Short Days", String(row.unpaidShortDays)],
                    ["Paid Leave", row.approvedPaidLeaveDays.toFixed(1)],
                    ["OT Minutes", String(row.overtimeMinutes)],
                    ["Net Pay", formatRupees(row.netPay)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]"
                    >
                      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {payroll.summary.length === 0 ? (
          <div className="border-t border-slate-100 px-6 py-14 text-center dark:border-white/10">
            <p className="text-sm font-black text-slate-800 dark:text-slate-200">
              No payroll attendance available
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              No employee attendance was found for this reporting period.
            </p>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
              Exception queue
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Incomplete punch records
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Resolve missing Punch Out or incomplete shifts before payroll
              finalization.
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
            {pendingOvertime} overtime approvals pending
          </span>
        </div>

        {incompleteRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <SummaryIcon tone="emerald" />
            </span>
            <p className="mt-4 text-sm font-black text-slate-800 dark:text-slate-200">
              All punch records are complete
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              No incomplete attendance was found for this month.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
            {incompleteRows.slice(0, 20).map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-400/20 dark:bg-rose-500/[0.045]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                      {row.user.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                      {row.user.email}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                    {row.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/80 p-3 dark:bg-white/[0.04]">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Work Date
                    </p>
                    <p className="mt-1 text-[11px] font-black text-slate-800 dark:text-slate-100">
                      {formatWorkDate(row.workDate)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 dark:bg-white/[0.04]">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Punch In
                    </p>
                    <p className="mt-1 text-[11px] font-black text-slate-800 dark:text-slate-100">
                      {formatAttendanceTime(row.punchInAt)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 dark:bg-white/[0.04]">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Punch Out
                    </p>
                    <p
                      className={`mt-1 text-[11px] font-black ${
                        row.punchOutAt
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {formatAttendanceTime(row.punchOutAt)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {incompleteRows.length > 20 ? (
          <div className="border-t border-slate-100 px-5 py-3 text-center text-[11px] font-bold text-slate-400 dark:border-white/10">
            Showing the 20 most recent exceptions out of{" "}
            {incompleteRows.length}.
          </div>
        ) : null}
      </section>
    </div>
  );
}
