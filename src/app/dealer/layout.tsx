import type { ReactNode } from "react";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { DealerPortalShell } from "@/components/dealer-portal-shell";
import { LogoutButton } from "@/components/logout-button";
import { NotificationCenter } from "@/components/notification-center";
import { PortalSwitcher } from "@/components/portal-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getCurrentUser,
  getPortalAccessItems,
  getPortalLandingLabel,
  getPortalLandingPath,
} from "@/lib/current-user";
import { dealerNavigation } from "@/lib/navigation";
import { hasPermission } from "@/lib/permissions";
import { createSecurityAuditLog } from "@/lib/security-audit";

export default async function DealerLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();
  const portalAccessItems = getPortalAccessItems(currentUser.roles);
  const fallbackPortal = portalAccessItems.find((item) => item.portal !== "dealer") ?? portalAccessItems[0];
  const visibleNavigation = dealerNavigation.filter((item) => hasPermission(currentUser.roles, item.permission));

  if (visibleNavigation.length === 0) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: "/dealer",
      description: "Access denied because user does not have dealer portal permissions.",
    });

    return (
      <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
        <AccessDeniedCard
          title="Dealer Portal Access Denied"
          description="Your current role does not have permission to access the Dealer Portal."
          backHref={fallbackPortal?.href ?? getPortalLandingPath(currentUser.role)}
          backLabel={fallbackPortal?.label ?? getPortalLandingLabel(currentUser.role)}
          theme="light"
        />
      </main>
    );
  }

  return (
    <DealerPortalShell
      navigation={visibleNavigation}
      user={{ name: currentUser.name, email: currentUser.email }}
      portalControl={<div className="hidden sm:block"><PortalSwitcher items={portalAccessItems} currentPortal="dealer" variant="compact" /></div>}
      headerActions={
        <>
          <NotificationCenter currentUser={currentUser} />
          <ThemeToggle />
          <div className="hidden sm:block"><LogoutButton variant="compact" /></div>
        </>
      }
    >
      {children}
    </DealerPortalShell>
  );
}
