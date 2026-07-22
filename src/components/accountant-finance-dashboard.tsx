import Link from "next/link";
import type { AppUser } from "@/lib/current-user";
import {
  formatIndiaPayrollDateTime,
  formatRupees,
  getMonthBounds,
  getMonthKey,
  getPayrollSummary,
} from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";

type FinanceMetricTone = "violet" | "emerald" | "amber" | "blue" | "cyan" | "rose";
type FinanceMetricIcon = "people" | "wallet" | "person" | "document" | "collection" | "overdue";

type PayrollIssue = {
  id: string;
  employeeName: string;
  employeeCode: string;
  issue: string;
  detail: string;
  impact: number;
  tone: "rose" | "amber" | "blue";
};

type FinancialActivity = {
  id: string;
  title: string;
  detail: string;
  value: string;
  occurredAt: Date;
  tone: "emerald" | "blue" | "amber" | "rose" | "violet";
  status: string;
};

function getMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

function formatShortDate(value?: Date | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function getDaysOverdue(value?: Date | null) {
  if (!value) return 0;
  const due = new Date(value);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.floor((nowDay - dueDay) / 86_400_000));
}

function MetricIcon({ type }: { type: FinanceMetricIcon }) {
  const common = "h-5 w-5";

  if (type === "wallet") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
        <path d="M16 10h5v4h-5a2 2 0 1 1 0-4Z" />
      </svg>
    );
  }

  if (type === "person") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20c.6-4 2.9-6 6.5-6s5.9 2 6.5 6" />
      </svg>
    );
  }

  if (type === "document") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 3h8l4 4v14H6V3Z" />
        <path d="M14 3v5h5M9 12h6M9 16h6" />
      </svg>
    );
  }

  if (type === "collection") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 8.5 9 4h6l2 4.5" />
        <path d="M5 8.5h14l-1 11H6l-1-11Z" />
        <path d="M9 13h6M12 10.5v5" />
      </svg>
    );
  }

  if (type === "overdue") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 8.5 9 4h6l2 4.5" />
        <path d="M5 8.5h14l-1 11H6l-1-11Z" />
        <path d="M12 11v3.5M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M17 11a3 3 0 1 0 0-6M21 20v-1.5a4 4 0 0 0-3-3.7" />
    </svg>
  );
}

function metricToneClasses(tone: FinanceMetricTone) {
  if (tone === "emerald") return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (tone === "amber") return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  if (tone === "blue") return "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300";
  if (tone === "cyan") return "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300";
  if (tone === "rose") return "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300";
  return "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300";
}

function issueToneClasses(tone: PayrollIssue["tone"]) {
  if (tone === "rose") return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  if (tone === "amber") return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
}

