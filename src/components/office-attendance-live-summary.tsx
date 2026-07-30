"use client";

import { useEffect, useMemo, useState } from "react";

type OfficeAttendanceLiveSummaryProps = {
  initialNow: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  currentBreakStartedAt: string | null;
  breakMinutes: number;
  totalMinutes: number | null;
  netWorkingMinutes: number | null;
};

type SummaryTone = "blue" | "amber" | "emerald";

function parseTime(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(minutes: number | null | undefined) {
  const safeMinutes = Math.max(0, Math.floor(minutes ?? 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours <= 0) return `${remainingMinutes}m`;
  return `${hours}h ${remainingMinutes}m`;
}

function SummaryIcon({ tone }: { tone: SummaryTone }) {
  if (tone === "amber") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 3v3M16 3v3M5 9h14" />
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M9 13h6M9 16h4" />
      </svg>
    );
  }

  if (tone === "emerald") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12 4 4L19 6" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: SummaryTone;
}) {
  const toneClasses = {
    blue: {
      icon: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
      value: "text-blue-700 dark:text-blue-300",
      accent: "from-blue-500 to-cyan-400",
    },
    amber: {
      icon: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      value: "text-amber-700 dark:text-amber-300",
      accent: "from-amber-500 to-orange-400",
    },
    emerald: {
      icon:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      value: "text-emerald-700 dark:text-emerald-300",
      accent: "from-emerald-500 to-teal-400",
    },
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
      <span
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${toneClasses.accent}`}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p
            className={`mt-3 text-3xl font-black tracking-tight ${toneClasses.value}`}
          >
            {value}
          </p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses.icon}`}
        >
          <SummaryIcon tone={tone} />
        </span>
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </article>
  );
}

export function OfficeAttendanceLiveSummary({
  initialNow,
  punchInAt,
  punchOutAt,
  currentBreakStartedAt,
  breakMinutes,
  totalMinutes,
  netWorkingMinutes,
}: OfficeAttendanceLiveSummaryProps) {
  const [now, setNow] = useState(() => parseTime(initialNow) ?? 0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    const punchInTime = parseTime(punchInAt);
    const punchOutTime = parseTime(punchOutAt);
    const breakStartedTime = parseTime(currentBreakStartedAt);

    if (!punchInTime) {
      return {
        totalOfficeMinutes: 0,
        breakTimeMinutes: 0,
        netWorkMinutes: 0,
      };
    }

    if (punchOutTime) {
      return {
        totalOfficeMinutes: Math.max(0, totalMinutes ?? 0),
        breakTimeMinutes: Math.max(0, breakMinutes ?? 0),
        netWorkMinutes: Math.max(0, netWorkingMinutes ?? 0),
      };
    }

    const totalOfficeMinutes = Math.max(
      0,
      Math.floor((now - punchInTime) / 60000),
    );
    const runningBreakMinutes = breakStartedTime
      ? Math.max(0, Math.floor((now - breakStartedTime) / 60000))
      : 0;
    const breakTimeMinutes = Math.max(
      0,
      (breakMinutes ?? 0) + runningBreakMinutes,
    );
    const netWorkMinutes = Math.max(0, totalOfficeMinutes - breakTimeMinutes);

    return {
      totalOfficeMinutes,
      breakTimeMinutes,
      netWorkMinutes,
    };
  }, [
    breakMinutes,
    currentBreakStartedAt,
    netWorkingMinutes,
    now,
    punchInAt,
    punchOutAt,
    totalMinutes,
  ]);

  const isLive = Boolean(punchInAt && !punchOutAt);

  return (
    <section aria-labelledby="live-work-clock">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
            Live work clock
          </p>
          <h2
            id="live-work-clock"
            className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white"
          >
            Today at a glance
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
            isLive
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLive ? "animate-pulse bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {isLive ? "Updating live" : "Clock inactive"}
        </span>
      </div>

      <div
        className="grid gap-3 lg:grid-cols-3"
        aria-live="polite"
        aria-atomic="true"
      >
        <SummaryCard
          label="Office time"
          value={formatDuration(summary.totalOfficeMinutes)}
          description="Elapsed time recorded since Punch In."
          tone="blue"
        />
        <SummaryCard
          label="Break time"
          value={formatDuration(summary.breakTimeMinutes)}
          description="Lunch, tea and small breaks combined."
          tone="amber"
        />
        <SummaryCard
          label="Net work"
          value={formatDuration(summary.netWorkMinutes)}
          description="Office time after deducting all breaks."
          tone="emerald"
        />
      </div>
    </section>
  );
}
