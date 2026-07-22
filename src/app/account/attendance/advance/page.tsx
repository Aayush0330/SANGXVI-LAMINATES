import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  getCurrentUser,
  getPortalLandingLabel,
  getPortalLandingPath,
} from "@/lib/current-user";
import {
  canUsePayrollSelfService,
  formatIndiaPayrollDateTime,
  formatRupees,
  getMyAdvanceRequests,
  getStatusClass,
  getStatusLabel,
  toMoneyNumber,
} from "@/lib/attendance-payroll";
import { requestAdvancePayAction } from "./actions";

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const textareaClass =
  "min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

function getMessage(error?: string, success?: string) {
  if (success === "advance-requested") return { type: "success", text: "Advance pay request sent to Owner/Manager." };
  if (error === "not-allowed") return { type: "error", text: "Advance request is only available for company employees." };
  if (error === "amount-required") return { type: "error", text: "Please enter a valid advance amount." };
  if (error) return { type: "error", text: "Something went wrong. Please try again." };
  return null;
}

export default async function AdvancePayPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const currentUser = await getCurrentUser();
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);

  if (!currentUser.roles.some((role) => canUsePayrollSelfService(role))) {
    return (
      <AccessDeniedCard
        title="Advance Pay Not Available"
        description="Advance pay request is only available for internal team members."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const requests = await getMyAdvanceRequests(currentUser.id);
  const pendingCount = requests.filter((request) => request.status === "PENDING").length;
  const approvedAmount = requests
    .filter((request) => request.status === "APPROVED")
    .reduce((total, request) => total + toMoneyNumber(request.amount), 0);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
          <div className="p-5 sm:p-8">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600 dark:text-cyan-300">
                  Attendance Payroll
                </p>
                <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white sm:text-5xl">
                  Advance Pay Request
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  The advance pay request will be sent to an Owner or Manager for approval. Its approval status will be tracked here.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/account/attendance"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  ← Back
                </Link>
                <Link
                  href="/account/attendance/leave"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Leave Apply
                </Link>
              </div>
            </div>
          </div>
        </section>

        {message ? (
          <div
            className={`rounded-2xl border p-4 text-sm font-bold ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Total Requests</p>
            <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{requests.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Pending</p>
            <p className="mt-3 text-3xl font-black text-amber-700 dark:text-amber-300">{pendingCount}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Approved Amount</p>
            <p className="mt-3 text-3xl font-black text-emerald-700 dark:text-emerald-300">{formatRupees(approvedAmount)}</p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <form action={requestAdvancePayAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">New Request</p>
            <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">Request advance pay</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Enter the amount and reason. The deduction will appear in payroll after Owner or Manager approval.
            </p>

            <div className="mt-6 grid gap-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Amount</label>
                <input name="amount" type="number" min="1" step="1" required placeholder="Example: 5000" className={inputClass} />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Reason</label>
                <textarea name="reason" placeholder="Reason optional, but recommended" className={textareaClass} />
              </div>
              <button className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">
                Send Request
              </button>
            </div>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">History</p>
            <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">My advance requests</h2>

            <div className="mt-6 space-y-3">
              {requests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No advance requests yet.</p>
                </div>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-lg font-black text-slate-950 dark:text-white">{formatRupees(request.amount)}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{request.reason || "No reason added."}</p>
                        <p className="mt-2 text-xs font-bold text-slate-400">Requested: {formatIndiaPayrollDateTime(request.requestedAt)}</p>
                        {request.decidedAt ? (
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            Decided by {request.decidedByName || "Manager"}: {formatIndiaPayrollDateTime(request.decidedAt)}
                          </p>
                        ) : null}
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(request.status)}`}>
                        {getStatusLabel(request.status)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
