import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  formatNotificationTime,
  getNotificationModuleLabel,
  getNotificationPriorityLabel,
  getNotificationPriorityTone,
} from "@/lib/notifications";
import { hasPermission } from "@/lib/permissions";
import { acknowledgeAlertAction, resolveAlertAction } from "./actions";

type AlertRow = {
  id: string;
  title: string;
  message: string;
  module: string;
  href: string | null;
  priority: string;
  status: string;
  actorName: string | null;
  createdAt: Date | string;
  acknowledgedAt: Date | string | null;
  resolvedAt: Date | string | null;
  resolutionNote: string | null;
  escalatedAt: Date | string | null;
  isMine: boolean;
};

const priorityOrder: Record<string, number> = {
  CRITICAL: 0,
  BLOCKER: 1,
  HIGH_ALERT: 2,
};

function statusTone(status: string) {
  if (status === "RESOLVED") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  }
  if (status === "ACKNOWLEDGED") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    priority?: string;
    status?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission(
    "view_alert_center",
    "/internal/alerts",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Alert Center Access Denied"
        description="Your current role cannot view internal workflow alerts."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const canManage = hasPermission(currentUser.roles, "manage_alert_center");
  const rows = await prisma.$queryRaw<AlertRow[]>`
    SELECT
      n."id",
      n."title",
      n."message",
      n."module",
      n."href",
      n."priority",
      n."status",
      n."actorName",
      n."createdAt",
      n."acknowledgedAt",
      n."resolvedAt",
      n."resolutionNote",
      n."escalatedAt",
      EXISTS (
        SELECT 1
        FROM public."NotificationRecipient" nr
        WHERE nr."notificationId" = n."id"
          AND nr."userId" = ${currentUser.id}
      ) AS "isMine"
    FROM public."Notification" n
    WHERE n."priority" IN ('HIGH_ALERT', 'BLOCKER', 'CRITICAL')
      AND (
        ${canManage}
        OR EXISTS (
          SELECT 1
          FROM public."NotificationRecipient" nr
          WHERE nr."notificationId" = n."id"
            AND nr."userId" = ${currentUser.id}
        )
      )
    ORDER BY n."createdAt" DESC
    LIMIT 250
  `;

  const priorityFilter = ["HIGH_ALERT", "BLOCKER", "CRITICAL"].includes(
    params?.priority ?? "",
  )
    ? params!.priority!
    : "ALL";
  const statusFilter = ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(
    params?.status ?? "",
  )
    ? params!.status!
    : "ACTIVE";

  const filtered = rows
    .filter((row) =>
      priorityFilter === "ALL" ? true : row.priority === priorityFilter,
    )
    .filter((row) => {
      if (statusFilter === "ACTIVE") return row.status !== "RESOLVED";
      return row.status === statusFilter;
    })
    .sort((a, b) => {
      const priorityDifference =
        (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      if (priorityDifference !== 0) return priorityDifference;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const counts = {
    critical: rows.filter((row) => row.priority === "CRITICAL" && row.status !== "RESOLVED").length,
    blockers: rows.filter((row) => row.priority === "BLOCKER" && row.status !== "RESOLVED").length,
    high: rows.filter((row) => row.priority === "HIGH_ALERT" && row.status !== "RESOLVED").length,
    resolved: rows.filter((row) => row.status === "RESOLVED").length,
  };

  return (
    <main className="space-y-7">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-rose-600 dark:text-rose-300">
              Phase 7 · Internal Alerts
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">
              Alert Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              High alerts, blockers and critical escalations with acknowledgement, resolution notes and permission-safe destinations.
            </p>
          </div>
          <Link
            href="/internal/dashboard"
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Dashboard
          </Link>
        </div>
      </section>

      {params?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {params.error === "resolution-required"
            ? "Add a resolution note before closing an alert."
            : "The alert action could not be completed."}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Critical", counts.critical, "text-fuchsia-700 dark:text-fuchsia-300"],
          ["Blockers", counts.blockers, "text-rose-700 dark:text-rose-300"],
          ["High Alerts", counts.high, "text-orange-700 dark:text-orange-300"],
          ["Resolved", counts.resolved, "text-emerald-700 dark:text-emerald-300"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className={`mt-3 text-4xl font-black ${tone}`}>{value}</p>
          </div>
        ))}
      </section>

      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3">
        <select name="priority" defaultValue={priorityFilter} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <option value="ALL">All priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="BLOCKER">Blocker</option>
          <option value="HIGH_ALERT">High Alert</option>
        </select>
        <select name="status" defaultValue={statusFilter} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <option value="ACTIVE">Active alerts</option>
          <option value="OPEN">Open</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <button className="h-12 rounded-xl bg-slate-950 px-5 text-sm font-black text-white dark:bg-white dark:text-slate-950">
          Apply filters
        </button>
      </form>

      <section className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-black text-slate-950 dark:text-white">No matching alerts</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">The selected queue is clear.</p>
          </div>
        ) : (
          filtered.map((alert) => (
            <article key={alert.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${getNotificationPriorityTone(alert.priority)}`}>
                      {getNotificationPriorityLabel(alert.priority)}
                    </span>
                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(alert.status)}`}>
                      {alert.status.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      {getNotificationModuleLabel(alert.module)}
                    </span>
                    {alert.escalatedAt ? (
                      <span className="text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-300">Escalated</span>
                    ) : null}
                  </div>
                  <h2 className="mt-4 text-xl font-black text-slate-950 dark:text-white">{alert.title}</h2>
                  <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{alert.message}</p>
                  <p className="mt-3 text-xs font-semibold text-slate-400">
                    {alert.actorName ? `${alert.actorName} · ` : ""}{formatNotificationTime(alert.createdAt)}
                  </p>
                  {alert.resolutionNote ? (
                    <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                      Resolution: {alert.resolutionNote}
                    </div>
                  ) : null}
                </div>

                <div className="flex min-w-[260px] flex-col gap-3">
                  {alert.href ? (
                    <Link href={alert.href} className="rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white dark:bg-white dark:text-slate-950">
                      Open related work
                    </Link>
                  ) : null}
                  {canManage && alert.status === "OPEN" ? (
                    <form action={acknowledgeAlertAction}>
                      <input type="hidden" name="notificationId" value={alert.id} />
                      <button className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm font-black text-blue-700 dark:border-blue-500/30 dark:text-blue-300">
                        Acknowledge
                      </button>
                    </form>
                  ) : null}
                  {canManage && alert.status !== "RESOLVED" ? (
                    <form action={resolveAlertAction} className="space-y-2">
                      <input type="hidden" name="notificationId" value={alert.id} />
                      <textarea
                        name="resolutionNote"
                        required
                        minLength={3}
                        placeholder="Resolution note"
                        className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <button className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">
                        Resolve alert
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
