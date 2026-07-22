import Link from "next/link";
import type { PortalAccessItem } from "@/lib/portal-access";
import type { PortalType } from "@/lib/permissions";

type PortalSwitcherProps = {
  items: PortalAccessItem[];
  currentPortal: PortalType;
  variant?: "panel" | "inline" | "compact";
};

function PortalIcon({ portal }: { portal: PortalType }) {
  if (portal === "field") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 17h18" />
        <path d="M5 17V9l7-4 7 4v8" />
        <path d="M9 17v-4h6v4" />
      </svg>
    );
  }

  if (portal === "dealer") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 10h16" />
        <path d="M5 10V6h14v4" />
        <path d="M6 10v8h12v-8" />
        <path d="M9 14h6" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

export function PortalSwitcher({
  items,
  currentPortal,
  variant = "inline",
}: PortalSwitcherProps) {
  if (items.length <= 1) return null;

  if (variant === "panel") {
    return (
      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
          Portal Access
        </p>
        <div className="mt-3 grid gap-2">
          {items.map((item) => {
            const isCurrent = item.portal === currentPortal;

            return isCurrent ? (
              <div
                key={item.portal}
                className="flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-2.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
              >
                <PortalIcon portal={item.portal} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{item.label}</p>
                  <p className="truncate text-[10px] text-blue-600/70 dark:text-blue-200/60">
                    Current portal
                  </p>
                </div>
              </div>
            ) : (
              <Link
                key={item.portal}
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
              >
                <PortalIcon portal={item.portal} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{item.label}</p>
                  <p className="truncate text-[10px] text-slate-400">
                    Open portal
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  const otherPortals = items.filter((item) => item.portal !== currentPortal);

  if (variant === "compact") {
    const nextPortal = otherPortals[0];
    if (!nextPortal) return null;

    return (
      <Link
        href={nextPortal.href}
        title={`Open ${nextPortal.label}`}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-500/10"
      >
        <PortalIcon portal={nextPortal.portal} />
        <span className="hidden sm:inline">{nextPortal.shortLabel}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-white/10 dark:bg-slate-900">
      {items.map((item) => {
        const isCurrent = item.portal === currentPortal;
        const className = `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
          isCurrent
            ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-200"
            : "text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        }`;

        return isCurrent ? (
          <span key={item.portal} className={className}>
            <PortalIcon portal={item.portal} />
            {item.shortLabel}
          </span>
        ) : (
          <Link key={item.portal} href={item.href} className={className}>
            <PortalIcon portal={item.portal} />
            {item.shortLabel}
          </Link>
        );
      })}
    </div>
  );
}
