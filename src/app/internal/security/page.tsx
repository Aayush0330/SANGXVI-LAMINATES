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
  { value: "FIRST_OWNER_CREATED", label: "First Owner Created" },
  { value: "OFFICE_LOCATION_UPDATED", label: "Office Location Updated" },
  { value: "ATTENDANCE_PUNCH", label: "Attendance Punch" },
  { value: "ATTENDANCE_BREAK", label: "Attendance Break" },
  { value: "ATTENDANCE_BLOCKED", label: "Attendance Blocked" },
  { value: "TRANSPORT_OPTION_CREATED", label: "Transport Created" },
  { value: "TRANSPORT_OPTION_UPDATED", label: "Transport Updated" },
  { value: "TRANSPORT_OPTION_DISABLED", label: "Transport Disabled" },
  { value: "TRANSPORT_ASSIGNED", label: "Transport Assigned" },
  { value: "DELIVERY_PROOF_UPLOADED", label: "Delivery Proof Uploaded" },
];

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
  if (eventType === "FIRST_OWNER_CREATED") return "First Owner Created";
  if (eventType === "OFFICE_LOCATION_UPDATED") return "Office Location Updated";
  if (eventType === "ATTENDANCE_PUNCH") return "Attendance Punch";
  if (eventType === "ATTENDANCE_BREAK") return "Attendance Break";
  if (eventType === "ATTENDANCE_BLOCKED") return "Attendance Blocked";
  if (eventType === "TRANSPORT_OPTION_CREATED") return "Transport Created";
  if (eventType === "TRANSPORT_OPTION_UPDATED") return "Transport Updated";
  if (eventType === "TRANSPORT_OPTION_DISABLED") return "Transport Disabled";
  if (eventType === "TRANSPORT_ASSIGNED") return "Transport Assigned";
  if (eventType === "DELIVERY_PROOF_UPLOADED") return "Delivery Proof Uploaded";
  return eventType;
}

function getEventClass(eventType: string) {
  if (eventType === "LOGIN_SUCCESS" || eventType === "FIRST_OWNER_CREATED" || eventType === "ATTENDANCE_PUNCH") return "bg-emerald-300/10 text-emerald-300";
  if (eventType === "ATTENDANCE_BREAK") return "bg-yellow-300/10 text-yellow-300";
  if (eventType === "TRANSPORT_OPTION_CREATED" || eventType === "TRANSPORT_OPTION_UPDATED" || eventType === "TRANSPORT_ASSIGNED" || eventType === "DELIVERY_PROOF_UPLOADED") return "bg-blue-300/10 text-blue-300";
  if (eventType === "LOGIN_FAILED" || eventType === "ACCESS_DENIED" || eventType === "ATTENDANCE_BLOCKED" || eventType === "TRANSPORT_OPTION_DISABLED") return "bg-red-300/10 text-red-300";
  if (eventType === "PASSWORD_RESET" || eventType === "PASSWORD_CHANGED" || eventType === "OFFICE_LOCATION_UPDATED") return "bg-yellow-300/10 text-yellow-300";
  return "bg-cyan-300/10 text-cyan-300";
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
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

async function getSecurityLogs() {
  try {
    return await prisma.securityAuditLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });
  } catch (error) {
    console.error("Security logs query failed:", error);
    return null;
  }
}

