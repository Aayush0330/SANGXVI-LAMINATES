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

function getMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
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
  const monthKey = isValidMonthKey(query?.month) ? query!.month! : getMonthKey();
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
  const presentDays = payroll.summary.reduce((sum, row) => sum + row.presentDays, 0);
  const shortDays = payroll.summary.reduce((sum, row) => sum + row.unpaidShortDays, 0);
  const pendingOvertime = payroll.overtimeCandidates.filter((row) => row.status === "PENDING").length;
  const salaryImpact = payroll.summary.reduce(
    (sum, row) => sum + row.perDaySalary * row.unpaidShortDays,
    0,
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">
            Read-only attendance view
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Attendance Summary
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Payroll-impacting attendance records for {getMonthLabel(monthKey)}.
          </p>
        </div>

        <form className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={monthKey}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          />
          <button className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">
            View
          </button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Employees", totalEmployees.toLocaleString("en-IN")],
          ["Present Days", presentDays.toLocaleString("en-IN", { maximumFractionDigits: 1 })],
          ["Incomplete Punches", incompleteRows.length.toLocaleString("en-IN")],
          ["Short Days", shortDays.toLocaleString("en-IN")],
          ["Estimated Impact", formatRupees(salaryImpact)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Employee Payroll Attendance</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This page is read-only. Corrections must be handled by an authorized attendance manager.</p>
          </div>
          <Link href={`/internal/attendance/payroll?month=${monthKey}`} className="text-sm font-black text-blue-600 dark:text-blue-300">
            Open Payroll
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-black">Employee</th>
                <th className="px-3 py-3 font-black">Present</th>
                <th className="px-3 py-3 font-black">Full / Half</th>
                <th className="px-3 py-3 font-black">Short Days</th>
                <th className="px-3 py-3 font-black">Paid Leave</th>
                <th className="px-3 py-3 font-black">OT Minutes</th>
                <th className="px-3 py-3 font-black">Net Pay</th>
                <th className="px-5 py-3 text-right font-black">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {payroll.summary.map((row) => {
                const needsReview = row.monthlyBaseSalary <= 0 || row.unpaidShortDays > 0;
                return (
                  <tr key={row.userId}>
                    <td className="px-5 py-3">
                      <p className="font-black text-slate-900 dark:text-white">{row.userName}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{row.userEmail}</p>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">{row.presentDays.toFixed(1)}</td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{row.fullDays} / {row.halfDays}</td>
                    <td className="px-3 py-3 font-bold text-rose-600 dark:text-rose-300">{row.unpaidShortDays}</td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{row.approvedPaidLeaveDays.toFixed(1)}</td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{row.overtimeMinutes}</td>
                    <td className="px-3 py-3 font-black text-slate-900 dark:text-white">{formatRupees(row.netPay)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black ${needsReview ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
                        {needsReview ? "Review" : "Ready"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">Incomplete Punch Records</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{pendingOvertime} overtime approvals are also pending in payroll.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          {incompleteRows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-300">No incomplete punches for this month.</div>
          ) : incompleteRows.slice(0, 20).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">{row.user.name}</p>
                <p className="mt-1 text-xs text-slate-400">{row.user.email} · {row.workDate}</p>
              </div>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {row.status.replaceAll("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
