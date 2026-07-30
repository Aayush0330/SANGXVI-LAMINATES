"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { FieldMobileNavigation } from "@/components/field-mobile-navigation";
import { FieldSidebarNav } from "@/components/field-sidebar-nav";
import { InternalCommandMenu } from "@/components/internal-command-menu";
import { LogoutButton } from "@/components/logout-button";
import type { NavigationItem } from "@/lib/navigation";
import type { PortalAccessItem } from "@/lib/portal-access";

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

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

export function FieldAppShell({
  children,
  items,
  userName,
  userRoleLabel,
  workspaceDescription,
  portalAccessItems,
  desktopTools,
  mobileNotification,
  contentOwnsSpacing = false,
}: {
  children: ReactNode;
  items: NavigationItem[];
  userName: string;
  userRoleLabel: string;
  workspaceDescription: string;
  portalAccessItems: PortalAccessItem[];
  desktopTools: ReactNode;
  mobileNotification: ReactNode;
  contentOwnsSpacing?: boolean;
}) {
  const pathname = usePathname();
  const currentItem = useMemo(
    () =>
      [...items]
        .sort((left, right) => right.href.length - left.href.length)
        .find((item) => isActivePath(pathname, item.href)),
    [items, pathname],
  );
  const pageLabel = currentItem?.label ?? "Field Workspace";

  return (
    <div className="min-h-screen min-w-0 bg-[#f4f6f9] text-slate-950 dark:bg-slate-950 dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[280px] flex-col border-r border-slate-200 bg-white px-3 py-4 text-slate-950 shadow-[8px_0_32px_rgba(15,23,42,0.05)] lg:flex print:hidden dark:border-white/10 dark:bg-[#0b1220] dark:text-white dark:shadow-black/20">
        <div className="flex h-14 shrink-0 items-center gap-3 px-1">
          <BrandLogo
            priority
            className="h-10 w-10 rounded-xl border-slate-200 dark:border-white/10"
            imageClassName="p-1"
          />
          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-tight">
              Sanghvi ERP
            </p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              Field Operations
            </p>
          </div>
        </div>

        <div className="mx-1 mt-4 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
            Active workspace
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-300">
              {userRoleLabel}
            </p>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-slate-400 dark:text-slate-500">
            {workspaceDescription}
          </p>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
          <FieldSidebarNav items={items} />
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white pt-3 dark:border-white/10 dark:bg-[#0b1220]">
          <LogoutButton variant="sidebar" />
        </div>
      </aside>

      <header className="fixed left-[280px] right-0 top-0 z-40 hidden h-[72px] items-center gap-5 border-b border-slate-200/90 bg-white/95 px-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-xl lg:flex print:hidden dark:border-white/10 dark:bg-slate-950/95">
        <div className="min-w-[180px]">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Field Operations
          </p>
          <p className="mt-1 truncate text-sm font-black text-slate-900 dark:text-white">
            {pageLabel}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <InternalCommandMenu items={items} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {desktopTools}
          <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-white/10">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[10px] font-black text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
              {initials(userName)}
            </span>
            <div className="hidden max-w-32 xl:block">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                {userName}
              </p>
              <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
                {userRoleLabel}
              </p>
            </div>
          </div>
        </div>
      </header>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-xl lg:hidden print:hidden dark:border-white/10 dark:bg-slate-950/95">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo className="h-9 w-9 rounded-lg" imageClassName="p-1" />
          <div className="min-w-0">
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
              Field Operations
            </p>
            <p className="mt-0.5 truncate text-xs font-black text-slate-900 dark:text-white">
              {pageLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <InternalCommandMenu
            items={items}
            compact
            enableShortcut={false}
          />
          {mobileNotification}
        </div>
      </header>

      <div
        role="main"
        className={
          contentOwnsSpacing
            ? "min-h-screen min-w-0 pb-24 lg:ml-[280px] lg:pb-0 lg:pt-[72px] print:ml-0 print:p-0"
            : "min-h-screen min-w-0 px-3 pb-24 pt-4 sm:px-5 sm:pt-5 lg:ml-[280px] lg:px-7 lg:pb-8 lg:pt-[96px] print:ml-0 print:p-0"
        }
      >
        {children}
      </div>

      <div className="print:hidden">
        <FieldMobileNavigation
          items={items}
          portalAccessItems={portalAccessItems}
        />
      </div>
    </div>
  );
}
