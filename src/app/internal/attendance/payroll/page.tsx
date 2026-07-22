import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
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
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

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
    "attendance-review-required": "Resolve attendance records marked for review first.",
    "pending-overtime": "Approve or reject all pending overtime first.",
    "pending-corrections": "Resolve all pending attendance correction requests before finalizing payroll.",
    "pending-leave-requests": "Approve or reject all leave requests affecting this month before finalizing payroll.",
    "pending-advance-requests": "Approve or reject all advance requests for this month before finalizing payroll.",
    "payroll-already-finalized": "Payroll is already finalized.",
    "invalid-payment-update": "Enter a valid payment update.",
    "payroll-item-not-found": "Finalized payroll item was not found.",
    "no-pending-payments": "There are no pending payroll payments.",
  };
  if (success && successMessages[success]) return { type: "success", text: successMessages[success] };
  if (error) return { type: "error", text: errorMessages[error] ?? "Something went wrong. Please try again." };
  return null;
}

function monthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${monthKey}-01T00:00:00.000Z`),
  );
}

function paymentTone(status: string) {
  if (status === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (status === "FAILED" || status === "ON_HOLD") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300";
  if (status === "PROCESSING") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300";
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300";
}

export default async function AttendancePayrollPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; q?: string; error?: string; success?: string; employee?: string }>;
}) {
  const { hasAccess } = await checkPermission("manage_payroll", "/internal/attendance/payroll");
  if (!hasAccess) {
    return <AccessDeniedCard title="Payroll Access Denied" description="Only authorized payroll users can manage salary structures, payroll and payments." backHref="/internal/attendance" backLabel="Back to Attendance" />;
  }

  const params = await searchParams;
  const monthKey = isValidMonthKey(params?.month) ? params!.month! : getMonthKey();
  const query = String(params?.q ?? "").trim();
  const message = getMessage(params?.error, params?.success);
  const { calendarDays } = getMonthBounds(monthKey);
  const data = await getPayrollSummary(monthKey);
  const rows = filterPayrollSummary(data.summary, query);
  const pendingAdvances = filterPendingRows(data.advances);
  const pendingLeaves = filterPendingRows(data.leaves);
  const finalized = data.payrollRun?.status === "FINALIZED";
  const totalGross = rows.reduce((sum, row) => sum + row.grossSalary, 0);
  const totalDeductions = rows.reduce((sum, row) => sum + row.approvedAdvance + row.monthlyDeduction, 0);
  const totalNet = rows.reduce((sum, row) => sum + row.netPay, 0);
  const paidCount = rows.filter((row) => row.paymentStatus === "PAID").length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
        <div className="p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600 dark:text-cyan-300">HR & Payroll</p>
              <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white sm:text-5xl">Salary & Payment Control</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Configure salary components, calculate attendance-linked payroll, finalize monthly payslips and record salary payments.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/internal/hr" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">HR Center</Link>
              <Link href={`/internal/attendance/payroll/export?month=${monthKey}`} className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">Export CSV</Link>
              <Link href="/internal/attendance/payroll/payslips" className="inline-flex h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Payslips</Link>
            </div>
          </div>
        </div>
      </section>

      {message ? <div className={`rounded-2xl border p-4 text-sm font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300"}`}>{message.text}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Payroll month", monthLabel(monthKey)],
          ["Gross earned", formatRupees(totalGross)],
          ["Deductions", formatRupees(totalDeductions)],
          ["Net payroll", formatRupees(totalNet)],
          ["Payments", finalized ? `${paidCount}/${rows.length} paid` : "Finalize first"],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{value}</p></div>)}
      </section>

      <section className={`rounded-3xl border p-5 ${finalized ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-500/10" : "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-500/10"}`}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div><p className="text-xs font-black uppercase tracking-[0.2em]">{finalized ? "Finalized & locked" : "Draft payroll"}</p><p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{finalized ? `Finalized by ${data.payrollRun?.finalizedByName ?? "authorized user"} on ${formatIndiaPayrollDateTime(data.payrollRun?.finalizedAt)}.` : "Review attendance, overtime, salary structures and requests before finalizing."}</p></div>
          <div className="flex flex-wrap gap-3">
            <form className="flex gap-2"><input type="month" name="month" defaultValue={monthKey} className={inputClass} /><button className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Open</button></form>
            {!finalized ? <form action={finalizePayrollAction}><input type="hidden" name="monthKey" value={monthKey} /><button className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white">Finalize Payroll</button></form> : null}
          </div>
        </div>
      </section>

      {finalized ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Payment Control</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Record salary disbursement</h2></div>
            <form action={markAllPayrollPaidAction} className="grid gap-2 sm:grid-cols-[240px_auto]"><input type="hidden" name="monthKey" value={monthKey} /><input name="paymentReference" placeholder="Batch / bank reference" className={inputClass} /><button className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white">Mark All Paid</button></form>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-cyan-300">Salary Structure</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Employee settings</h2>
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
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Payroll register</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{rows.length} employees</h2></div><form className="flex gap-2"><input type="hidden" name="month" value={monthKey} /><input name="q" defaultValue={query} placeholder="Search employee" className={inputClass} /><button className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-black dark:border-slate-700">Search</button></form></div>
          <div className="overflow-x-auto">
            <table className="min-w-[1150px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950"><tr><th className="px-5 py-4">Employee</th><th className="px-5 py-4">Salary structure</th><th className="px-5 py-4">Attendance earnings</th><th className="px-5 py-4">Deductions</th><th className="px-5 py-4">Net pay</th><th className="px-5 py-4">Payment</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => <tr key={row.userId} className="align-top">
                  <td className="px-5 py-5"><p className="font-black text-slate-950 dark:text-white">{row.userName}</p><p className="mt-1 text-xs font-semibold text-slate-400">{getEmployeeRoleLabel(row.userRole)}</p></td>
                  <td className="px-5 py-5"><p className="font-black">{formatRupees(row.totalMonthlyEarnings)}</p><p className="mt-1 text-xs text-slate-500">Base {formatRupees(row.monthlyBaseSalary)} + allowance {formatRupees(row.monthlyAllowance)}</p></td>
                  <td className="px-5 py-5"><p className="font-black">{formatRupees(row.grossSalary + row.overtimePay)}</p><p className="mt-1 text-xs text-slate-500">{formatDecimalDays(row.calendarPayDays)} paid days · OT {formatRupees(row.overtimePay)}</p></td>
                  <td className="px-5 py-5"><p className="font-black text-rose-600">{formatRupees(row.approvedAdvance + row.monthlyDeduction)}</p><p className="mt-1 text-xs text-slate-500">Advance {formatRupees(row.approvedAdvance)} · fixed {formatRupees(row.monthlyDeduction)}</p></td>
                  <td className="px-5 py-5"><p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{formatRupees(row.netPay)}</p>{finalized ? <Link href={`/internal/attendance/payroll/payslip/${row.userId}?month=${monthKey}`} className="mt-2 inline-block text-xs font-black text-blue-600">View payslip</Link> : <p className="mt-1 text-xs text-slate-400">Estimated</p>}</td>
                  <td className="px-5 py-5">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${paymentTone(row.paymentStatus)}`}>{row.paymentStatus.replaceAll("_", " ")}</span>
                    {finalized && row.payrollItemId ? <form action={updatePayrollPaymentAction} className="mt-3 grid min-w-[230px] gap-2"><input type="hidden" name="payrollItemId" value={row.payrollItemId} /><input type="hidden" name="monthKey" value={monthKey} /><select name="paymentStatus" defaultValue={row.paymentStatus} className={inputClass}>{["PENDING", "PROCESSING", "PAID", "ON_HOLD", "FAILED"].map((status) => <option key={status}>{status}</option>)}</select><input name="paymentReference" defaultValue={row.paymentReference ?? ""} placeholder="Reference" className={inputClass} /><input name="paymentNote" defaultValue={row.paymentNote ?? ""} placeholder="Payment note" className={inputClass} /><button className="h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white dark:bg-white dark:text-slate-950">Save Status</button></form> : null}
                    {row.paidAt ? <p className="mt-2 text-xs text-slate-400">{formatIndiaPayrollDateTime(row.paidAt)} · {row.paidByName ?? "Recorded"}</p> : null}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Holiday Calendar</p><form action={savePayrollHolidayAction} className="mt-4 grid gap-3"><input name="holidayDate" type="date" required className={inputClass} /><input name="name" placeholder="Holiday name" required className={inputClass} /><select name="isPaid" className={inputClass}><option value="true">Paid holiday</option><option value="false">Unpaid holiday</option></select><button className="h-11 rounded-xl bg-violet-600 text-sm font-black text-white">Save Holiday</button></form><div className="mt-4 space-y-2">{data.holidays.map((holiday) => <div key={holiday.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="font-black">{holiday.name}</p><p className="text-xs text-slate-500">{formatIndiaPayrollDate(holiday.holidayDate)} · {holiday.isPaid ? "Paid" : "Unpaid"}</p></div>)}</div></div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">Overtime Review</p><span className="text-sm font-black">{data.overtimeCandidates.length}</span></div><div className="mt-4 space-y-3">{data.overtimeCandidates.map((item) => <div key={item.attendanceId} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="font-black">{item.userName}</p><p className="text-xs text-slate-500">{formatIndiaPayrollDate(item.workDate)} · {item.calculatedMinutes} min</p>{!finalized && item.status === "PENDING" ? <form action={decideOvertimeAction} className="mt-3 grid gap-2"><input type="hidden" name="attendanceId" value={item.attendanceId} /><input type="hidden" name="monthKey" value={monthKey} /><input type="hidden" name="calculatedMinutes" value={item.calculatedMinutes} /><input name="approvedMinutes" type="number" min="0" max={item.calculatedMinutes} defaultValue={item.calculatedMinutes} className={inputClass} /><input name="decisionNote" placeholder="Decision note" className={inputClass} /><div className="grid grid-cols-2 gap-2"><button name="decision" value="APPROVED" className="h-10 rounded-xl bg-emerald-600 text-xs font-black text-white">Approve</button><button name="decision" value="REJECTED" className="h-10 rounded-xl bg-rose-600 text-xs font-black text-white">Reject</button></div></form> : null}</div>)}</div></div>

        <div className="space-y-5">
          <RequestCard title="Advance Requests" rows={pendingAdvances.map((item) => ({ id: item.id, title: item.userName, detail: `${formatRupees(item.amount)} · ${item.reason || "No reason"}` }))} action={decideAdvanceRequestAction} />
          <RequestCard title="Leave Requests" rows={pendingLeaves.map((item) => ({ id: item.id, title: item.userName, detail: `${getLeaveTypeLabel(item.leaveType)} · ${formatIndiaPayrollDate(item.startDate)} to ${formatIndiaPayrollDate(item.endDate)}` }))} action={decideLeaveRequestAction} />
        </div>
      </section>
    </div>
  );
}

function RequestCard({ title, rows, action }: { title: string; rows: { id: string; title: string; detail: string }[]; action: (formData: FormData) => Promise<void> }) {
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">{title}</p><span className="text-sm font-black">{rows.length}</span></div><div className="mt-4 space-y-3">{rows.length === 0 ? <p className="text-sm font-semibold text-slate-400">No pending requests.</p> : rows.map((row) => <div key={row.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="font-black">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.detail}</p><form action={action} className="mt-3 grid gap-2"><input type="hidden" name="requestId" value={row.id} /><input name="decisionNote" placeholder="Decision note" className={inputClass} /><div className="grid grid-cols-2 gap-2"><button name="decision" value="APPROVED" className="h-10 rounded-xl bg-emerald-600 text-xs font-black text-white">Approve</button><button name="decision" value="REJECTED" className="h-10 rounded-xl bg-rose-600 text-xs font-black text-white">Reject</button></div></form></div>)}</div></div>;
}
