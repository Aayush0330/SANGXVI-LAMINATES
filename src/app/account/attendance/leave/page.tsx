import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  getCurrentUser,
  getPortalLandingLabel,
  getPortalLandingPath,
} from "@/lib/current-user";
import {
  canUsePayrollSelfService,
  formatDecimalDays,
  formatIndiaPayrollDate,
  formatIndiaPayrollDateTime,
  getLeaveTypeLabel,
  getMyLeaveRequests,
  getOwnerRecordStatusClass,
  getOwnerRecordStatusLabel,
  getStatusClass,
  getStatusLabel,
  normalizeOwnerPendingLeaveRecords,
} from "@/lib/attendance-payroll";
import { requestLeaveAction } from "./actions";

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const selectClass = `${inputClass} appearance-none`;

const textareaClass =
  "min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

function getMessage(error?: string, success?: string) {
  if (success === "leave-requested") return { type: "success", text: "Leave request sent to Owner/Manager." };
  if (success === "owner-unavailable-recorded") return { type: "success", text: "Owner availability record saved. Approval not required." };
  if (error === "not-allowed") return { type: "error", text: "Leave request is only available for company employees." };
  if (error === "invalid-leave-details") return { type: "error", text: "Please enter valid leave details." };
  if (error === "invalid-date-range") return { type: "error", text: "End date must be same or after start date." };
  if (error) return { type: "error", text: "Something went wrong. Please try again." };
  return null;
}

export default async function LeaveApplyPage({
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
        title="Leave Apply Not Available"
        description="Leave apply is only available for internal team members."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const isOwner = currentUser.roles.includes("owner");

  if (isOwner) {
    await normalizeOwnerPendingLeaveRecords(currentUser.id, currentUser.name);
  }

  const requests = await getMyLeaveRequests(currentUser.id);
  const pendingCount = isOwner ? 0 : requests.filter((request) => request.status === "PENDING").length;
  const approvedCount = requests.filter((request) => request.status === "APPROVED" || (isOwner && request.status === "PENDING")).length;

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
                  {isOwner ? "Mark Unavailable" : "Leave Apply"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {isOwner
                    ? "Owners do not require approval. This saves only an availability or day-off record, and Sundays remain included."
                    : "The leave request will be sent to an Owner or Manager for approval. The date range uses calendar days, including Sundays."}
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
                  href="/account/attendance/advance"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Advance Pay
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
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{isOwner ? "Total Records" : "Total Requests"}</p>
            <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{requests.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{isOwner ? "Pending Approval" : "Pending"}</p>
            <p className="mt-3 text-3xl font-black text-amber-700 dark:text-amber-300">{pendingCount}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{isOwner ? "Recorded" : "Approved"}</p>
            <p className="mt-3 text-3xl font-black text-emerald-700 dark:text-emerald-300">{approvedCount}</p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <form action={requestLeaveAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">{isOwner ? "Availability Record" : "New Request"}</p>
            <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{isOwner ? "Mark day off" : "Apply leave"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {isOwner
                ? "Owners do not require approval. This will be saved only as an attendance availability record."
                : "Approved leave will be included in the payroll summary after Manager or Owner approval."}
            </p>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Start Date</label>
                  <input name="startDate" type="date" required className={inputClass} />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">End Date</label>
                  <input name="endDate" type="date" required className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Leave Type</label>
                <select name="leaveType" defaultValue="FULL_DAY" className={selectClass}>
                  <option value="FULL_DAY">Full Day</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="PAID">Paid Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Reason</label>
                <textarea name="reason" placeholder="Reason optional, but recommended" className={textareaClass} />
              </div>
              <button className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">
                {isOwner ? "Save Day Off Record" : "Send Leave Request"}
              </button>
            </div>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">History</p>
            <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{isOwner ? "My availability records" : "My leave requests"}</h2>

            <div className="mt-6 space-y-3">
              {requests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{isOwner ? "No availability records yet." : "No leave requests yet."}</p>
                </div>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-lg font-black text-slate-950 dark:text-white">
                          {formatIndiaPayrollDate(request.startDate)} → {formatIndiaPayrollDate(request.endDate)}
                        </p>
                        <p className="mt-1 text-sm font-bold text-blue-700 dark:text-cyan-300">
                          {getLeaveTypeLabel(request.leaveType)} · {formatDecimalDays(request.days)} day(s)
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{request.reason || "No reason added."}</p>
                        <p className="mt-2 text-xs font-bold text-slate-400">Requested: {formatIndiaPayrollDateTime(request.requestedAt)}</p>
                        {request.decidedAt ? (
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            {isOwner ? "Recorded" : "Decided"} by {request.decidedByName || (isOwner ? "Owner" : "Manager")}: {formatIndiaPayrollDateTime(request.decidedAt)}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                          isOwner ? getOwnerRecordStatusClass(request.status) : getStatusClass(request.status)
                        }`}
                      >
                        {isOwner ? getOwnerRecordStatusLabel(request.status) : getStatusLabel(request.status)}
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
