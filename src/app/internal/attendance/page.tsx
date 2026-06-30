import Link from "next/link";
import Image from "next/image";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
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
  if (row.punchOutAt || row.status === "COMPLETED") return "Completed";
  if (row.currentBreakType) return `On ${getBreakTypeLabel(row.currentBreakType)}`;
  if (row.punchInAt) return "Punched In";
  return "Not Punched In";
}

function getStatusClass(label: string) {
  if (label === "Completed") return "bg-emerald-300/10 text-emerald-300";
  if (label.startsWith("On ")) return "bg-yellow-300/10 text-yellow-300";
  if (label === "Punched In") return "bg-cyan-300/10 text-cyan-300";
  return "bg-slate-500/10 text-slate-400";
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

export default async function InternalAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
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
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
          Office Attendance
        </p>

        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black sm:text-5xl">Team Attendance</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Review live camera proof, GPS distance, punch times, lunch, tea, small break and outside-office attempts.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/internal/attendance/settings"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.04]"
            >
              Office Setup
            </Link>

            <Link
              href="/account/attendance"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              My Attendance
            </Link>
          </div>
        </div>
      </section>

      {!office ? (
        <div className="rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-5 text-yellow-100">
          <h2 className="font-bold">Office location is not configured</h2>
          <p className="mt-2 text-sm leading-6 text-yellow-100/80">
            Attendance punch, break and logout actions will stay blocked until owner sets office location and radius.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Completed</p>
          <p className="mt-3 text-3xl font-black text-emerald-300">{completedCount}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Currently In</p>
          <p className="mt-3 text-3xl font-black text-cyan-300">{punchedInCount}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">On Break</p>
          <p className="mt-3 text-3xl font-black text-yellow-300">{onBreakCount}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Not Punched</p>
          <p className="mt-3 text-3xl font-black text-slate-300">{notPunchedCount}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Blocked Attempts</p>
          <p className="mt-3 text-3xl font-black text-red-300">{blockedAttempts}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Date</label>
            <input
              name="date"
              type="date"
              defaultValue={selectedDate}
              className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm text-slate-200 outline-none transition focus:border-cyan-300"
            />
          </div>
          <button className="h-12 rounded-2xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
            Apply
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">User</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Punch In</th>
                <th className="px-5 py-4">Logging Out</th>
                <th className="px-5 py-4">Breaks</th>
                <th className="px-5 py-4">Work Time</th>
                <th className="px-5 py-4">Timeline & Photos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => {
                const statusLabel = getStatusLabel(row);
                const rowEvents = row.attendanceId ? eventMap.get(row.attendanceId) || [] : [];

                return (
                  <tr key={row.userId} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-white">{row.userName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.userEmail}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.userRole.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(statusLabel)}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <p>{formatIndiaDateTime(row.punchInAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.punchInDistanceMeters !== null && row.punchInDistanceMeters !== undefined ? `${Math.round(row.punchInDistanceMeters)}m from office` : "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <p>{formatIndiaDateTime(row.punchOutAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.punchOutDistanceMeters !== null && row.punchOutDistanceMeters !== undefined ? `${Math.round(row.punchOutDistanceMeters)}m from office` : "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <p className="font-bold text-yellow-300">{formatDuration(row.breakMinutes)}</p>
                      {row.currentBreakType ? (
                        <p className="mt-1 text-xs text-yellow-300">Currently on {getBreakTypeLabel(row.currentBreakType)}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <p>Total: {formatDuration(row.totalMinutes)}</p>
                      <p className="mt-1 text-xs text-emerald-300">Net: {formatDuration(row.netWorkingMinutes)}</p>
                    </td>
                    <td className="px-5 py-4">
                      {rowEvents.length > 0 ? (
                        <div className="space-y-3">
                          <div className="grid gap-2">
                            {rowEvents.map((event) => (
                              <div key={event.id} className="rounded-2xl border border-white/10 bg-slate-900 px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold text-slate-200">{getAttendanceActionLabel(event.eventType)}</p>
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
                                      className="h-12 w-16 rounded-xl border border-white/10 object-cover"
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-bold">Recent Attendance Attempts</h2>
        <p className="mt-1 text-sm text-slate-500">Approved and blocked punch/break/logout attempts.</p>
        <div className="mt-4 grid gap-3">
          {attempts.map((attempt) => (
            <article key={attempt.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="font-bold text-white">{attempt.userName}</p>
                  <p className="mt-1 text-xs text-slate-500">{attempt.userEmail}</p>
                  <p className="mt-1 text-xs text-slate-500">{getAttendanceActionLabel(attempt.actionType)}</p>
                </div>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${attempt.status === "APPROVED" ? "bg-emerald-300/10 text-emerald-300" : "bg-red-300/10 text-red-300"}`}>
                  {attempt.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{attempt.message || "-"}</p>
              <p className="mt-2 text-xs text-slate-500">{formatIndiaDateTime(attempt.attemptedAt)}</p>
            </article>
          ))}
          {attempts.length === 0 ? <p className="text-sm text-slate-500">No attendance attempts found yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
