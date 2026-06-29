import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, roleLabels } from "@/lib/permissions";
import { fieldNavigation } from "@/lib/navigation";

export default async function FieldLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();

  const allowedMenuItems = fieldNavigation.filter((item) =>
    hasPermission(currentUser.role, item.permission)
  );

  if (allowedMenuItems.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-300">
            Access Restricted
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Field Portal Access Denied
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-400">
            Your current role does not have permission to access the Field /
            Mobile Portal. Please switch to a field, driver, or collection role.
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300 md:hidden">
              Field Portal
            </p>

            <h1 className="truncate text-lg font-bold text-white">
              Field / Mobile Portal
            </h1>

            <p className="mt-1 truncate text-xs text-slate-400">
              {currentUser.name} · {roleLabels[currentUser.role]}
            </p>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            <nav className="flex items-center gap-2">
              {allowedMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="shrink-0">
              <LogoutButton variant="compact" />
            </div>
          </div>

          <div className="shrink-0 md:hidden">
            <LogoutButton variant="compact" />
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:py-8">
        {children}
      </main>

      <MobileBottomNavigation items={allowedMenuItems} theme="dark" />
    </div>
  );
}
