import Image from "next/image";
import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { ReportExportButtons } from "@/components/report-export-buttons";
import { checkPermission } from "@/lib/auth-guards";
import { markStaleAttendanceForReview } from "@/lib/attendance-reconciliation";
import {
  formatDuration,
  formatIndiaDateTime,
  formatIndiaTime,
  getActiveOfficeLocation,
  getAttendanceActionLabel,
  getAttendanceEventsForDate,
  getEmployeeSessionEventsForDate,
  getBreakTypeLabel,
  getEmployeeAttendanceRows,
  getIndiaWorkDate,
  getRecentAttendanceAttempts,
  type EmployeeAttendanceRow,
  type OfficeAttendanceEventRow,
  type EmployeeSessionEventRow,
} from "@/lib/office-attendance";
import { correctAttendanceAction } from "./actions";

type MetricTone = "emerald" | "blue" | "amber" | "slate" | "rose";

function getStatusLabel(row: EmployeeAttendanceRow) {
  if (row.status === "REVIEW_REQUIRED") return "Review Required";
  if (row.punchOutAt || row.status === "COMPLETED") return "Completed";
  if (row.currentBreakType) {
    return `On ${getBreakTypeLabel(row.currentBreakType)}`;
  }
  if (row.punchInAt) return "Punched In";
  return "Not Punched In";
}

function getStatusClass(label: string) {
  if (label === "Completed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20";
  }
  if (label.startsWith("On ")) {
    return "bg-amber-50 text-amber-800 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20";
  }
  if (label === "Punched In") {
    return "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20";
  }
  if (label === "Review Required") {
    return "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20";
  }
  return "bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10";
}

