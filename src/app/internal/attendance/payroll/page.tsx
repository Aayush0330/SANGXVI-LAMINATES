import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  PaymentStatusBadge,
  PayrollMetricCard,
  formatPayrollMonthLabel,
} from "@/components/payroll-presentation";
import { PayrollSettingsForm } from "@/components/payroll-settings-form";
import { checkPermission } from "@/lib/auth-guards";
import {
  filterPayrollSummary,
  filterPendingRows,
  formatDecimalDays,
  formatIndiaPayrollDate,
  formatIndiaPayrollDateTime,
  formatRupees,
  getEmployeeRoleLabel,
  getLeaveTypeLabel,
  getMonthBounds,
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
  toMoneyNumber,
} from "@/lib/attendance-payroll";
import {
  decideAdvanceRequestAction,
  decideLeaveRequestAction,
  decideOvertimeAction,
  finalizePayrollAction,
  markAllPayrollPaidAction,
  savePayrollHolidayAction,
  updatePayrollPaymentAction,
} from "./actions";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-200";

type PayrollSummaryRow = Awaited<
  ReturnType<typeof getPayrollSummary>
>["summary"][number];

function getMessage(error?: string, success?: string) {
  const successMessages: Record<string, string> = {
    "pay-profile-updated": "Employee salary structure updated.",
    "advance-approved": "Advance request approved.",
    "advance-rejected": "Advance request rejected.",
    "leave-approved": "Leave request approved.",
    "leave-rejected": "Leave request rejected.",
    "holiday-saved": "Payroll holiday saved.",
    "overtime-decided": "Overtime decision saved.",
    "payroll-finalized": "Monthly payroll finalized and locked.",
    "payment-updated": "Payroll payment status updated.",
    "all-payments-paid": "All pending payroll payments marked paid.",
  };
  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission to manage payroll.",
    "employee-required": "Select an employee.",
    "employee-not-found": "Selected employee is not available.",
    "effective-date-required": "Select a valid effective month.",
    "payroll-locked": "This month is finalized and locked.",
    "attendance-review-required":
      "Resolve attendance records marked for review first.",
    "pending-overtime": "Approve or reject all pending overtime first.",
    "pending-corrections":
      "Resolve all pending attendance correction requests before finalizing payroll.",
    "pending-leave-requests":
      "Approve or reject all leave requests affecting this month before finalizing payroll.",
    "pending-advance-requests":
      "Approve or reject all advance requests for this month before finalizing payroll.",
    "payroll-already-finalized": "Payroll is already finalized.",
    "invalid-payment-update": "Enter a valid payment update.",
    "payroll-item-not-found": "Finalized payroll item was not found.",
    "no-pending-payments": "There are no pending payroll payments.",
  };

  if (success && successMessages[success]) {
    return { type: "success", text: successMessages[success] };
  }
  if (error) {
    return {
      type: "error",
      text: errorMessages[error] ?? "Something went wrong. Please try again.",
    };
  }
  return null;
}

