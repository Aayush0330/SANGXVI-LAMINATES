import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  PaymentStatusBadge,
  PayrollMetricCard,
  formatPayrollMonthLabel,
} from "@/components/payroll-presentation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  type DecimalLike,
  formatIndiaPayrollDateTime,
  formatRupees,
  toMoneyNumber,
} from "@/lib/attendance-payroll";

type PayslipRow = {
  monthKey: string;
  netPay: DecimalLike;
  paymentStatus: string;
  paidAt: Date | string | null;
  paymentReference: string | null;
  finalizedAt: Date | string | null;
};

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

export default async function MyPayslipsPage() {
  const { currentUser, hasAccess } = await checkPermission(
    "view_own_payslips",
    "/account/attendance/payslips",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Payslips Not Available"
        description="You do not have access to employee payslips."
        backHref="/account/attendance"
        backLabel="Back to Attendance"
      />
    );
  }

  const rows = await prisma.$queryRaw<PayslipRow[]>`
    SELECT run."monthKey", item."netPay", item."paymentStatus"::text AS "paymentStatus",
      item."paidAt", item."paymentReference", run."finalizedAt"
    FROM public."PayrollRunItem" item
    INNER JOIN public."PayrollRun" run ON run."id" = item."payrollRunId"
    WHERE item."userId" = ${currentUser.id}
      AND run."status" = 'FINALIZED'
    ORDER BY run."monthKey" DESC
  `;

  const paidRows = rows.filter((row) => row.paymentStatus === "PAID");
  const finalizedValue = rows.reduce(
    (sum, row) => sum + toMoneyNumber(row.netPay),
    0,
  );
  const paidValue = paidRows.reduce(
    (sum, row) => sum + toMoneyNumber(row.netPay),
    0,
  );
  const latest = rows[0] ?? null;

  return (
    <div className="min-h-screen bg-[#f4f6f9] px-3 pb-28 pt-4 text-slate-950 sm:px-5 sm:pt-5 lg:px-7 lg:pb-8 lg:pt-7 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 text-slate-950 shadow-sm shadow-slate-200/70 sm:p-7 lg:p-8 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:shadow-none">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-100/80 blur-3xl dark:bg-emerald-500/15"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10"
            aria-hidden="true"
          />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700 ring-1 ring-emerald-100 dark:bg-white/10 dark:text-emerald-100 dark:ring-white/10">
                  {getInitials(currentUser.name)}
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">
                    Payroll self-service
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    Private salary document center
                  </p>
                </div>
              </div>

              <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
                My Payslips
              </h1>
              <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
                Review finalized salary statements, payment status and complete
                month-wise earnings details.
              </p>
            </div>

            <div className="grid w-full gap-px overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-2 xl:w-[430px] dark:bg-white/10 dark:ring-white/10">
              <div className="bg-slate-50 p-4 dark:bg-white/[0.04]">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Latest period
                </p>
                <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
                  {latest
                    ? formatPayrollMonthLabel(latest.monthKey)
                    : "Not available"}
                </p>
              </div>
              <div className="bg-slate-50 p-4 dark:bg-white/[0.04]">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Latest net pay
                </p>
                <p className="mt-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
                  {latest ? formatRupees(latest.netPay) : "Not available"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <nav
          aria-label="Payroll shortcuts"
          className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900"
        >
          <Link
            href="/account/attendance"
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white transition hover:bg-blue-700"
          >
            Back to Attendance
          </Link>
          <Link
            href="/account/attendance/leave"
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl px-3.5 text-xs font-black text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            Leave Requests
          </Link>
          <Link
            href="/account/attendance/advance"
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl px-3.5 text-xs font-black text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            Advance Pay
          </Link>
        </nav>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PayrollMetricCard
            label="Payslips"
            value={rows.length.toLocaleString("en-IN")}
            helper="Finalized statements"
            tone="blue"
          />
          <PayrollMetricCard
            label="Paid"
            value={paidRows.length.toLocaleString("en-IN")}
            helper={`${Math.max(0, rows.length - paidRows.length)} awaiting payment`}
            tone="emerald"
          />
          <PayrollMetricCard
            label="Finalized Value"
            value={formatRupees(finalizedValue)}
            helper="Across available periods"
            tone="violet"
          />
          <PayrollMetricCard
            label="Paid Value"
            value={formatRupees(paidValue)}
            helper="Marked as disbursed"
            tone="slate"
          />
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
                Salary documents
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Finalized payslip history
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Open any month to view, print or save the complete payslip.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {rows.length} {rows.length === 1 ? "document" : "documents"}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/[0.06]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 3h9l4 4v14H6z" />
                  <path d="M14 3v5h5M9 13h6M9 17h4" />
                </svg>
              </span>
              <p className="mt-4 text-sm font-black text-slate-800 dark:text-slate-200">
                No finalized payslips yet
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Your payslips will appear after monthly payroll is finalized.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 bg-slate-50/60 p-3 sm:p-4 lg:grid-cols-2 dark:bg-slate-950/35">
              {rows.map((row) => (
                <article
                  key={row.monthKey}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-400/30 dark:hover:shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        Salary period
                      </p>
                      <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                        {formatPayrollMonthLabel(row.monthKey)}
                      </h3>
                    </div>
                    <PaymentStatusBadge status={row.paymentStatus} />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50/70 p-3 dark:bg-emerald-500/[0.07]">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                        Net Pay
                      </p>
                      <p className="mt-1.5 text-lg font-black text-emerald-700 dark:text-emerald-200">
                        {formatRupees(row.netPay)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Paid On
                      </p>
                      <p className="mt-1.5 text-xs font-black text-slate-700 dark:text-slate-200">
                        {formatIndiaPayrollDateTime(row.paidAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
                    <p className="text-[10px] font-semibold text-slate-400">
                      Finalized{" "}
                      {formatIndiaPayrollDateTime(row.finalizedAt)}
                      {row.paymentReference
                        ? ` · Ref: ${row.paymentReference}`
                        : ""}
                    </p>
                    <Link
                      href={`/account/attendance/payslips/${row.monthKey}`}
                      className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-black text-white transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
                    >
                      Open Payslip
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
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
