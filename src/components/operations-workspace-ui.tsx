import type { ReactNode } from "react";
import { ErpIcon, type ErpIconName } from "@/components/erp-icon";

export type OperationsTone =
  | "blue"
  | "violet"
  | "amber"
  | "rose"
  | "emerald"
  | "slate";

const toneStyles: Record<
  OperationsTone,
  { icon: string; pill: string; dot: string }
> = {
  blue: {
    icon: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/20",
    pill: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/20",
    dot: "bg-blue-500",
  },
  violet: {
    icon: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20",
    pill: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20",
    dot: "bg-violet-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20",
    pill: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20",
    dot: "bg-amber-500",
  },
  rose: {
    icon: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/20",
    pill: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/20",
    dot: "bg-rose-500",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  slate: {
    icon: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10",
    pill: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10",
    dot: "bg-slate-400",
  },
};

export function OperationsMetricCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  icon: ErpIconName;
  tone: OperationsTone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
            {value}
          </p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${toneStyles[tone].icon}`}
        >
          <ErpIcon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-400 dark:text-slate-500">
        {helper}
      </p>
    </div>
  );
}

export function OperationsStatusPill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: OperationsTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black ring-1 ring-inset ${toneStyles[tone].pill}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${toneStyles[tone].dot}`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function OperationsEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ErpIconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
        <ErpIcon name={icon} className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
