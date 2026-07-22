import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { InternalSidebarNav } from "@/components/internal-sidebar-nav";
import { InventoryAiChatbot } from "@/components/inventory-ai-chatbot";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation";
import { NotificationCenter } from "@/components/notification-center";
import { PortalSwitcher } from "@/components/portal-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getCurrentUser,
  getPortalAccessItems,
  getPortalLandingLabel,
  getPortalLandingPath,
  getPortalRole,
} from "@/lib/current-user";
import { hasPermission, roleLabels } from "@/lib/permissions";
import { internalNavigation } from "@/lib/navigation";

export default async function InternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();
  const portalAccessItems = getPortalAccessItems(currentUser.roles);
  const internalRole = getPortalRole(currentUser.roles, "internal") ?? currentUser.role;
  const fallbackPortal =
    portalAccessItems.find((item) => item.portal !== "internal") ??
    portalAccessItems[0];

  const isAccountantFocused =
    currentUser.roles.includes("accountant") &&
    !currentUser.roles.some((role) =>
      ["owner", "manager", "dispatch_team", "order_team", "qc_team"].includes(role),
    );

  const allowedMenuItems = internalNavigation.filter((item) =>
    hasPermission(currentUser.roles, item.permission)
  );

  if (allowedMenuItems.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-700">
            Access Restricted
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Internal ERP Access Denied
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-500">
            Your current role does not have permission to access the Internal ERP
            Portal. Please switch to an internal role.
          </p>

          <Link
            href={fallbackPortal?.href ?? getPortalLandingPath(currentUser.role)}
            className="mt-6 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            {fallbackPortal?.label ?? getPortalLandingLabel(currentUser.role)}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-slate-950 dark:bg-slate-950 dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-200 bg-white px-6 py-7 shadow-sm shadow-slate-200/70 lg:flex dark:border-white/10 dark:bg-slate-950 dark:shadow-none">
        <div className="mb-9">
          <div className="flex items-center gap-4">
            <BrandLogo />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">
                Sanghvi ERP
              </h1>
              <p className="mt-1 truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                {currentUser.name}
              </p>
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              Current Role
            </p>

            <p className="mt-3 text-2xl font-bold text-blue-600 dark:text-blue-300">
              {roleLabels[internalRole]}
            </p>

            <PortalSwitcher
              items={portalAccessItems}
              currentPortal="internal"
              variant="panel"
            />
          </div>
        </div>

        <InternalSidebarNav items={allowedMenuItems} financeMode={isAccountantFocused} />

        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-white/10">
          <LogoutButton />
        </div>
      </aside>

      <header className="fixed left-72 right-0 top-0 z-30 hidden h-[88px] items-center justify-between gap-6 border-b border-slate-200 bg-white px-8 shadow-sm shadow-slate-200/60 lg:flex dark:border-white/10 dark:bg-slate-950 dark:shadow-none">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo className="h-9 w-9 rounded-lg" imageClassName="p-0.5" />
          <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-950 dark:text-slate-100">
            <span>Internal</span>
            <span className="text-xl font-light text-slate-400">›</span>
            <span>ERP</span>
            <span className="text-xl font-light text-slate-400">›</span>
            <span className="truncate text-slate-500 dark:text-slate-400">
              {roleLabels[internalRole]}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 justify-end">
          <label className="relative hidden w-full max-w-[520px] xl:block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21 21-4.3-4.3" />
                <circle cx="11" cy="11" r="7" />
              </svg>
            </span>
            <input
              aria-label="Search"
              placeholder={isAccountantFocused ? "Search reports, employees, payments..." : "Search or type a command (Ctrl + G)"}
              className="h-12 w-full rounded-xl border-0 bg-slate-100 pl-12 pr-4 text-sm font-medium text-slate-700 outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:ring-blue-200 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900 dark:focus:ring-blue-500/40"
            />
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <PortalSwitcher
            items={portalAccessItems}
            currentPortal="internal"
            variant="compact"
          />
          <NotificationCenter currentUser={currentUser} />
          <ThemeToggle />
          <div className="flex items-center gap-3 pl-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
              {currentUser.name.slice(0, 1).toUpperCase()}
            </div>
            <p className="max-w-32 truncate text-sm font-semibold text-slate-950 dark:text-slate-100">
              {currentUser.name}
            </p>
          </div>
        </div>
      </header>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-4 lg:hidden dark:border-white/10 dark:bg-slate-950/90">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-10 rounded-xl" imageClassName="p-1" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600 sm:text-xs">
                Sanghvi ERP
              </p>

              <h1 className="mt-1 truncate text-base font-bold sm:text-lg">
                {roleLabels[internalRole]}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <PortalSwitcher
              items={portalAccessItems}
              currentPortal="internal"
              variant="compact"
            />
            <NotificationCenter currentUser={currentUser} />
            <ThemeToggle />
            <LogoutButton variant="compact" />
          </div>
        </div>
      </header>

      <main className="min-h-screen px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:ml-72 lg:px-10 lg:pb-10 lg:pt-32">
        {children}
      </main>

      {hasPermission(currentUser.roles, "manage_inventory") ? (
        <InventoryAiChatbot />
      ) : null}

      <MobileBottomNavigation items={allowedMenuItems} theme="light" />
    </div>
  );
}
