import Link from "next/link";
import Image from "next/image";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { markStaleAttendanceForReview } from "@/lib/attendance-reconciliation";
import { correctAttendanceAction } from "./actions";
import {
  formatDuration,
  formatIndiaDateTime,
  formatIndiaTime,
  getActiveOfficeLocation,
  getAttendanceActionLabel,
  getAttendanceEventsForDate,
  getBreakTypeLabel,
  getEmployeeAttendanceRows,
  getIndiaWorkDate,
  getRecentAttendanceAttempts,
  type EmployeeAttendanceRow,
  type OfficeAttendanceEventRow,
} from "@/lib/office-attendance";

function getStatusLabel(row: EmployeeAttendanceRow) {
  if (row.status === "REVIEW_REQUIRED") return "Review Required";
  if (row.punchOutAt || row.status === "COMPLETED") return "Completed";
  if (row.currentBreakType) return `On ${getBreakTypeLabel(row.currentBreakType)}`;
  if (row.punchInAt) return "Punched In";
  return "Not Punched In";
}

function getStatusClass(label: string) {
  if (label === "Completed") return "bg-emerald-50 text-emerald-700";
  if (label.startsWith("On ")) return "bg-amber-50 text-yellow-300";
  if (label === "Punched In") return "bg-blue-50 text-blue-600";
  if (label === "Review Required") return "bg-rose-50 text-rose-700";
  return "bg-slate-500/10 text-slate-500";
}

function groupEventsByAttendance(events: OfficeAttendanceEventRow[]) {
  const eventMap = new Map<string, OfficeAttendanceEventRow[]>();

  for (const event of events) {
    const currentEvents = eventMap.get(event.attendanceId) || [];
    currentEvents.push(event);
    eventMap.set(event.attendanceId, currentEvents);
  }

  return eventMap;
}

function isValidWorkDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatIndiaDateTimeLocal(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}T${valueOf("hour")}:${valueOf("minute")}`;
}

export default async function InternalAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const { hasAccess } = await checkPermission("manage_attendance", "/internal/attendance");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Attendance Access Denied"
        description="Only owner and manager can view team attendance records."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const params = await searchParams;
  await markStaleAttendanceForReview();
  const selectedDate =
    params?.date && isValidWorkDate(params.date) ? params.date : getIndiaWorkDate();
  const office = await getActiveOfficeLocation();
  const rows = await getEmployeeAttendanceRows(selectedDate);
  const events = await getAttendanceEventsForDate(selectedDate);
  const eventMap = groupEventsByAttendance(events);
  const attempts = await getRecentAttendanceAttempts(20);

  const completedCount = rows.filter((row) => row.punchOutAt || row.status === "COMPLETED").length;
  const punchedInCount = rows.filter((row) => row.punchInAt && !row.punchOutAt && !row.currentBreakType).length;
  const onBreakCount = rows.filter((row) => row.currentBreakType).length;
  const notPunchedCount = rows.filter((row) => !row.punchInAt).length;
  const blockedAttempts = attempts.filter((attempt) => attempt.status === "BLOCKED_OUTSIDE_OFFICE").length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-600">
          Office Attendance
        </p>

        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black sm:text-5xl">Team Attendance</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/internal/attendance/payroll"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Payroll
            </Link>

            <Link
              href="/internal/attendance/settings"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Office Setup
            </Link>

            <Link
              href="/account/attendance"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700"
            >
              My Attendance
            </Link>
          </div>
        </div>
      </section>

      {!office ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
          <h2 className="font-bold">Office location is not configured</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800/80">
            Attendance punch, break and logout actions will stay blocked until owner sets office location and radius.
          </p>
        </div>
      ) : null}

      {params?.success === "attendance-corrected" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          Attendance was corrected and the audit history was saved.
        </div>
      ) : null}
      {params?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          The attendance correction could not be saved. Check the times and reason, then try again.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Completed</p>
          <p className="mt-3 text-3xl font-black text-emerald-700">{completedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Currently In</p>
          <p className="mt-3 text-3xl font-black text-blue-600">{punchedInCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">On Break</p>
          <p className="mt-3 text-3xl font-black text-yellow-300">{onBreakCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Not Punched</p>
          <p className="mt-3 text-3xl font-black text-slate-600">{notPunchedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Blocked Attempts</p>
          <p className="mt-3 text-3xl font-black text-red-700">{blockedAttempts}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Date</label>
            <input
              name="date"
              type="date"
              defaultValue={selectedDate}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-blue-500"
            />
          </div>
          <button className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700">
            Apply
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1580px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">User</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Punch In</th>
                <th className="px-5 py-4">Logging Out</th>
                <th className="px-5 py-4">Breaks</th>
                <th className="px-5 py-4">Work Time</th>
                <th className="px-5 py-4">Timeline & Photos</th>
                <th className="px-5 py-4">Manager Correction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const statusLabel = getStatusLabel(row);
                const rowEvents = row.attendanceId ? eventMap.get(row.attendanceId) || [] : [];

                return (
                  <tr key={row.userId} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{row.userName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.userEmail}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.userRole.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(statusLabel)}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{formatIndiaDateTime(row.punchInAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.punchInDistanceMeters !== null && row.punchInDistanceMeters !== undefined ? `${Math.round(row.punchInDistanceMeters)}m from office` : "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{formatIndiaDateTime(row.punchOutAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.punchOutDistanceMeters !== null && row.punchOutDistanceMeters !== undefined ? `${Math.round(row.punchOutDistanceMeters)}m from office` : "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p className="font-bold text-yellow-300">{formatDuration(row.breakMinutes)}</p>
                      {row.currentBreakType ? (
                        <p className="mt-1 text-xs text-yellow-300">Currently on {getBreakTypeLabel(row.currentBreakType)}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>Total: {formatDuration(row.totalMinutes)}</p>
                      <p className="mt-1 text-xs text-emerald-700">Net: {formatDuration(row.netWorkingMinutes)}</p>
                    </td>
                    <td className="px-5 py-4">
                      {rowEvents.length > 0 ? (
                        <div className="space-y-3">
                          <div className="grid gap-2">
                            {rowEvents.map((event) => (
                              <div key={event.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold text-slate-700">{getAttendanceActionLabel(event.eventType)}</p>
                                    <p className="mt-1 text-xs text-slate-500">{formatIndiaTime(event.createdAt)}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {event.distanceMeters !== null && event.distanceMeters !== undefined ? `${Math.round(event.distanceMeters)}m from office` : "-"}
                                    </p>
                                  </div>
                                  {event.photoDataUrl ? (
                                    <Image
                                      src={event.photoDataUrl}
                                      alt={event.label}
                                      width={64}
                                      height={48}
                                      unoptimized
                                      className="h-12 w-16 rounded-xl border border-slate-200 object-cover"
                                    />
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {row.attendanceId ? (
                        <form action={correctAttendanceAction} className="grid min-w-[280px] gap-2">
                          <input type="hidden" name="attendanceId" value={row.attendanceId} />
                          <input type="hidden" name="selectedDate" value={selectedDate} />
                          <input name="correctedPunchIn" type="datetime-local" defaultValue={formatIndiaDateTimeLocal(row.punchInAt)} required className="h-10 rounded-xl border border-slate-200 px-3 text-xs" />
                          <input name="correctedPunchOut" type="datetime-local" defaultValue={formatIndiaDateTimeLocal(row.punchOutAt)} required className="h-10 rounded-xl border border-slate-200 px-3 text-xs" />
                          <input name="reason" required placeholder="Correction reason" className="h-10 rounded-xl border border-slate-200 px-3 text-xs" />
                          <button className="h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white">Save Correction</button>
                        </form>
                      ) : <span className="text-slate-400">No attendance record</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold">Recent Attendance Attempts</h2>
        <p className="mt-1 text-sm text-slate-500">Approved and blocked punch/break/logout attempts.</p>
        <div className="mt-4 grid gap-3">
          {attempts.map((attempt) => (
            <article key={attempt.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="font-bold text-slate-950">{attempt.userName}</p>
                  <p className="mt-1 text-xs text-slate-500">{attempt.userEmail}</p>
                  <p className="mt-1 text-xs text-slate-500">{getAttendanceActionLabel(attempt.actionType)}</p>
                </div>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${attempt.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {attempt.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{attempt.message || "-"}</p>
              <p className="mt-2 text-xs text-slate-500">{formatIndiaDateTime(attempt.attemptedAt)}</p>
            </article>
          ))}
          {attempts.length === 0 ? <p className="text-sm text-slate-500">No attendance attempts found yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
