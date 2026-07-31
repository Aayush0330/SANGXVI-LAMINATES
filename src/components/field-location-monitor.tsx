"use client";

import { useEffect, useMemo, useState } from "react";

export type FieldLocationSnapshot = {
  id: string;
  status: "ACTIVE" | "STOPPED";
  startedAt: string;
  endedAt: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastAccuracyMeters: number | null;
  lastRecordedAt: string | null;
  isFresh: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
};

function formatDateTime(value: string | null) {
  if (!value) return "No GPS received";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function FieldLocationMonitor({
  initialSnapshots,
}: {
  initialSnapshots: FieldLocationSnapshot[];
}) {
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [lastRefreshAt, setLastRefreshAt] = useState(new Date());
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/field/location/monitor", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        snapshots?: FieldLocationSnapshot[];
        error?: string;
      };
      if (!response.ok || !result.snapshots) {
        throw new Error(result.error || "Could not refresh live locations.");
      }
      setSnapshots(result.snapshots);
      setLastRefreshAt(new Date());
      setRefreshError(null);
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Could not refresh live locations.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  });

  const counts = useMemo(
    () => ({
      live: snapshots.filter(
        (snapshot) => snapshot.status === "ACTIVE" && snapshot.isFresh,
      ).length,
      stale: snapshots.filter(
        (snapshot) => snapshot.status === "ACTIVE" && !snapshot.isFresh,
      ).length,
      ended: snapshots.filter((snapshot) => snapshot.status === "STOPPED")
        .length,
    }),
    [snapshots],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-400/20 dark:bg-emerald-400/10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
            Live now
          </p>
          <p className="mt-2 text-3xl font-black text-emerald-800 dark:text-emerald-200">
            {counts.live}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/20 dark:bg-amber-400/10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
            Active but stale
          </p>
          <p className="mt-2 text-3xl font-black text-amber-800 dark:text-amber-200">
            {counts.stale}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Ended · 24 hours
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">
            {counts.ended}
          </p>
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Team location feed
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Auto-refreshes every 30 seconds · last checked{" "}
              {formatDateTime(lastRefreshAt.toISOString())}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
          >
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>

        {refreshError ? (
          <div
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"
            role="status"
          >
            {refreshError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {snapshots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-7 text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
              No field location session has been recorded in the last 24 hours.
            </div>
          ) : (
            snapshots.map((snapshot) => {
              const isLive =
                snapshot.status === "ACTIVE" && snapshot.isFresh;
              const isStale =
                snapshot.status === "ACTIVE" && !snapshot.isFresh;
              const hasPoint =
                snapshot.lastLatitude !== null &&
                snapshot.lastLongitude !== null;
              const mapsHref = hasPoint
                ? `https://www.google.com/maps?q=${snapshot.lastLatitude},${snapshot.lastLongitude}`
                : null;

              return (
                <article
                  key={snapshot.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-950/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-slate-950 dark:text-white">
                        {snapshot.user.name}
                      </h3>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {roleLabel(snapshot.user.role)} · {snapshot.user.email}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                        isLive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                          : isStale
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                            : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                      }`}
                    >
                      {isLive ? "Live" : isStale ? "Stale" : "Stopped"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                        Last point
                      </p>
                      <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                        {formatDateTime(snapshot.lastRecordedAt)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                        Accuracy
                      </p>
                      <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                        {snapshot.lastAccuracyMeters !== null
                          ? `±${Math.round(snapshot.lastAccuracyMeters)} m`
                          : "Not available"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Started {formatDateTime(snapshot.startedAt)}
                    </p>
                    {mapsHref ? (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"
                      >
                        Open in Google Maps →
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