function ArrowIcon() {
  return (
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
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function ReadinessItem({
  label,
  helper,
  count,
}: {
  label: string;
  helper: string;
  count: number;
}) {
  const complete = count === 0;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          complete
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
        }`}
      >
        {complete ? (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        ) : (
          <span className="text-xs font-black">{count}</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
          {complete ? "Complete" : helper}
        </span>
      </span>
    </div>
  );
}

export default async function AttendancePayrollPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    q?: string;
    error?: string;
    success?: string;
    employee?: string;
  }>;
}) {
  const { hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Payroll Access Denied"
        description="Only authorized payroll users can manage salary structures, payroll and payments."
        backHref="/internal/attendance"
        backLabel="Back to Attendance"
      />
    );
  }

  const params = await searchParams;
  const monthKey = isValidMonthKey(params?.month)
    ? params!.month!
    : getMonthKey();
  const query = String(params?.q ?? "").trim();
  const message = getMessage(params?.error, params?.success);
  const { calendarDays } = getMonthBounds(monthKey);
  const data = await getPayrollSummary(monthKey);
  const rows = filterPayrollSummary(data.summary, query);
  const pendingAdvances = filterPendingRows(data.advances);
  const pendingLeaves = filterPendingRows(data.leaves);
  const pendingOvertime = data.overtimeCandidates.filter(
    (item) => item.status === "PENDING",
  );
  const missingSalaryStructures = data.summary.filter(
    (row) => row.totalMonthlyEarnings <= 0,
  );
  const finalized = data.payrollRun?.status === "FINALIZED";
  const totalGross = data.summary.reduce(
    (sum, row) => sum + row.grossSalary + row.overtimePay,
    0,
  );
  const totalDeductions = data.summary.reduce(
    (sum, row) => sum + row.approvedAdvance + row.monthlyDeduction,
    0,
  );
  const totalNet = data.summary.reduce((sum, row) => sum + row.netPay, 0);
  const paidCount = data.summary.filter(
    (row) => row.paymentStatus === "PAID",
  ).length;
  const readinessBlockers =
    missingSalaryStructures.length +
    pendingOvertime.length +
    pendingAdvances.length +
    pendingLeaves.length;
  const payrollReady = readinessBlockers === 0;

  return (
    <div className="space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 py-6 text-slate-950 shadow-sm shadow-slate-200/70 sm:px-7 sm:py-7 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:shadow-none">
        <span className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-100/80 blur-3xl dark:bg-blue-500/20" />
        <span className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-emerald-100/70 blur-3xl dark:bg-emerald-400/10" />

        <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600 dark:text-cyan-300">
                Payroll Operations
              </p>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${
                  finalized
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                    : payrollReady
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                }`}
              >
                {finalized
                  ? "Finalized"
                  : payrollReady
                    ? "Ready to finalize"
                    : `${readinessBlockers} items need review`}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Payroll Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              Review attendance-linked earnings, approve exceptions, finalize
              payroll and track every salary payment from one workspace.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/internal/attendance/summary?month=${monthKey}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Attendance Summary
            </Link>
            <Link
              href={`/internal/attendance/payroll/export?month=${monthKey}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Export CSV
            </Link>
            <Link
              href={`/internal/attendance/payroll/payslips?month=${monthKey}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white transition hover:bg-blue-700 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50"
            >
              Payslips
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-xs font-bold leading-5 ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
          }`}
        >
          <span
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
              message.type === "success" ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PayrollMetricCard
          label="Payroll Month"
          value={formatPayrollMonthLabel(monthKey)}
          helper={`${calendarDays} calendar days`}
          tone="blue"
        />
        <PayrollMetricCard
          label="Gross Earnings"
          value={formatRupees(totalGross)}
          helper="Attendance and overtime"
          tone="violet"
        />
        <PayrollMetricCard
          label="Deductions"
          value={formatRupees(totalDeductions)}
          helper="Fixed and approved advances"
          tone="rose"
        />
        <PayrollMetricCard
          label="Net Payroll"
          value={formatRupees(totalNet)}
          helper={`${data.summary.length} employees`}
          tone="emerald"
        />
        <PayrollMetricCard
          label="Payments"
          value={
            finalized
              ? `${paidCount}/${data.summary.length}`
              : "Not started"
          }
          helper={finalized ? "Employees paid" : "Available after finalization"}
          tone={finalized && paidCount === data.summary.length ? "emerald" : "amber"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div
          className={`overflow-hidden rounded-[28px] border ${
            finalized
              ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-500/10"
              : "border-slate-200/90 bg-white dark:border-white/10 dark:bg-slate-900"
          }`}
        >
          <div className="flex flex-col justify-between gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    finalized
                      ? "bg-emerald-500"
                      : payrollReady
                        ? "bg-blue-500"
                        : "bg-amber-500"
                  }`}
                />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {finalized ? "Payroll Locked" : "Payroll Cycle"}
                </p>
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {finalized
                  ? `${formatPayrollMonthLabel(monthKey)} is finalized`
                  : payrollReady
                    ? "Payroll is ready for final review"
                    : "Resolve open items before finalizing"}
              </h2>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                {finalized
                  ? `Finalized by ${data.payrollRun?.finalizedByName ?? "authorized user"} on ${formatIndiaPayrollDateTime(data.payrollRun?.finalizedAt)}. Salary values are locked for this period.`
                  : "Finalization creates locked employee payslips from the current salary structures, attendance, approved overtime and requests."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <form className="flex gap-2">
                <input
                  type="month"
                  name="month"
                  defaultValue={monthKey}
                  aria-label="Payroll month"
                  className={`${inputClass} min-w-0 sm:w-40`}
                />
                <button className="h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                  Open
                </button>
              </form>
              {!finalized ? (
                <form action={finalizePayrollAction}>
                  <input type="hidden" name="monthKey" value={monthKey} />
                  <button className="h-10 w-full rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-[0_8px_20px_rgba(37,99,235,0.2)] transition hover:bg-blue-700 sm:w-auto">
                    Finalize Payroll
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {finalized ? (
            <div className="border-t border-emerald-200/80 px-5 py-4 dark:border-emerald-400/15 sm:px-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                    Batch Payment
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Mark every remaining salary as paid with one bank reference.
                  </p>
                </div>
                <form
                  action={markAllPayrollPaidAction}
                  className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]"
                >
                  <input type="hidden" name="monthKey" value={monthKey} />
                  <input
                    name="paymentReference"
                    placeholder="Batch or bank reference"
                    className={inputClass}
                  />
                  <button className="h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white transition hover:bg-emerald-700">
                    Mark All Paid
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-slate-200/90 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Readiness Check
              </p>
              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                {finalized
                  ? "Cycle completed"
                  : payrollReady
                    ? "All visible checks passed"
                    : `${readinessBlockers} open items`}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
                finalized || payrollReady
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              }`}
            >
              {finalized ? "Locked" : payrollReady ? "Ready" : "Review"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <ReadinessItem
              label="Salary structures"
              helper={`${missingSalaryStructures.length} employees missing setup`}
              count={missingSalaryStructures.length}
            />
            <ReadinessItem
              label="Overtime decisions"
              helper={`${pendingOvertime.length} entries pending`}
              count={pendingOvertime.length}
            />
            <ReadinessItem
              label="Advance decisions"
              helper={`${pendingAdvances.length} requests pending`}
              count={pendingAdvances.length}
            />
            <ReadinessItem
              label="Leave decisions"
              helper={`${pendingLeaves.length} requests pending`}
              count={pendingLeaves.length}
            />
          </div>
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
                Payroll Register
              </p>
              <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Employee payroll
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Showing {rows.length} of {data.summary.length} employees
              </p>
            </div>
            <form className="flex w-full max-w-md gap-2">
              <input type="hidden" name="month" value={monthKey} />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search employee or role"
                aria-label="Search payroll employees"
                className={inputClass}
              />
              <button className="h-10 rounded-xl border border-slate-200 px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-200">
                Search
              </button>
            </form>
          </div>

          <div className="grid gap-3 bg-slate-50/70 p-3 sm:p-4 dark:bg-slate-950/40">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center dark:border-white/10 dark:bg-slate-900">
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                  No payroll employees found
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Try another name, email or role.
                </p>
              </div>
            ) : (
              rows.map((row) => (
                <PayrollEmployeeCard
                  key={row.userId}
                  row={row}
                  monthKey={monthKey}
                  finalized={finalized}
                />
              ))
            )}
          </div>
        </div>

        <aside
          id="salary-structure"
          className="scroll-mt-24 rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900 xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-104px)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable] xl:[scrollbar-width:thin]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
                Salary Structure
              </p>
              <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Employee settings
              </h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                Effective-dated compensation without changing prior payroll.
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M7 3v8M17 3v8M5 11h14v10H5z" />
                <path d="M9 15h6M9 18h4" />
              </svg>
            </span>
          </div>

          <PayrollSettingsForm
            employees={data.users.map((user) => ({
              userId: user.userId,
              userName: user.userName,
              roleLabel: getEmployeeRoleLabel(user.userRole),
              monthlyBaseSalary: toMoneyNumber(user.monthlyBaseSalary),
              monthlyAllowance: toMoneyNumber(user.monthlyAllowance),
              monthlyDeduction: toMoneyNumber(user.monthlyDeduction),
              standardDailyMinutes: Number(user.standardDailyMinutes ?? 480),
              overtimeHourlyRate: toMoneyNumber(user.overtimeHourlyRate),
            }))}
            initialEmployeeId={params?.employee}
            salaryCalendarDays={calendarDays}
            effectiveMonth={monthKey}
          />
        </aside>
      </section>

      <section className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
              Payroll Operations
            </p>
            <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Review exceptions
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Manage holidays, overtime and employee requests before the cycle
              is locked.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 dark:bg-white/10 dark:text-slate-300">
            {formatPayrollMonthLabel(monthKey)}
          </span>
        </div>

        <div className="mt-5 grid items-start gap-4 xl:grid-cols-3">
          <HolidayCalendarCard holidays={data.holidays} />
          <OvertimeReviewCard
            items={data.overtimeCandidates}
            monthKey={monthKey}
            finalized={finalized}
          />
          <div className="grid gap-4">
            <RequestCard
              title="Advance Requests"
              helper="Salary advances awaiting a decision"
              rows={pendingAdvances.map((item) => ({
                id: item.id,
                title: item.userName,
                detail: `${formatRupees(item.amount)} · ${item.reason || "No reason provided"}`,
              }))}
              action={decideAdvanceRequestAction}
            />
            <RequestCard
              title="Leave Requests"
              helper="Leave affecting payable days"
              rows={pendingLeaves.map((item) => ({
                id: item.id,
                title: item.userName,
                detail: `${getLeaveTypeLabel(item.leaveType)} · ${formatIndiaPayrollDate(item.startDate)} to ${formatIndiaPayrollDate(item.endDate)}`,
              }))}
              action={decideLeaveRequestAction}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PayrollEmployeeCard({
  row,
  monthKey,
  finalized,
}: {
  row: PayrollSummaryRow;
  monthKey: string;
  finalized: boolean;
}) {
  const totalDeductions = row.approvedAdvance + row.monthlyDeduction;
  const totalEarned = row.grossSalary + row.overtimePay;
  const initials = row.userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-4 transition hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-400/30 sm:p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-[11px] font-black text-white dark:bg-blue-600">
            {initials || "ER"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950 dark:text-white">
              {row.userName}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
              {getEmployeeRoleLabel(row.userRole)} · {row.userEmail}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={row.paymentStatus} />
          {!finalized ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 dark:bg-white/10 dark:text-slate-300">
              Estimate
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-white/10 lg:grid-cols-4">
        <RegisterValue
          label="Structure"
          value={formatRupees(row.totalMonthlyEarnings)}
          helper={`Base ${formatRupees(row.monthlyBaseSalary)}`}
        />
        <RegisterValue
          label="Earned"
          value={formatRupees(totalEarned)}
          helper={`${formatDecimalDays(row.calendarPayDays)} paid days`}
          tone="blue"
        />
        <RegisterValue
          label="Deductions"
          value={formatRupees(totalDeductions)}
          helper={`Advance ${formatRupees(row.approvedAdvance)}`}
          tone="rose"
        />
        <RegisterValue
          label="Net Pay"
          value={formatRupees(row.netPay)}
          helper={`${row.overtimeMinutes} overtime min`}
          tone="emerald"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold text-slate-400">
          {row.presentDays} attendance days · {row.fullDays} full ·{" "}
          {row.halfDays} half
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/internal/attendance/payroll?month=${monthKey}&employee=${row.userId}#salary-structure`}
            className={secondaryButtonClass}
          >
            Edit Structure
          </Link>
          {finalized ? (
            <Link
              href={`/internal/attendance/payroll/payslip/${row.userId}?month=${monthKey}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3.5 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              View Payslip
              <ArrowIcon />
            </Link>
          ) : null}
        </div>
      </div>

      {finalized && row.payrollItemId ? (
        <details className="group mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-white/5">
            <span>Update payment record</span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 transition group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <form
            action={updatePayrollPaymentAction}
            className="grid gap-3 border-t border-slate-200 p-4 dark:border-white/10 sm:grid-cols-2"
          >
            <input
              type="hidden"
              name="payrollItemId"
              value={row.payrollItemId}
            />
            <input type="hidden" name="monthKey" value={monthKey} />
            <div>
              <label className="mb-2 block text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                Status
              </label>
              <select
                name="paymentStatus"
                defaultValue={row.paymentStatus}
                className={inputClass}
              >
                {["PENDING", "PROCESSING", "PAID", "ON_HOLD", "FAILED"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                Reference
              </label>
              <input
                name="paymentReference"
                defaultValue={row.paymentReference ?? ""}
                placeholder="Bank or transaction reference"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                Payment Note
              </label>
              <input
                name="paymentNote"
                defaultValue={row.paymentNote ?? ""}
                placeholder="Optional internal note"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col justify-between gap-3 sm:col-span-2 sm:flex-row sm:items-center">
              <p className="text-[10px] font-semibold text-slate-400">
                {row.paidAt
                  ? `Recorded ${formatIndiaPayrollDateTime(row.paidAt)} by ${row.paidByName ?? "authorized user"}`
                  : "No completed payment recorded yet."}
              </p>
              <button className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700">
                Save Payment
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </article>
  );
}

function RegisterValue({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "blue" | "rose" | "emerald";
}) {
  const valueClass =
    tone === "blue"
      ? "text-blue-700 dark:text-blue-300"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-300"
        : tone === "emerald"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-slate-950 dark:text-white";

  return (
    <div className="min-w-0 bg-slate-50 px-3 py-3 dark:bg-slate-950">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className={`mt-1.5 truncate text-sm font-black ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-[9px] font-semibold text-slate-400">
        {helper}
      </p>
    </div>
  );
}

function HolidayCalendarCard({
  holidays,
}: {
  holidays: Awaited<ReturnType<typeof getPayrollSummary>>["holidays"];
}) {
  return (
    <article className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">
            Holiday Calendar
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            Paid and unpaid payroll dates
          </p>
        </div>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
          {holidays.length}
        </span>
      </div>

      <form action={savePayrollHolidayAction} className="mt-4 grid gap-2">
        <input
          name="holidayDate"
          type="date"
          required
          className={inputClass}
        />
        <input
          name="name"
          placeholder="Holiday name"
          required
          className={inputClass}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <select name="isPaid" className={inputClass}>
            <option value="true">Paid holiday</option>
            <option value="false">Unpaid holiday</option>
          </select>
          <button
            className="h-10 rounded-xl bg-violet-600 px-3.5 text-xs font-black text-white transition hover:bg-violet-700"
          >
            Add
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-2">
        {holidays.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[10px] font-semibold text-slate-400 dark:border-white/10">
            No holidays in this period.
          </p>
        ) : (
          holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
                  {holiday.name}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                  {formatIndiaPayrollDate(holiday.holidayDate)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${
                  holiday.isPaid
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
                }`}
              >
                {holiday.isPaid ? "Paid" : "Unpaid"}
              </span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function OvertimeReviewCard({
  items,
  monthKey,
  finalized,
}: {
  items: Awaited<ReturnType<typeof getPayrollSummary>>["overtimeCandidates"];
  monthKey: string;
  finalized: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">
            Overtime Review
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            Validate extra working time
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {items.length}
        </span>
      </div>

      <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[10px] font-semibold text-slate-400 dark:border-white/10">
            No overtime entries for review.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.attendanceId}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
                    {item.userName}
                  </p>
                  <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                    {formatIndiaPayrollDate(item.workDate)} ·{" "}
                    {item.calculatedMinutes} min calculated
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${
                    item.status === "APPROVED"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : item.status === "REJECTED"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  }`}
                >
                  {item.status}
                </span>
              </div>

              {!finalized && item.status === "PENDING" ? (
                <form
                  action={decideOvertimeAction}
                  className="mt-3 grid gap-2"
                >
                  <input
                    type="hidden"
                    name="attendanceId"
                    value={item.attendanceId}
                  />
                  <input type="hidden" name="monthKey" value={monthKey} />
                  <input
                    type="hidden"
                    name="calculatedMinutes"
                    value={item.calculatedMinutes}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      name="approvedMinutes"
                      type="number"
                      min="0"
                      max={item.calculatedMinutes}
                      defaultValue={item.calculatedMinutes}
                      aria-label="Approved overtime minutes"
                      className={inputClass}
                    />
                    <input
                      name="decisionNote"
                      placeholder="Decision note"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      name="decision"
                      value="APPROVED"
                      className="h-9 rounded-xl bg-emerald-600 text-[10px] font-black text-white transition hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      name="decision"
                      value="REJECTED"
                      className="h-9 rounded-xl bg-rose-600 text-[10px] font-black text-white transition hover:bg-rose-700"
                    >
                      Reject
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function RequestCard({
  title,
  helper,
  rows,
  action,
}: {
  title: string;
  helper: string;
  rows: { id: string; title: string; detail: string }[];
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">
            {title}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            {helper}
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {rows.length}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[10px] font-semibold text-slate-400 dark:border-white/10">
            No pending requests.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900"
            >
              <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                {row.title}
              </p>
              <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                {row.detail}
              </p>
              <form action={action} className="mt-3 grid gap-2">
                <input type="hidden" name="requestId" value={row.id} />
                <input
                  name="decisionNote"
                  placeholder="Decision note"
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    name="decision"
                    value="APPROVED"
                    className="h-9 rounded-xl bg-emerald-600 text-[10px] font-black text-white transition hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    name="decision"
                    value="REJECTED"
                    className="h-9 rounded-xl bg-rose-600 text-[10px] font-black text-white transition hover:bg-rose-700"
                  >
                    Reject
                  </button>
                </div>
              </form>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
