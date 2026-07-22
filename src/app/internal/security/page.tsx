import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { clearAllSecurityLogsAction, clearOldSecurityLogsAction } from "./actions";

type SecurityAuditLogRow = {
  id: string;
  eventType: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  path: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  description: string | null;
  createdAt: Date | string;
};

const eventFilterOptions = [
  { value: "ALL", label: "All Events" },
  { value: "LOGIN_SUCCESS", label: "Login Success" },
  { value: "LOGIN_FAILED", label: "Login Failed" },
  { value: "LOGOUT", label: "Logout" },
  { value: "ACCESS_DENIED", label: "Access Denied" },
  { value: "PASSWORD_RESET", label: "Password Reset" },
  { value: "PASSWORD_CHANGED", label: "Password Changed" },
  { value: "USER_CREATED", label: "User Created" },
  { value: "USER_UPDATED", label: "User Updated" },
  { value: "USER_STATUS_CHANGED", label: "User Status Changed" },
  { value: "USER_ROLE_CHANGED", label: "User Role Changed" },
  { value: "DEALER_MEMBER_CREATED", label: "Dealer Member Created" },
  { value: "DEALER_MEMBER_UPDATED", label: "Dealer Member Updated" },
  { value: "DEALER_MEMBER_DELETED", label: "Dealer Member Deleted" },
  { value: "FIRST_OWNER_CREATED", label: "First Owner Created" },
  { value: "OFFICE_LOCATION_UPDATED", label: "Office Location Updated" },
  { value: "ATTENDANCE_PUNCH", label: "Attendance Punch" },
  { value: "ATTENDANCE_BREAK", label: "Attendance Break" },
  { value: "ATTENDANCE_BLOCKED", label: "Attendance Blocked" },
  { value: "ATTENDANCE_PAY_PROFILE_UPDATED", label: "Attendance Pay Profile Updated" },
  { value: "ATTENDANCE_ADVANCE_REQUESTED", label: "Attendance Advance Requested" },
  { value: "ATTENDANCE_ADVANCE_APPROVED", label: "Attendance Advance Approved" },
  { value: "ATTENDANCE_ADVANCE_REJECTED", label: "Attendance Advance Rejected" },
  { value: "ATTENDANCE_LEAVE_REQUESTED", label: "Attendance Leave Requested" },
  { value: "ATTENDANCE_OWNER_UNAVAILABLE_RECORDED", label: "Owner Unavailable Recorded" },
  { value: "ATTENDANCE_LEAVE_APPROVED", label: "Attendance Leave Approved" },
  { value: "ATTENDANCE_LEAVE_REJECTED", label: "Attendance Leave Rejected" },
  { value: "TRANSPORT_OPTION_CREATED", label: "Transport Created" },
  { value: "TRANSPORT_OPTION_UPDATED", label: "Transport Updated" },
  { value: "TRANSPORT_OPTION_DISABLED", label: "Transport Disabled" },
  { value: "TRANSPORT_ASSIGNED", label: "Transport Assigned" },
  { value: "DELIVERY_PROOF_UPLOADED", label: "Delivery Proof Uploaded" },
  { value: "ORDER_RECEIVED", label: "Order Received" },
  { value: "ORDER_RECEIVING_UPDATED", label: "Order Receiving Updated" },
  { value: "INVENTORY_INQUIRY_CREATED", label: "Inquiry Created" },
  { value: "INVENTORY_INQUIRY_UPDATED", label: "Inquiry Updated" },
  { value: "WORK_TEAM_CREATED", label: "Team Created" },
  { value: "WORK_TEAM_UPDATED", label: "Team Updated" },
  { value: "WORK_TEAM_MEMBER_UPDATED", label: "Team Member Updated" },
  { value: "WORK_TASK_CREATED", label: "Task Created" },
  { value: "WORK_TASK_UPDATED", label: "Task Updated" },
  { value: "WORK_TASK_COMMENTED", label: "Task Commented" },
  { value: "WORK_TASK_STATUS_CHANGED", label: "Task Status Changed" },
  { value: "WORK_TASK_REMINDER_SWEEP", label: "Task Reminder Sweep" },
  { value: "FIELD_VISIT_CREATED", label: "Field Visit Created" },
  { value: "FIELD_VISIT_UPDATED", label: "Field Visit Updated" },
  { value: "COLLECTION_CREATED", label: "Collection Created" },
  { value: "COLLECTION_UPDATED", label: "Collection Updated" },
  { value: "COLLECTION_STATUS_CHANGED", label: "Collection Status Changed" },
  { value: "COLLECTION_PROOF_UPLOADED", label: "Collection Proof Uploaded" },
  { value: "COLLECTION_VERIFIED", label: "Collection Verified" },
];

