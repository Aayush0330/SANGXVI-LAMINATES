import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { LogoutButton } from "@/components/logout-button";
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission } from "@/lib/permissions";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { dealerNavigation } from "@/lib/navigation";

export default async function DealerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await getCurrentUser();

  const visibleNavigation = dealerNavigation.filter((item) =>
    hasPermission(currentUser.role, item.permission)
  );

  if (visibleNavigation.length === 0) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: "/dealer",
      description:
        "Access denied because user does not have dealer portal permissions.",
    });

    return (
      <main className="min-h-screen bg-slate-100 text-slate-950">
        <AccessDeniedCard
          title="Dealer Portal Access Denied"
          description="Your current role does not have permission to access the Dealer Portal."
          backHref="/internal/dashboard"
          backLabel="Go to Dashboard"
          theme="light"
        />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <div className="min-w-0 shrink">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-600 md:hidden">
              Dealer Portal
            </p>

            <h1 className="truncate text-lg font-bold text-slate-950">
              Dealer Portal
            </h1>

            <p className="mt-1 truncate text-xs text-slate-500">
              {currentUser.name} · Dealer
            </p>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            <nav className="flex items-center gap-2">
              {visibleNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
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

      <MobileBottomNavigation items={visibleNavigation} theme="light" />
    </div>
  );
}