function getStatusFilterValue(row: EmployeeAttendanceRow) {
  if (row.status === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  if (row.punchOutAt || row.status === "COMPLETED") return "COMPLETED";
  if (row.currentBreakType) return "ON_BREAK";
  if (row.punchInAt) return "WORKING";
  return "NOT_PUNCHED";
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

function groupSessionEventsByUser(events: EmployeeSessionEventRow[]) {
  const eventMap = new Map<string, EmployeeSessionEventRow[]>();
  for (const event of events) {
    const currentEvents = eventMap.get(event.userId) || [];
    currentEvents.push(event);
    eventMap.set(event.userId, currentEvents);
  }
  return eventMap;
}

function getSessionEventLabel(event: EmployeeSessionEventRow) {
  if (event.eventType === "LOGIN_SUCCESS") return "Login";
  if (event.description?.toLowerCase().includes("all devices")) {
    return "Automatic Logout - All Devices";
  }
  return "Logout";
}

function isValidWorkDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
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

function formatSelectedDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

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

function formatRole(role: string) {
  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDistance(value?: number | null) {
  return value !== null && value !== undefined
    ? `${Math.round(value)}m from office`
    : "Distance unavailable";
}

function MetricIcon({ tone }: { tone: MetricTone }) {
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

  if (tone === "blue") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="3" />
        <path d="M6 20v-2a6 6 0 0 1 12 0v2M18 8h3M19.5 6.5v3" />
      </svg>
    );
  }

  if (tone === "amber") {
    return (
      <svg {...commonProps}>
        <path d="M8 4h8M9 4v5l-3 4a4 4 0 0 0 3.2 7h5.6A4 4 0 0 0 18 13l-3-4V4" />
        <path d="M8 14h8" />
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

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: MetricTone;
}) {
  const classes = {
    emerald: {
      icon: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      value: "text-emerald-700 dark:text-emerald-300",
      accent: "bg-emerald-500",
    },
    blue: {
      icon: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
      value: "text-blue-700 dark:text-blue-300",
      accent: "bg-blue-500",
    },
    amber: {
      icon: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      value: "text-amber-700 dark:text-amber-300",
      accent: "bg-amber-500",
    },
    slate: {
      icon: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
      value: "text-slate-800 dark:text-slate-100",
      accent: "bg-slate-400",
    },
    rose: {
      icon: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
      value: "text-rose-700 dark:text-rose-300",
      accent: "bg-rose-500",
    },
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
      <span className={`absolute inset-y-0 left-0 w-0.5 ${classes.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p
            className={`mt-2 text-3xl font-black tracking-tight ${classes.value}`}
          >
            {value}
          </p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${classes.icon}`}
        >
          <MetricIcon tone={tone} />
        </span>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">{helper}</p>
    </article>
  );
}

function ActionLink({
  href,
  label,
  primary = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        primary
          ? "bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.16)] hover:bg-blue-700"
          : "border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function InternalAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    employee?: string;
    status?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const { hasAccess } = await checkPermission(
    "manage_attendance",
    "/internal/attendance",
  );

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
    params?.date && isValidWorkDate(params.date)
      ? params.date
      : getIndiaWorkDate();
  const [office, rows, events, sessionEvents, attempts] = await Promise.all([
    getActiveOfficeLocation(),
    getEmployeeAttendanceRows(selectedDate),
    getAttendanceEventsForDate(selectedDate),
    getEmployeeSessionEventsForDate(selectedDate),
    getRecentAttendanceAttempts(20),
  ]);
  const eventMap = groupEventsByAttendance(events);
  const sessionEventMap = groupSessionEventsByUser(sessionEvents);
  const selectedEmployee = params?.employee || "ALL";
  const allowedStatuses = new Set(["ALL", "COMPLETED", "WORKING", "ON_BREAK", "NOT_PUNCHED", "REVIEW_REQUIRED"]);
  const selectedStatus = allowedStatuses.has(params?.status || "ALL")
    ? params?.status || "ALL"
    : "ALL";
  const filteredRows = rows.filter((row) =>
    (selectedEmployee === "ALL" || row.userId === selectedEmployee) &&
    (selectedStatus === "ALL" || getStatusFilterValue(row) === selectedStatus),
  );
  const exportHref = `/internal/attendance/export?date=${encodeURIComponent(selectedDate)}&employee=${encodeURIComponent(selectedEmployee)}&status=${encodeURIComponent(selectedStatus)}`;

  const completedCount = rows.filter(
    (row) => row.punchOutAt || row.status === "COMPLETED",
  ).length;
  const punchedInCount = rows.filter(
    (row) => row.punchInAt && !row.punchOutAt && !row.currentBreakType,
  ).length;
  const onBreakCount = rows.filter((row) => row.currentBreakType).length;
  const notPunchedCount = rows.filter((row) => !row.punchInAt).length;
  const blockedAttempts = attempts.filter(
    (attempt) => attempt.status === "BLOCKED_OUTSIDE_OFFICE",
  ).length;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-7 dark:border-white/10 dark:bg-slate-900">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/[0.08] blur-3xl dark:bg-blue-500/10"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
              Workforce operations
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl dark:text-white">
              Daily Employee Activity
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              See every employee&apos;s login, attendance, breaks, Punch Out and
              automatic all-device logout in one simple daily view.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <ActionLink
                href="/internal/attendance/summary"
                label="Attendance Summary"
              />
              <ActionLink
                href="/internal/attendance/payroll"
                label="Payroll"
              />
              <ActionLink
                href="/internal/attendance/settings"
                label="Office Setup"
              />
              <ActionLink
                href="/account/attendance"
                label="My Attendance"
                primary
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Download daily activity
              </span>
              <ReportExportButtons href={exportHref} compact />
            </div>
          </div>

          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 xl:w-[430px] dark:border-white/10 dark:bg-white/[0.035]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">
                  Attendance date
                </p>
                <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                  {formatSelectedDate(selectedDate)}
                </p>
              </div>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  office ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </div>

            <form className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Date</span>
                <input
                  aria-label="Attendance date"
                  name="date"
                  type="date"
                  defaultValue={selectedDate}
                  className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Employee</span>
                <select name="employee" defaultValue={selectedEmployee} className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
                  <option value="ALL">All employees</option>
                  {rows.map((row) => <option key={row.userId} value={row.userId}>{row.userName}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Status</span>
                <select name="status" defaultValue={selectedStatus} className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
                  <option value="ALL">All statuses</option>
                  <option value="WORKING">Currently working</option>
                  <option value="ON_BREAK">On break</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="NOT_PUNCHED">Not punched in</option>
                  <option value="REVIEW_REQUIRED">Review required</option>
                </select>
              </label>
              <button className="mt-auto h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700">
                Apply Filters
              </button>
            </form>
          </div>
        </div>
      </section>

      {!office ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/[0.08] dark:text-amber-200">
          <h2 className="font-black">Office location is not configured</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-amber-800/80 dark:text-amber-200/75">
            Attendance punch, break and Punch Out actions will stay blocked
            until the owner sets an office location and radius.
          </p>
        </div>
      ) : null}

      {params?.success === "attendance-corrected" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/[0.08] dark:text-emerald-200">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          Attendance was corrected and the audit history was saved.
        </div>
      ) : null}

      {params?.error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/[0.08] dark:text-rose-200">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
          The attendance correction could not be saved. Check the times and
          reason, then try again.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Completed"
          value={completedCount}
          helper="Shift closed"
          tone="emerald"
        />
        <MetricCard
          label="Currently In"
          value={punchedInCount}
          helper="Actively working"
          tone="blue"
        />
        <MetricCard
          label="On Break"
          value={onBreakCount}
          helper="Break timer active"
          tone="amber"
        />
        <MetricCard
          label="Not Punched"
          value={notPunchedCount}
          helper="No Punch In yet"
          tone="slate"
        />
        <MetricCard
          label="Recent Blocks"
          value={blockedAttempts}
          helper="Outside office area"
          tone="rose"
        />
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
              Daily workforce register
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Employee day timeline
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {office ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {office.name} · {office.radiusMeters}m
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {filteredRows.length} of {rows.length} employees
            </span>
          </div>
        </div>

        <div className="space-y-3 bg-slate-50/60 p-3 sm:p-4 dark:bg-slate-950/35">
          {filteredRows.map((row) => {
            const statusLabel = getStatusLabel(row);
            const rowEvents = row.attendanceId
              ? eventMap.get(row.attendanceId) || []
              : [];
            const rowSessionEvents = sessionEventMap.get(row.userId) || [];
            const firstLogin = rowSessionEvents.find((event) => event.eventType === "LOGIN_SUCCESS");
            const lastLogout = [...rowSessionEvents].reverse().find((event) => event.eventType === "LOGOUT");
            const activityEvents = [
              ...rowEvents.map((event) => ({
                id: event.id,
                label: getAttendanceActionLabel(event.eventType),
                createdAt: event.createdAt,
                distanceMeters: event.distanceMeters,
                photoDataUrl: event.photoDataUrl,
                note: event.note,
              })),
              ...rowSessionEvents.map((event) => ({
                id: event.id,
                label: getSessionEventLabel(event),
                createdAt: event.createdAt,
                distanceMeters: null,
                photoDataUrl: null,
                note: event.description,
              })),
            ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            return (
              <article
                key={row.userId}
                className={`overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:bg-slate-900 ${
                  statusLabel === "Review Required"
                    ? "border-rose-200 dark:border-rose-400/25"
                    : "border-slate-200/90 dark:border-white/10"
                }`}
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white dark:bg-blue-600">
                        {getInitials(row.userName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950 dark:text-white">
                          {row.userName}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
                          {row.userEmail}
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                          {formatRole(row.userRole)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-[10px] font-black ring-1 ${getStatusClass(
                        statusLabel,
                      )}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-6 dark:border-white/10 dark:bg-white/10">
                    <div className="bg-slate-50 p-4 dark:bg-white/[0.035]">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Login</p>
                      <p className="mt-2 text-sm font-black text-blue-700 dark:text-blue-300">{formatIndiaTime(firstLogin?.createdAt)}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">First successful login</p>
                    </div>
                    <div className="bg-slate-50 p-4 dark:bg-white/[0.035]">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Punch In
                      </p>
                      <p className="mt-2 text-sm font-black text-slate-800 dark:text-slate-100">
                        {formatIndiaTime(row.punchInAt)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {formatDistance(row.punchInDistanceMeters)}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-4 dark:bg-white/[0.035]">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Punch Out
                      </p>
                      <p className="mt-2 text-sm font-black text-slate-800 dark:text-slate-100">
                        {formatIndiaTime(row.punchOutAt)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {formatDistance(row.punchOutDistanceMeters)}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-4 dark:bg-white/[0.035]">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Break Time
                      </p>
                      <p className="mt-2 text-sm font-black text-amber-700 dark:text-amber-300">
                        {formatDuration(row.breakMinutes)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {row.currentBreakType
                          ? `On ${getBreakTypeLabel(row.currentBreakType)}`
                          : "No active break"}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-4 dark:bg-white/[0.035]">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Net Work
                      </p>
                      <p className="mt-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
                        {formatDuration(row.netWorkingMinutes)}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {formatDuration(row.totalMinutes)} total office time
                      </p>
                    </div>
                    <div className="bg-slate-50 p-4 dark:bg-white/[0.035]">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Session End</p>
                      <p className="mt-2 text-sm font-black text-rose-700 dark:text-rose-300">{formatIndiaTime(lastLogout?.createdAt)}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">{lastLogout?.description?.toLowerCase().includes("all devices") ? "All devices logged out" : lastLogout ? "Logout recorded" : "Session still open / no login"}</p>
                    </div>
                  </div>
                </div>

                <details
                  className="group border-t border-slate-100 dark:border-white/10"
                  open={statusLabel === "Review Required"}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 sm:px-5 dark:text-slate-300 dark:hover:bg-white/[0.035]">
                    <span className="flex items-center gap-2">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-blue-600 dark:text-blue-300"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 5h16v14H4z" />
                        <path d="m8 14 2-2 2 2 4-4 2 2" />
                      </svg>
                      Complete activity timeline and manager correction
                    </span>
                    <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                      {activityEvents.length} events
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 transition group-open:rotate-180"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </span>
                  </summary>

                  <div className="grid gap-5 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] dark:border-white/10 dark:bg-slate-950/35">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                          Verified timeline
                        </h3>
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Server time
                        </span>
                      </div>

                      {activityEvents.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {activityEvents.map((event, index) => (
                            <div
                              key={event.id}
                              className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[10px] font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                                  <div>
                                    <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                                      {event.label}
                                    </p>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                                      {formatIndiaTime(event.createdAt)}
                                      {event.distanceMeters !== null ? ` · ${formatDistance(event.distanceMeters)}` : ""}
                                    </p>
                                    {event.note ? <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500 dark:text-slate-400">{event.note}</p> : null}
                                  </div>
                                  {event.photoDataUrl ? (
                                    <Image
                                      src={event.photoDataUrl}
                                      alt={event.label}
                                      width={80}
                                      height={56}
                                      unoptimized
                                      className="h-14 w-20 rounded-xl border border-slate-200 object-cover dark:border-white/10"
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400 dark:border-white/10 dark:bg-slate-900">
                          No login or attendance activity recorded for this employee.
                        </div>
                      )}
                    </div>

                    <div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                          Manager correction
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          Every saved change is added to the audit history.
                        </p>
                      </div>

                      {row.attendanceId ? (
                        <form
                          action={correctAttendanceAction}
                          className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
                        >
                          <input
                            type="hidden"
                            name="attendanceId"
                            value={row.attendanceId}
                          />
                          <input
                            type="hidden"
                            name="selectedDate"
                            value={selectedDate}
                          />

                          <div className="grid gap-3 sm:grid-cols-2">
                            <label>
                              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
                                Punch In
                              </span>
                              <input
                                name="correctedPunchIn"
                                type="datetime-local"
                                defaultValue={formatIndiaDateTimeLocal(
                                  row.punchInAt,
                                )}
                                required
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
                              />
                            </label>
                            <label>
                              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
                                Punch Out
                              </span>
                              <input
                                name="correctedPunchOut"
                                type="datetime-local"
                                defaultValue={formatIndiaDateTimeLocal(
                                  row.punchOutAt,
                                )}
                                required
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
                              />
                            </label>
                          </div>

                          <label>
                            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
                              Correction reason
                            </span>
                            <input
                              name="reason"
                              required
                              autoComplete="off"
                              placeholder="Add a clear audit reason"
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/10"
                            />
                          </label>

                          <button className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700">
                            Save Audited Correction
                          </button>
                        </form>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-semibold text-slate-400 dark:border-white/10 dark:bg-slate-900">
                          No attendance record is available to correct.
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </article>
            );
          })}
          {rows.length > 0 && filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center dark:border-white/10 dark:bg-slate-900">
              <p className="text-sm font-black text-slate-700 dark:text-slate-200">No employees match these filters</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Change employee, status or date and try again.</p>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900">
              <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                No workforce records found
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                There are no attendance-enabled employees for this date.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Security trail
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Recent attendance attempts
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Latest approved and blocked punch, break and Punch Out requests.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
            Last {attempts.length}
          </span>
        </div>

        <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
          {attempts.map((attempt) => {
            const approved = attempt.status === "APPROVED";

            return (
              <article
                key={attempt.id}
                className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.035]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${
                        approved
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                      }`}
                    >
                      {getInitials(attempt.userName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                        {attempt.userName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                        {getAttendanceActionLabel(attempt.actionType)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
                      approved
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                    }`}
                  >
                    {attempt.status.replaceAll("_", " ")}
                  </span>
                </div>

                <p className="mt-3 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">
                  {attempt.message || "Attendance request recorded."}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-400">
                  <span>{formatIndiaDateTime(attempt.attemptedAt)}</span>
                  <span>{formatDistance(attempt.distanceMeters)}</span>
                </div>
              </article>
            );
          })}

          {attempts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-sm font-semibold text-slate-400 dark:border-white/10">
              No attendance attempts found yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