export default async function SecurityLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ eventType?: string; q?: string; success?: string }>;
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
      <div className="rounded-3xl border border-red-300/20 bg-red-300/10 p-6 text-red-100">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-300">Security Logs</p>
        <h1 className="mt-3 text-2xl font-bold">Security table is not ready</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-red-100/80">The SecurityAuditLog table is missing or Prisma migration is not applied yet. Run the migration and Prisma generate commands, then restart the dev server.</p>
        <pre className="mt-5 overflow-x-auto rounded-2xl border border-red-300/20 bg-slate-950 p-4 text-xs text-red-100">{`npx prisma migrate dev\nnpx prisma generate\nrm -rf .next\nnpm run dev`}</pre>
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
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">Security</p>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold">Security Audit Logs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Track login success, failed login attempts, logout events, setup owner creation, password resets, and access denied activity.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">Latest 500 events · IST</div>
        </div>
      </section>

      {params?.success === "old-cleared" && <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm font-semibold text-emerald-200">Old security logs were cleared successfully.</div>}
      {params?.success === "all-cleared" && <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 text-sm font-semibold text-emerald-200">All previous security logs were cleared successfully.</div>}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Successful Logins</p><p className="mt-3 text-3xl font-black text-emerald-300">{loginSuccessCount}</p></div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Failed Logins</p><p className="mt-3 text-3xl font-black text-red-300">{loginFailedCount}</p></div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Access Denied</p><p className="mt-3 text-3xl font-black text-yellow-300">{accessDeniedCount}</p></div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <form className="grid flex-1 gap-4 md:grid-cols-[220px_1fr_auto]">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Event Type</label>
              <select name="eventType" defaultValue={selectedEventType} className="h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm text-slate-200 outline-none transition focus:border-cyan-300">
                {eventFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Search</label>
              <input name="q" defaultValue={searchQuery} placeholder="Search user, email, path, device, details..." className="h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300" />
            </div>
            <div className="flex gap-3 md:self-end">
              <button type="submit" className="h-12 rounded-2xl bg-cyan-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">Apply</button>
              <Link href="/internal/security" className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 px-5 text-sm font-bold text-slate-300 transition hover:bg-white/[0.04]">Reset</Link>
            </div>
          </form>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={exportHref} className="inline-flex h-12 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 text-sm font-bold text-emerald-200 transition hover:bg-emerald-300/15">Export CSV</Link>
            <form action={clearOldSecurityLogsAction}><button type="submit" className="h-12 w-full rounded-2xl border border-yellow-300/30 bg-yellow-300/10 px-5 text-sm font-bold text-yellow-200 transition hover:bg-yellow-300/15">Clear 30+ Days</button></form>
            <details className="group"><summary className="inline-flex h-12 cursor-pointer list-none items-center justify-center rounded-2xl border border-red-300/30 bg-red-300/10 px-5 text-sm font-bold text-red-200 transition hover:bg-red-300/15">Danger</summary><div className="mt-3 rounded-2xl border border-red-300/20 bg-red-300/10 p-4"><p className="text-xs leading-5 text-red-100/80">This deletes previous security logs. Use only for local demo cleanup.</p><form action={clearAllSecurityLogsAction} className="mt-3"><button type="submit" className="h-10 w-full rounded-xl bg-red-300 px-4 text-xs font-black text-slate-950 transition hover:bg-red-200">Clear All Logs</button></form></div></details>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">Showing {filteredLogs.length} of {logs.length} latest events.</p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-5 py-4 font-semibold">Time (IST)</th><th className="px-5 py-4 font-semibold">Event</th><th className="px-5 py-4 font-semibold">User</th><th className="px-5 py-4 font-semibold">Path</th><th className="px-5 py-4 font-semibold">Device</th><th className="px-5 py-4 font-semibold">Details</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-300">{formatDateTime(log.createdAt)}</td>
                  <td className="px-5 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${getEventClass(log.eventType)}`}>{getEventLabel(log.eventType)}</span></td>
                  <td className="px-5 py-4"><p className="font-bold text-white">{log.userName || "Unknown"}</p><p className="mt-1 text-xs text-slate-500">{log.userEmail || "No email"}</p></td>
                  <td className="px-5 py-4 text-slate-300">{log.path || "-"}</td>
                  <td className="max-w-[260px] px-5 py-4 text-slate-300">{getDeviceLabel(log)}</td>
                  <td className="max-w-[320px] px-5 py-4 text-slate-400">{log.description || "-"}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No security events match the selected filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-4 lg:hidden">
          {filteredLogs.map((log) => (
            <article key={log.id} className="rounded-3xl border border-white/10 bg-slate-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getEventClass(log.eventType)}`}>{getEventLabel(log.eventType)}</span><p className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</p></div>
              <div className="mt-4"><p className="font-bold text-white">{log.userName || "Unknown"}</p><p className="mt-1 text-xs text-slate-500">{log.userEmail || "No email"}</p></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><p className="font-bold uppercase tracking-[0.16em] text-slate-500">Path</p><p className="mt-2 break-words text-slate-300">{log.path || "-"}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><p className="font-bold uppercase tracking-[0.16em] text-slate-500">Device</p><p className="mt-2 break-words text-slate-300">{getDeviceLabel(log)}</p></div></div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{log.description || "-"}</p>
            </article>
          ))}
          {filteredLogs.length === 0 && <div className="rounded-3xl border border-white/10 bg-slate-900 p-8 text-center text-sm text-slate-500">No security events match the selected filter.</div>}
        </div>
      </section>
    </div>
  );
}
