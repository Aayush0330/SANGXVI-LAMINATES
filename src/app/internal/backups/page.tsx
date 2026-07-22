import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

type BackupRow = {
  id: string;
  kind: string;
  status: string;
  fileName: string | null;
  sizeBytes: bigint | number | string | null;
  sha256: string | null;
  triggeredBy: string | null;
  errorMessage: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  verifiedAt: Date | string | null;
};

type ArchiveRow = {
  id: string;
  businessDate: Date | string;
  status: string;
  fileName: string | null;
  sha256: string | null;
  summary: unknown;
  errorMessage: string | null;
  generatedAt: Date | string | null;
};

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value instanceof Date ? value : new Date(value));
}

function formatArchiveDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

function formatBytes(value: bigint | number | string | null) {
  const bytes = Number(value ?? 0);
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(status: string) {
  if (status === "SUCCESS") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  }
  if (status === "FAILED") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  }
  if (status === "DELETED") {
    return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
}

export default async function InternalBackupsPage() {
  const { hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Backup Access Denied"
        description="Your current role does not have permission to manage database backups and recovery records."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [backups, archives] = await Promise.all([
    prisma.$queryRaw<BackupRow[]>`
      SELECT "id","kind","status","fileName","sizeBytes","sha256","triggeredBy","errorMessage","startedAt","completedAt","verifiedAt"
      FROM public."BackupRecord"
      ORDER BY "startedAt" DESC
      LIMIT 40
    `,
    prisma.$queryRaw<ArchiveRow[]>`
      SELECT "id","businessDate","status","fileName","sha256","summary","errorMessage","generatedAt"
      FROM public."DailyBusinessArchive"
      ORDER BY "businessDate" DESC
      LIMIT 31
    `,
  ]);

  const successful = backups.filter((backup) => backup.status === "SUCCESS").length;
  const failed = backups.filter((backup) => backup.status === "FAILED").length;
  const latestSuccessful = backups.find((backup) => backup.status === "SUCCESS");
  const latestDailyArchive = archives.find(
    (archive) => archive.status === "SUCCESS",
  );

  return (
    <main className="space-y-7">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
        <div className="bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 text-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 dark:text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600 dark:text-blue-200">
            Phase 8 · Backup and Recovery
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Recovery Center
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
            Checksum-verified backups, protected restore safeguards and automatically generated daily business archives.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["Successful backups", successful],
              ["Failed attempts", failed],
              [
                "Latest verified",
                latestSuccessful
                  ? formatDate(latestSuccessful.verifiedAt)
                  : "None",
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/15 dark:bg-white/10"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
            Manual backup
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
            Generate verified backup
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Creates a compressed SQL backup, SHA-256 manifest and database history record before downloading.
          </p>
          <a
            href="/internal/backups/download"
            className="mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950"
          >
            Generate & Download Backup
          </a>
        </div>

        <div className="rounded-3xl border border-purple-200 bg-gradient-to-br from-white to-purple-50 p-6 dark:border-purple-500/20 dark:from-slate-900 dark:to-purple-950/30">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-300">
            Automatic daily archive
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
            Generated every day automatically
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            The previous business day is archived automatically at 2:00 AM IST as readable HTML and JSON. Opening the download also generates the latest archive if the schedule was missed.
          </p>
          <Link
            href="/internal/backups/daily/latest"
            className="mt-5 inline-flex rounded-2xl bg-purple-600 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-700"
          >
            {latestDailyArchive
              ? "Download Latest Daily Archive"
              : "Generate & Download Latest Archive"}
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
              Backup history
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Database backups
            </h2>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            Automatic schedule: every 4 hours
          </p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:border-slate-800">
                <th className="py-3 pr-4">Type</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">File</th>
                <th className="py-3 pr-4">Size</th>
                <th className="py-3 pr-4">Triggered by</th>
                <th className="py-3 pr-4">Created</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr
                  key={backup.id}
                  className="border-b border-slate-100 dark:border-slate-800/70"
                >
                  <td className="py-4 pr-4 font-black text-slate-700 dark:text-slate-200">
                    {backup.kind.replaceAll("_", " ")}
                  </td>
                  <td className="py-4 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusTone(backup.status)}`}
                    >
                      {backup.status}
                    </span>
                  </td>
                  <td
                    className="max-w-[260px] truncate py-4 pr-4 font-semibold text-slate-600 dark:text-slate-300"
                    title={backup.fileName ?? backup.errorMessage ?? ""}
                  >
                    {backup.fileName ?? backup.errorMessage ?? "—"}
                  </td>
                  <td className="py-4 pr-4 font-semibold text-slate-500">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="py-4 pr-4 font-semibold text-slate-500">
                    {backup.triggeredBy ?? "System"}
                  </td>
                  <td className="py-4 pr-4 font-semibold text-slate-500">
                    {formatDate(backup.completedAt ?? backup.startedAt)}
                  </td>
                  <td className="py-4">
                    {backup.status === "SUCCESS" ? (
                      <Link
                        href={`/internal/backups/file/${backup.id}`}
                        className="font-black text-blue-600 dark:text-cyan-300"
                      >
                        Download
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {backups.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-slate-400"
                  >
                    No backup history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-300">
              Automatic archive history
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Daily business archives
            </h2>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            Generated daily at 2:00 AM IST
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {archives.map((archive) => (
            <div
              key={archive.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-black text-slate-950 dark:text-white">
                  {formatArchiveDate(archive.businessDate)}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {archive.fileName ?? archive.errorMessage ?? archive.status}
                </p>
              </div>
              {archive.status === "SUCCESS" ? (
                <Link
                  href={`/internal/backups/daily/${archive.id}`}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-center text-xs font-black text-white transition hover:bg-purple-700"
                >
                  Download HTML
                </Link>
              ) : (
                <span
                  className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${statusTone(archive.status)}`}
                >
                  {archive.status}
                </span>
              )}
            </div>
          ))}
          {archives.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              The first automatic daily archive will appear after the scheduled run.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
