import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, roleLabels } from "@/lib/permissions";
import { internalNavigation } from "@/lib/navigation";

export default async function InternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();

  const allowedMenuItems = internalNavigation.filter((item) =>
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
            Internal ERP Access Denied
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-400">
            Your current role does not have permission to access the Internal ERP
            Portal. Please switch to an internal role.
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-white/10 bg-slate-950 px-6 py-8 lg:flex">
        <div>
          <h1 className="text-2xl font-bold">Internal ERP</h1>

          <p className="mt-5 text-sm text-slate-400">{currentUser.name}</p>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-slate-500">
              Current Role
            </p>

            <p className="mt-3 text-lg font-bold text-cyan-300">
              {roleLabels[currentUser.role]}
            </p>
          </div>
        </div>

        <nav className="mt-10 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {allowedMenuItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 pt-5">
          <LogoutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 px-3 py-3 backdrop-blur-xl sm:px-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300 sm:text-xs">
              Internal ERP
            </p>

            <h1 className="mt-1 truncate text-base font-bold sm:text-lg">
              {roleLabels[currentUser.role]}
            </h1>
          </div>

          <div className="shrink-0">
            <LogoutButton variant="compact" />
          </div>
        </div>
      </header>

      <main className="min-h-screen px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:ml-72 lg:px-10 lg:pb-10 lg:pt-10">
        {children}
      </main>

      <MobileBottomNavigation items={allowedMenuItems} theme="dark" />
    </div>
  );
}