const inputClass =
  "h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const selectClass = `${inputClass} appearance-none pr-12`;

const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 1rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "18px 18px",
} as const;

function parseSqliteUtcDate(value: Date | string) {
  if (value instanceof Date) return value;
  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const utcValue = normalizedValue.endsWith("Z") ? normalizedValue : `${normalizedValue}Z`;
  return new Date(utcValue);
}

function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parseSqliteUtcDate(date));
}

function getEventLabel(eventType: string) {
  if (eventType === "LOGIN_SUCCESS") return "Login Success";
  if (eventType === "LOGIN_FAILED") return "Login Failed";
  if (eventType === "LOGOUT") return "Logout";
  if (eventType === "ACCESS_DENIED") return "Access Denied";
  if (eventType === "PASSWORD_RESET") return "Password Reset";
  if (eventType === "PASSWORD_CHANGED") return "Password Changed";
  if (eventType === "USER_CREATED") return "User Created";
  if (eventType === "USER_UPDATED") return "User Updated";
  if (eventType === "USER_STATUS_CHANGED") return "User Status Changed";
  if (eventType === "USER_ROLE_CHANGED") return "User Role Changed";
  if (eventType === "DEALER_MEMBER_CREATED") return "Dealer Member Created";
  if (eventType === "DEALER_MEMBER_UPDATED") return "Dealer Member Updated";
  if (eventType === "DEALER_MEMBER_DELETED") return "Dealer Member Deleted";
  if (eventType === "FIRST_OWNER_CREATED") return "First Owner Created";
  if (eventType === "OFFICE_LOCATION_UPDATED") return "Office Location Updated";
  if (eventType === "ATTENDANCE_PUNCH") return "Attendance Punch";
  if (eventType === "ATTENDANCE_BREAK") return "Attendance Break";
  if (eventType === "ATTENDANCE_BLOCKED") return "Attendance Blocked";
  if (eventType === "ATTENDANCE_PAY_PROFILE_UPDATED") return "Attendance Pay Profile Updated";
  if (eventType === "ATTENDANCE_ADVANCE_REQUESTED") return "Attendance Advance Requested";
  if (eventType === "ATTENDANCE_ADVANCE_APPROVED") return "Attendance Advance Approved";
  if (eventType === "ATTENDANCE_ADVANCE_REJECTED") return "Attendance Advance Rejected";
  if (eventType === "ATTENDANCE_LEAVE_REQUESTED") return "Attendance Leave Requested";
  if (eventType === "ATTENDANCE_OWNER_UNAVAILABLE_RECORDED") return "Owner Unavailable Recorded";
  if (eventType === "ATTENDANCE_LEAVE_APPROVED") return "Attendance Leave Approved";
  if (eventType === "ATTENDANCE_LEAVE_REJECTED") return "Attendance Leave Rejected";
  if (eventType === "TRANSPORT_OPTION_CREATED") return "Transport Created";
  if (eventType === "TRANSPORT_OPTION_UPDATED") return "Transport Updated";
  if (eventType === "TRANSPORT_OPTION_DISABLED") return "Transport Disabled";
  if (eventType === "TRANSPORT_ASSIGNED") return "Transport Assigned";
  if (eventType === "DELIVERY_PROOF_UPLOADED") return "Delivery Proof Uploaded";
  if (eventType === "ORDER_RECEIVED") return "Order Received";
  if (eventType === "ORDER_RECEIVING_UPDATED") return "Order Receiving Updated";
  if (eventType === "INVENTORY_INQUIRY_CREATED") return "Inquiry Created";
  if (eventType === "INVENTORY_INQUIRY_UPDATED") return "Inquiry Updated";
  if (eventType === "WORK_TEAM_CREATED") return "Team Created";
  if (eventType === "WORK_TEAM_UPDATED") return "Team Updated";
  if (eventType === "WORK_TEAM_MEMBER_UPDATED") return "Team Member Updated";
  if (eventType === "WORK_TASK_CREATED") return "Task Created";
  if (eventType === "WORK_TASK_UPDATED") return "Task Updated";
  if (eventType === "WORK_TASK_COMMENTED") return "Task Commented";
  if (eventType === "WORK_TASK_STATUS_CHANGED") return "Task Status Changed";
  if (eventType === "WORK_TASK_REMINDER_SWEEP") return "Task Reminder Sweep";
  if (eventType === "FIELD_VISIT_CREATED") return "Field Visit Created";
  if (eventType === "FIELD_VISIT_UPDATED") return "Field Visit Updated";
  if (eventType === "COLLECTION_CREATED") return "Collection Created";
  if (eventType === "COLLECTION_UPDATED") return "Collection Updated";
  if (eventType === "COLLECTION_STATUS_CHANGED") return "Collection Status Changed";
  if (eventType === "COLLECTION_PROOF_UPLOADED") return "Collection Proof Uploaded";
  if (eventType === "COLLECTION_VERIFIED") return "Collection Verified";
  return eventType;
}

