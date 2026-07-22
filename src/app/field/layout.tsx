import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation";
import { NotificationCenter } from "@/components/notification-center";
import { PortalSwitcher } from "@/components/portal-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getCurrentUser,
  getPortalAccessItems,
  getPortalDisplayCopy,
  getPortalLandingLabel,
  getPortalLandingPath,
  getPortalRole,
} from "@/lib/current-user";
import { hasPermission, roleLabels } from "@/lib/permissions";
import { fieldNavigation } from "@/lib/navigation";

export default async function FieldLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();
  const portalAccessItems = getPortalAccessItems(currentUser.roles);
  const fieldRole = getPortalRole(currentUser.roles, "field") ?? currentUser.role;
  const fallbackPortal =
    portalAccessItems.find((item) => item.portal !== "field") ??
    portalAccessItems[0];

  const allowedMenuItems = fieldNavigation.filter((item) =>
    hasPermission(currentUser.roles, item.permission)
  );
  const portalCopy = getPortalDisplayCopy(fieldRole);

  if (allowedMenuItems.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-700">
            Access Restricted
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Field Portal Access Denied
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-500">
            Your current role does not have permission to access the Field /
            Mobile Portal. Please switch to a field, driver, or collection role.
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
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-10 rounded-xl md:h-11 md:w-11" />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-600 md:hidden">
                {portalCopy.eyebrow}
              </p>

              <h1 className="truncate text-lg font-bold text-slate-950">
                {portalCopy.title}
              </h1>

              <p className="mt-1 truncate text-xs text-slate-500">
                {currentUser.name} · {roleLabels[fieldRole]} ·{" "}
                {portalCopy.description}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            <PortalSwitcher
              items={portalAccessItems}
              currentPortal="field"
              variant="inline"
            />

            <nav className="flex items-center gap-2">
              {allowedMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <NotificationCenter currentUser={currentUser} />
              <ThemeToggle />
              <LogoutButton variant="compact" />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <PortalSwitcher
              items={portalAccessItems}
              currentPortal="field"
              variant="compact"
            />
            <NotificationCenter currentUser={currentUser} />
            <ThemeToggle />
            <LogoutButton variant="compact" />
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:py-8">
        {children}
      </main>

      <MobileBottomNavigation items={allowedMenuItems} theme="light" />
    </div>
  );
}
