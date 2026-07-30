"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErpIcon } from "@/components/erp-icon";
import { FieldNavigationIcon } from "@/components/field-navigation-icon";
import { LogoutButton } from "@/components/logout-button";
import { PortalSwitcher } from "@/components/portal-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { NavigationItem } from "@/lib/navigation";
import type { PortalAccessItem } from "@/lib/portal-access";

const preferredHrefs = [
  "/field/dashboard",
  "/field/deliveries",
  "/field/collections",
  "/field/visits",
  "/internal/dealers",
  "/account/tasks",
  "/internal/inquiries",
  "/account/attendance",
  "/account/attendance/payslips",
];

function isActivePath(pathname: string, href: string) {
  if (href === "/account/attendance") {
    return (
      pathname === href ||
      pathname.startsWith("/account/attendance/advance") ||
      pathname.startsWith("/account/attendance/corrections") ||
      pathname.startsWith("/account/attendance/leave")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FieldMobileNavigation({
  items,
  portalAccessItems,
}: {
  items: NavigationItem[];
  portalAccessItems: PortalAccessItem[];
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const rankedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftIndex = preferredHrefs.indexOf(left.href);
        const rightIndex = preferredHrefs.indexOf(right.href);
        const safeLeft =
          leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const safeRight =
          rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        return safeLeft - safeRight;
      }),
    [items],
  );
  const primaryItems = useMemo(() => rankedItems.slice(0, 4), [rankedItems]);
  const remainingItems = useMemo(() => rankedItems.slice(4), [rankedItems]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const moreActive = remainingItems.some((item) =>
    isActivePath(pathname, item.href),
  );

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-[65] bg-slate-950/45 backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="field-mobile-menu-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <div className="absolute inset-x-3 bottom-[84px] max-h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-white/10">
              <div>
                <p
                  id="field-mobile-menu-title"
                  className="text-sm font-black text-slate-950 dark:text-white"
                >
                  Field Workspace
                </p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  Open an authorized field module
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300"
                aria-label="Close field workspace menu"
              >
                <ErpIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="grid max-h-[48vh] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
              {remainingItems.length > 0 ? (
                remainingItems.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-20 flex-col justify-between rounded-xl border p-3 transition ${
                        active
                          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300"
                          : "border-slate-200 text-slate-700 hover:border-blue-200 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                      }`}
                    >
                      <FieldNavigationIcon
                        href={item.href}
                        className="h-5 w-5"
                      />
                      <span className="mt-3 line-clamp-2 text-xs font-bold">
                        {item.label}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <p className="col-span-2 rounded-xl border border-dashed border-slate-200 p-4 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400 sm:col-span-3">
                  Every available module is already pinned below.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-slate-950">
              <PortalSwitcher
                items={portalAccessItems}
                currentPortal="field"
                variant="compact"
              />
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
                <LogoutButton variant="compact" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {primaryItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-bold transition ${
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
                    : "text-slate-500 hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-white/5"
                }`}
              >
                <FieldNavigationIcon
                  href={item.href}
                  className="h-5 w-5"
                />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((current) => !current)}
            aria-expanded={moreOpen}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-bold transition ${
              moreOpen || moreActive
                ? "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
                : "text-slate-500 hover:bg-slate-50 dark:text-slate-500 dark:hover:bg-white/5"
            }`}
          >
            <ErpIcon name="menu" className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