function getEventClass(eventType: string) {
  if (
    eventType === "LOGIN_SUCCESS" ||
    eventType === "FIRST_OWNER_CREATED" ||
    eventType === "ATTENDANCE_PUNCH" ||
    eventType === "ATTENDANCE_ADVANCE_APPROVED" ||
    eventType === "ATTENDANCE_LEAVE_APPROVED" ||
    eventType === "ATTENDANCE_OWNER_UNAVAILABLE_RECORDED" ||
    eventType === "USER_CREATED" ||
    eventType === "DEALER_MEMBER_CREATED"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (
    eventType === "LOGIN_FAILED" ||
    eventType === "ACCESS_DENIED" ||
    eventType === "ATTENDANCE_BLOCKED" ||
    eventType === "ATTENDANCE_ADVANCE_REJECTED" ||
    eventType === "ATTENDANCE_LEAVE_REJECTED" ||
    eventType === "TRANSPORT_OPTION_DISABLED" ||
    eventType === "DEALER_MEMBER_DELETED"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300";
  }

  if (
    eventType === "PASSWORD_RESET" ||
    eventType === "PASSWORD_CHANGED" ||
    eventType === "OFFICE_LOCATION_UPDATED" ||
    eventType === "ATTENDANCE_BREAK" ||
    eventType === "ATTENDANCE_PAY_PROFILE_UPDATED" ||
    eventType === "ATTENDANCE_ADVANCE_REQUESTED" ||
    eventType === "ATTENDANCE_LEAVE_REQUESTED" ||
    eventType === "USER_ROLE_CHANGED" ||
    eventType === "USER_STATUS_CHANGED"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300";
  }

  if (
    eventType === "USER_UPDATED" ||
    eventType === "DEALER_MEMBER_UPDATED" ||
    eventType.startsWith("TRANSPORT") ||
    eventType.startsWith("ORDER") ||
    eventType.startsWith("INVENTORY") ||
    eventType.startsWith("WORK_TEAM") ||
    eventType.startsWith("WORK_TASK") ||
    eventType.startsWith("FIELD_VISIT") ||
    eventType.startsWith("COLLECTION") ||
    eventType === "DELIVERY_PROOF_UPLOADED"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300";
  }

  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
}

function getIpLabel(ipAddress: string | null) {
  if (!ipAddress) return "-";
  if (ipAddress === "::1" || ipAddress === "127.0.0.1") return "Localhost";
  return ipAddress;
}

function getBrowserLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown Browser";
  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("Chrome/") && !userAgent.includes("Chromium/")) return "Chrome";
  if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) return "Safari";
  if (userAgent.includes("Firefox/")) return "Firefox";
  return "Browser";
}

function getOsLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown OS";
  if (userAgent.includes("Mac OS X")) return "macOS";
  if (userAgent.includes("Windows NT")) return "Windows";
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) return "iOS";
  if (userAgent.includes("Linux")) return "Linux";
  return "Device";
}

function getDeviceLabel(log: SecurityAuditLogRow) {
  return `${getBrowserLabel(log.userAgent)} · ${getOsLabel(log.userAgent)} · ${getIpLabel(log.ipAddress)}`;
}

function matchesSearch(log: SecurityAuditLogRow, query: string) {
  if (!query) return true;
  const haystack = [
    log.eventType,
    getEventLabel(log.eventType),
    log.userName,
    log.userEmail,
    log.userRole,
    log.path,
    log.ipAddress,
    log.description,
    log.userAgent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

async function getSecurityLogs() {
  try {
    return await prisma.$queryRaw<SecurityAuditLogRow[]>`
      SELECT
        "id",
        "eventType"::text AS "eventType",
        "userId",
        "userName",
        "userEmail",
        "userRole",
        "path",
        "ipAddress",
        "userAgent",
        "description",
        "createdAt"
      FROM public."SecurityAuditLog"
      ORDER BY "createdAt" DESC
      LIMIT 500
    `;
  } catch (error) {
    console.error("Security logs query failed:", error);
    return null;
  }
}

export default async function SecurityLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ eventType?: string; q?: string; success?: string; error?: string }>;
}) {
  const { hasAccess } = await checkPermission("view_security_logs", "/internal/security");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Security Logs Access Denied"
        description="Only the owner can view authentication and access audit logs."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const params = await searchParams;
  const selectedEventType = params?.eventType || "ALL";
  const searchQuery = (params?.q || "").trim();
  const logs = await getSecurityLogs();

  if (!logs) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
        <p className="text-xs font-black uppercase tracking-[0.25em]">Security Logs</p>
        <h1 className="mt-3 text-2xl font-black">Security table is not ready</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6">
          The SecurityAuditLog table is missing or Prisma migration is not applied yet. Run the migration and Prisma generate commands, then restart the dev server.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-2xl border border-rose-200 bg-white p-4 text-xs text-rose-700 dark:border-rose-400/20 dark:bg-slate-950 dark:text-rose-200">{`npx prisma migrate dev\nnpx prisma generate\nrm -rf .next\nnpm run dev`}</pre>
      </div>
    );
  }

  const filteredLogs = logs.filter((log) => {
    const eventMatches = selectedEventType === "ALL" || log.eventType === selectedEventType;
    return eventMatches && matchesSearch(log, searchQuery);
  });

  const loginSuccessCount = logs.filter((log) => log.eventType === "LOGIN_SUCCESS").length;
  const loginFailedCount = logs.filter((log) => log.eventType === "LOGIN_FAILED").length;
  const accessDeniedCount = logs.filter((log) => log.eventType === "ACCESS_DENIED").length;
  const exportHref = `/internal/security/export?eventType=${encodeURIComponent(selectedEventType)}&q=${encodeURIComponent(searchQuery)}`;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600 dark:text-cyan-300">Security</p>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-950 dark:text-slate-100">Security Audit Logs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Track login activity, permission denials, user management changes, task updates, and sensitive ERP actions.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            Latest 500 events · IST
          </div>
        </div>
      </section>

      {params?.success === "old-cleared" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Old security logs were cleared successfully.
        </div>
      ) : null}

      {params?.success === "all-cleared" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          All previous security logs were cleared successfully.
        </div>
      ) : null}

      {params?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300">
          Security action failed: {params.error.replaceAll("-", " ")}.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Successful Logins</p>
          <p className="mt-3 text-3xl font-black text-emerald-700 dark:text-emerald-300">{loginSuccessCount}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Failed Logins</p>
          <p className="mt-3 text-3xl font-black text-rose-700 dark:text-rose-300">{loginFailedCount}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Access Denied</p>
          <p className="mt-3 text-3xl font-black text-amber-700 dark:text-amber-300">{accessDeniedCount}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_430px] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Filters</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Showing <span className="font-black text-slate-950 dark:text-slate-100">{filteredLogs.length}</span> of {logs.length} latest events.
                </p>
              </div>

            </div>

            <form className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  Event Type
                </label>
                <select name="eventType" defaultValue={selectedEventType} className={selectClass} style={selectArrowStyle}>
                  {eventFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  Search
                </label>
                <input
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search user, email, path, device, details..."
                  className={inputClass}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:gap-3">
                <button type="submit" className="h-14 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
                  Apply
                </button>
                <Link href="/internal/security" className="inline-flex h-14 items-center justify-center rounded-2xl border border-slate-200 px-6 text-sm font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-950">
                  Reset
                </Link>
              </div>
            </form>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
              Maintenance
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Export logs for audit reports or clear old entries after review.
            </p>

            <div className="mt-4 grid gap-3">
              <Link
                href={exportHref}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20"
              >
                Export CSV
              </Link>

              <form action={clearOldSecurityLogsAction}>
                <button
                  type="submit"
                  className="h-12 w-full rounded-2xl border border-amber-200 bg-amber-50 px-5 text-sm font-black text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                >
                  Clear 30+ Days
                </button>
              </form>

              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-400/30 dark:bg-rose-500/10">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
                  Danger Zone
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-rose-700 dark:text-rose-200">
                  This permanently clears all previous security log records. Export CSV before using this action.
                </p>
                <form action={clearAllSecurityLogsAction} className="mt-4">
                  <button
                    type="submit"
                    className="h-12 w-full rounded-2xl bg-rose-500 px-4 text-sm font-black text-white transition hover:bg-rose-600 dark:bg-rose-300 dark:text-slate-950 dark:hover:bg-rose-200"
                  >
                    Clear All Logs
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-4 font-black">Time (IST)</th>
                <th className="px-5 py-4 font-black">Event</th>
                <th className="px-5 py-4 font-black">User</th>
                <th className="px-5 py-4 font-black">Path</th>
                <th className="px-5 py-4 font-black">Device</th>
                <th className="px-5 py-4 font-black">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-950/70">
                  <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-600 dark:text-slate-300">{formatDateTime(log.createdAt)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${getEventClass(log.eventType)}`}>
                      {getEventLabel(log.eventType)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-black text-slate-950 dark:text-slate-100">{log.userName || "Unknown"}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{log.userEmail || "No email"}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-400">{log.path || "-"}</td>
                  <td className="max-w-[260px] px-5 py-4 text-slate-600 dark:text-slate-400">{getDeviceLabel(log)}</td>
                  <td className="max-w-[340px] px-5 py-4 text-slate-500 dark:text-slate-400">{log.description || "-"}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400">
                    No security events match the selected filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 lg:hidden">
          {filteredLogs.map((log) => (
            <article key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getEventClass(log.eventType)}`}>
                  {getEventLabel(log.eventType)}
                </span>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{formatDateTime(log.createdAt)}</p>
              </div>
              <div className="mt-4">
                <p className="font-black text-slate-950 dark:text-slate-100">{log.userName || "Unknown"}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{log.userEmail || "No email"}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Path</p>
                  <p className="mt-2 break-words text-slate-600 dark:text-slate-300">{log.path || "-"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Device</p>
                  <p className="mt-2 break-words text-slate-600 dark:text-slate-300">{getDeviceLabel(log)}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">{log.description || "-"}</p>
            </article>
          ))}
          {filteredLogs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              No security events match the selected filter.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