function activityToneClasses(tone: FinancialActivity["tone"]) {
  if (tone === "emerald") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (tone === "amber") return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  if (tone === "rose") return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  if (tone === "violet") return "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export async function AccountantFinanceDashboard({ currentUser }: { currentUser: AppUser }) {
  const monthKey = getMonthKey();
  const { startDate, endDate } = getMonthBounds(monthKey);

  const [payroll, collections, incompleteAttendance] = await Promise.all([
    getPayrollSummary(monthKey),
    prisma.collectionAssignment.findMany({
      where: {
        status: { notIn: ["VERIFIED", "CANCELLED"] },
      },
      select: {
        id: true,
        collectionNumber: true,
        dealerName: true,
        amountToCollect: true,
        amountCollected: true,
        status: true,
        dueAt: true,
        updatedAt: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 20,
    }),
    prisma.officeAttendance.findMany({
      where: {
        workDate: { gte: startDate, lte: endDate },
        OR: [{ status: { not: "COMPLETED" } }, { punchOutAt: null }],
      },
      select: {
        id: true,
        workDate: true,
        status: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ workDate: "desc" }, { updatedAt: "desc" }],
      take: 30,
    }),
  ]);

  const isFinalized = payroll.payrollRun?.status === "FINALIZED";
  const totalPayrollValue = payroll.summary.reduce((sum, row) => sum + row.netPay, 0);
  const configuredEmployees = payroll.summary.filter((row) => row.monthlyBaseSalary > 0);
  const pendingApprovalCount =
    payroll.advances.filter((row) => row.status === "PENDING").length +
    payroll.leaves.filter((row) => row.status === "PENDING").length +
    payroll.overtimeCandidates.filter((row) => row.status === "PENDING").length;
  const salaryProfileIssueCount = payroll.summary.filter((row) => row.monthlyBaseSalary <= 0).length;
  const pendingPayrollCount = isFinalized ? 0 : pendingApprovalCount + salaryProfileIssueCount + incompleteAttendance.length;
  const pendingSalaryCount = isFinalized ? 0 : configuredEmployees.length;
  const payslipsReady = isFinalized ? payroll.summary.length : 0;

  const activeCollections = collections.map((collection) => ({
    ...collection,
    pendingAmount: Math.max(0, collection.amountToCollect - collection.amountCollected),
    daysOverdue: getDaysOverdue(collection.dueAt),
  }));
  const collectionsDue = activeCollections.reduce((sum, row) => sum + row.pendingAmount, 0);
  const overdueCollections = activeCollections.filter((row) => row.daysOverdue > 0);
  const overdueAmount = overdueCollections.reduce((sum, row) => sum + row.pendingAmount, 0);

  const payrollByUser = new Map(payroll.summary.map((row) => [row.userId, row]));
  const issueRows: PayrollIssue[] = [];

  for (const row of payroll.summary) {
    if (row.monthlyBaseSalary <= 0) {
      issueRows.push({
        id: `salary-${row.userId}`,
        employeeName: row.userName,
        employeeCode: row.userEmail,
        issue: "Salary not configured",
        detail: "Payroll profile required",
        impact: 0,
        tone: "rose",
      });
    }

    if (row.unpaidShortDays > 0) {
      issueRows.push({
        id: `short-${row.userId}`,
        employeeName: row.userName,
        employeeCode: row.userEmail,
        issue: "Short attendance",
        detail: `${row.unpaidShortDays} unpaid day${row.unpaidShortDays === 1 ? "" : "s"}`,
        impact: row.perDaySalary * row.unpaidShortDays,
        tone: "amber",
      });
    }
  }

  for (const row of payroll.overtimeCandidates.filter((item) => item.status === "PENDING")) {
    const employee = payrollByUser.get(row.userId);
    issueRows.push({
      id: `ot-${row.attendanceId}`,
      employeeName: row.userName,
      employeeCode: employee?.userEmail ?? row.userId,
      issue: "Overtime approval",
      detail: `${row.calculatedMinutes} minutes pending`,
      impact: employee ? (row.calculatedMinutes / 60) * employee.overtimeHourlyRate : 0,
      tone: "blue",
    });
  }

  for (const row of incompleteAttendance) {
    const employee = payrollByUser.get(row.userId);
    issueRows.push({
      id: `attendance-${row.id}`,
      employeeName: row.user.name,
      employeeCode: row.user.email,
      issue: "Incomplete punch",
      detail: `${row.workDate} · ${row.status.replaceAll("_", " ").toLowerCase()}`,
      impact: employee?.perDaySalary ?? 0,
      tone: "rose",
    });
  }

  const uniqueIssues = Array.from(new Map(issueRows.map((row) => [row.id, row])).values()).slice(0, 5);
  const pendingPayslips = payroll.summary
    .filter((row) => row.monthlyBaseSalary > 0)
    .sort((a, b) => b.netPay - a.netPay)
    .slice(0, 5);

  const dataPreparationComplete = salaryProfileIssueCount === 0;
  const attendanceReviewComplete = incompleteAttendance.length === 0 && payroll.summary.every((row) => row.unpaidShortDays === 0);
  const approvalsComplete = pendingApprovalCount === 0;
  const progressSteps = [
    {
      title: "Data Preparation",
      detail: dataPreparationComplete ? "Salary profiles configured" : `${salaryProfileIssueCount} salary profiles need review`,
      complete: dataPreparationComplete,
      active: !dataPreparationComplete,
    },
    {
      title: "Payroll Review",
      detail: attendanceReviewComplete ? "Attendance inputs verified" : `${incompleteAttendance.length} attendance records need review`,
      complete: attendanceReviewComplete,
      active: dataPreparationComplete && !attendanceReviewComplete,
    },
    {
      title: "Approvals",
      detail: approvalsComplete ? "All requests decided" : `${pendingApprovalCount} approvals pending`,
      complete: approvalsComplete,
      active: dataPreparationComplete && attendanceReviewComplete && !approvalsComplete,
    },
    {
      title: "Finalize Payroll",
      detail: isFinalized ? `Locked by ${payroll.payrollRun?.finalizedByName ?? "authorized user"}` : "Review and lock the monthly payroll",
      complete: isFinalized,
      active: !isFinalized && dataPreparationComplete && attendanceReviewComplete && approvalsComplete,
    },
  ];
  const progressPercent = Math.round((progressSteps.filter((step) => step.complete).length / progressSteps.length) * 100);

  const activityRows: FinancialActivity[] = [];
  if (payroll.payrollRun?.finalizedAt) {
    activityRows.push({
      id: `payroll-${payroll.payrollRun.id}`,
      title: "Payroll Finalized",
      detail: `${getMonthLabel(monthKey)} payroll locked`,
      value: formatRupees(totalPayrollValue),
      occurredAt: new Date(payroll.payrollRun.finalizedAt),
      tone: "violet",
      status: "Completed",
    });
  }

  for (const collection of collections.slice(0, 8)) {
    const isFailure = collection.status === "FAILED";
    const isCollected = collection.status === "COLLECTED" || collection.status === "PARTIALLY_COLLECTED";
    activityRows.push({
      id: `collection-${collection.id}`,
      title: isFailure ? "Collection Failed" : isCollected ? "Collection Received" : "Collection Follow-up Updated",
      detail: `${collection.dealerName} · ${collection.collectionNumber}`,
      value: formatRupees(collection.amountCollected || collection.amountToCollect),
      occurredAt: collection.updatedAt,
      tone: isFailure ? "rose" : isCollected ? "emerald" : "blue",
      status: isFailure ? "Failed" : isCollected ? "Received" : "Open",
    });
  }

  const recentActivity = activityRows
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 5);

  const metrics: Array<{
    label: string;
    value: string;
    helper: string;
    badge: string;
    tone: FinanceMetricTone;
    icon: FinanceMetricIcon;
  }> = [
    {
      label: "Pending Payroll",
      value: pendingPayrollCount.toLocaleString("en-IN"),
      helper: "Items needing review",
      badge: pendingPayrollCount > 0 ? "Needs Review" : "Clear",
      tone: "violet",
      icon: "people",
    },
    {
      label: "Payroll Value",
      value: formatRupees(totalPayrollValue),
      helper: getMonthLabel(monthKey),
      badge: isFinalized ? "Finalized" : "Estimated",
      tone: "emerald",
      icon: "wallet",
    },
    {
      label: "Pending Salaries",
      value: pendingSalaryCount.toLocaleString("en-IN"),
      helper: "Employees",
      badge: pendingSalaryCount > 0 ? "Action Required" : "Completed",
      tone: "amber",
      icon: "person",
    },
    {
      label: "Payslips Ready",
      value: payslipsReady.toLocaleString("en-IN"),
      helper: getMonthLabel(monthKey),
      badge: isFinalized ? "Ready" : "After Finalization",
      tone: "blue",
      icon: "document",
    },
    {
      label: "Collections Due",
      value: formatRupees(collectionsDue),
      helper: `${activeCollections.length} open follow-ups`,
      badge: "Current",
      tone: "cyan",
      icon: "collection",
    },
    {
      label: "Overdue Collections",
      value: formatRupees(overdueAmount),
      helper: `${overdueCollections.length} overdue follow-ups`,
      badge: overdueCollections.length > 0 ? "Overdue" : "Clear",
      tone: "rose",
      icon: "overdue",
    },
  ];

  return (
    <div className="space-y-5 pb-4">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">Finance Dashboard</h1>
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            Payroll, payslips, collections and reconciliation only.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-blue-500/15 dark:text-blue-200">
            {initials(currentUser.name)}
          </span>
          Accountant
          <span className="h-2 w-2 rounded-full bg-blue-500" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((metric) => (
          <article key={metric.label} className="min-h-[150px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${metricToneClasses(metric.tone)}`}>
                <MetricIcon type={metric.icon} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{metric.label}</p>
                <p className="mt-1 truncate text-2xl font-black tracking-tight text-slate-950 dark:text-white">{metric.value}</p>
                <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">{metric.helper}</p>
              </div>
            </div>
            <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-[10px] font-black ${metricToneClasses(metric.tone)}`}>{metric.badge}</span>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.28fr_1.15fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">Payroll Progress</h2>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{getMonthLabel(monthKey)} payroll cycle</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{progressPercent}%</span>
          </div>
          <div className="mt-5 space-y-4">
            {progressSteps.map((step, index) => (
              <div key={step.title} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-3">
                <div className="relative flex justify-center">
                  <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${step.complete ? "bg-emerald-500 text-white" : step.active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                    {step.complete ? "✓" : index + 1}
                  </span>
                  {index < progressSteps.length - 1 ? <span className="absolute top-7 h-8 w-px bg-slate-200 dark:bg-slate-700" /> : null}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{step.detail}</p>
                </div>
                <span className={`mt-0.5 text-[10px] font-black ${step.complete ? "text-emerald-600 dark:text-emerald-300" : step.active ? "text-blue-600 dark:text-blue-300" : "text-slate-400"}`}>
                  {step.complete ? "Completed" : step.active ? "In Progress" : "Pending"}
                </span>
              </div>
            ))}
          </div>
          <Link href={`/internal/attendance/payroll?month=${monthKey}`} className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-black text-blue-600 dark:border-white/10 dark:text-blue-300">
            View Payroll Dashboard <span>›</span>
          </Link>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">{isFinalized ? "Ready Payslips" : "Pending Payslips"}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Current payroll employees</p>
            </div>
            <Link href={`/internal/attendance/payroll/payslips?month=${monthKey}`} className="text-xs font-black text-blue-600 dark:text-blue-300">View All</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-black">Employee</th>
                  <th className="px-3 py-3 font-black">Net Pay</th>
                  <th className="px-3 py-3 font-black">Status</th>
                  <th className="px-5 py-3 text-right font-black">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {pendingPayslips.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center font-semibold text-slate-500">No payroll employees found.</td></tr>
                ) : pendingPayslips.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-5 py-3">
                      <p className="font-black text-slate-900 dark:text-white">{row.userName}</p>
                      <p className="mt-0.5 max-w-36 truncate text-[10px] text-slate-400">{row.userEmail}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-black text-slate-700 dark:text-slate-200">{formatRupees(row.netPay)}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${isFinalized ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>{isFinalized ? "Ready" : "Pending"}</span></td>
                    <td className="px-5 py-3 text-right">
                      <Link href={isFinalized ? `/internal/attendance/payroll/payslip/${row.userId}?month=${monthKey}` : `/internal/attendance/payroll?month=${monthKey}&employee=${row.userId}`} className="inline-flex rounded-lg border border-blue-200 px-3 py-1.5 font-black text-blue-600 transition hover:bg-blue-50 dark:border-blue-400/20 dark:text-blue-300 dark:hover:bg-blue-500/10">
                        {isFinalized ? "View" : "Review"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href={`/internal/attendance/payroll/payslips?month=${monthKey}`} className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm font-black text-blue-600 dark:border-white/10 dark:text-blue-300">Go to Payslips <span>›</span></Link>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">Attendance & Payroll Issues</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Items affecting salary calculation</p>
            </div>
            <Link href={`/internal/attendance/summary?month=${monthKey}`} className="text-xs font-black text-blue-600 dark:text-blue-300">View All</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {uniqueIssues.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-300">No payroll blockers found.</div>
            ) : uniqueIssues.map((issue) => (
              <div key={issue.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{initials(issue.employeeName)}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-900 dark:text-white">{issue.employeeName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${issueToneClasses(issue.tone)}`}>{issue.issue}</span>
                    <span className="text-[10px] text-slate-400">{issue.detail}</span>
                  </div>
                </div>
                <p className={`whitespace-nowrap text-xs font-black ${issue.impact > 0 ? "text-rose-600 dark:text-rose-300" : "text-slate-400"}`}>{issue.impact > 0 ? formatRupees(issue.impact) : "Review"}</p>
              </div>
            ))}
          </div>
          <Link href={`/internal/attendance/summary?month=${monthKey}`} className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm font-black text-blue-600 dark:border-white/10 dark:text-blue-300">Review All Issues <span>›</span></Link>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_1fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">Collection Follow-ups</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Open dealer and customer collections</p>
            </div>
            <Link href="/internal/collections" className="text-xs font-black text-blue-600 dark:text-blue-300">View All</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-black">Client / Dealer</th>
                  <th className="px-3 py-3 font-black">Due Amount</th>
                  <th className="px-3 py-3 font-black">Due Date</th>
                  <th className="px-3 py-3 font-black">Status</th>
                  <th className="px-5 py-3 text-right font-black">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {activeCollections.slice(0, 5).length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center font-semibold text-slate-500">No open collection follow-ups.</td></tr>
                ) : activeCollections.slice(0, 5).map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3">
                      <p className="max-w-44 truncate font-black text-slate-900 dark:text-white">{row.dealerName}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{row.assignedTo?.name ?? "Unassigned"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-black text-slate-700 dark:text-slate-200">{formatRupees(row.pendingAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500 dark:text-slate-400">{formatShortDate(row.dueAt)}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${row.daysOverdue > 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>{row.daysOverdue > 0 ? `${row.daysOverdue}d overdue` : "Open"}</span></td>
                    <td className="px-5 py-3 text-right"><Link href="/internal/collections" className="inline-flex rounded-lg border border-blue-200 px-3 py-1.5 font-black text-blue-600 hover:bg-blue-50 dark:border-blue-400/20 dark:text-blue-300 dark:hover:bg-blue-500/10">Follow Up</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/internal/collections" className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm font-black text-blue-600 dark:border-white/10 dark:text-blue-300">Go to Collections <span>›</span></Link>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <h2 className="text-base font-black text-slate-950 dark:text-white">Recent Financial Activity</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Payroll and collection updates</p>
            </div>
            <Link href="/internal/reports" className="text-xs font-black text-blue-600 dark:text-blue-300">View Reports</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {recentActivity.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">No recent financial activity.</div>
            ) : recentActivity.map((activity) => (
              <div key={activity.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${activityToneClasses(activity.tone)}`}>₹</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-900 dark:text-white">{activity.title}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-400">{activity.detail}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-black ${activity.tone === "rose" ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}`}>{activity.value}</p>
                  <p className="mt-1 text-[9px] text-slate-400">{formatIndiaPayrollDateTime(activity.occurredAt)}</p>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${activityToneClasses(activity.tone)}`}>{activity.status}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
