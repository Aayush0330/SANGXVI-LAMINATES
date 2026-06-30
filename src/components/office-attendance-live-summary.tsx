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

    const totalOfficeMinutes = Math.max(0, Math.floor((now - punchInTime) / 60000));
    const runningBreakMinutes = breakStartedTime
      ? Math.max(0, Math.floor((now - breakStartedTime) / 60000))
      : 0;
    const breakTimeMinutes = Math.max(0, (breakMinutes ?? 0) + runningBreakMinutes);
    const netWorkMinutes = Math.max(0, totalOfficeMinutes - breakTimeMinutes);

    return {
      totalOfficeMinutes,
      breakTimeMinutes,
      netWorkMinutes,
    };
  }, [breakMinutes, currentBreakStartedAt, netWorkingMinutes, now, punchInAt, punchOutAt, totalMinutes]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Total Office Time</p>
        <p className="mt-3 text-3xl font-black text-cyan-200">{formatDuration(summary.totalOfficeMinutes)}</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">Total time since Punch In.</p>
      </div>

      <div className="rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-200">Break Time</p>
        <p className="mt-3 text-3xl font-black text-yellow-200">{formatDuration(summary.breakTimeMinutes)}</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">Combined lunch, tea, and small-break time.</p>
      </div>

      <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Net Working Time</p>
        <p className="mt-3 text-3xl font-black text-emerald-200">{formatDuration(summary.netWorkMinutes)}</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">Total office time minus break time.</p>
      </div>
    </div>
  );
}
