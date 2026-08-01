import Link from "next/link";
import type { ReactNode } from "react";
import { FieldAppShell } from "@/components/field-app-shell";
import { InternalAppShell } from "@/components/internal-app-shell";
import { InventoryAiChatbot } from "@/components/inventory-ai-chatbot";
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
import { fieldNavigation, internalNavigation } from "@/lib/navigation";
import { hasPermission, roleLabels } from "@/lib/permissions";
import {
  getWorkspaceShellPortal,
  type WorkspaceRouteKind,
} from "@/lib/workspace-shell";

export async function WorkspaceAppShell({
  children,
  routeKind,
}: {
  children: ReactNode;
  routeKind: WorkspaceRouteKind;
}) {
  const currentUser = await getCurrentUser();
  const portalAccessItems = getPortalAccessItems(currentUser.roles);
  const shellPortal = getWorkspaceShellPortal(
    currentUser.roles,
    currentUser.role,
    routeKind,
  );
  const fallbackPortal =
    portalAccessItems.find((item) => item.portal !== shellPortal) ??
    portalAccessItems[0];

  if (!shellPortal) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950 dark:bg-slate-950 dark:text-white">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
            Access Restricted
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Workspace Access Denied
          </h1>
          <p className="mt-4 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
            Your current role does not have an authorized workspace for this
            page.
          </p>
          <Link
            href={fallbackPortal?.href ?? getPortalLandingPath(currentUser.role)}
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            {fallbackPortal?.label ?? getPortalLandingLabel(currentUser.role)}
          </Link>
        </div>
      </main>
    );
  }

  if (shellPortal === "field") {
    const fieldRole =
      getPortalRole(currentUser.roles, "field") ?? currentUser.role;
    const allowedMenuItems = fieldNavigation.filter((item) =>
      hasPermission(currentUser.roles, item.permission),
    );
    const portalCopy = getPortalDisplayCopy(fieldRole);

    if (allowedMenuItems.length === 0) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950 dark:bg-slate-950 dark:text-white">
          <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
              Access Restricted
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              Field Portal Access Denied
            </h1>
            <p className="mt-4 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              Your current role does not have permission to open any Field
              Portal modules.
            </p>
            <Link
              href={
                fallbackPortal?.href ??
                getPortalLandingPath(currentUser.role)
              }
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              {fallbackPortal?.label ?? getPortalLandingLabel(currentUser.role)}
            </Link>
          </div>
        </main>
      );
    }

    return (
      <FieldAppShell
        items={allowedMenuItems}
        userName={currentUser.name}
        userRoleLabel={roleLabels[fieldRole]}
        workspaceDescription={portalCopy.description}
        portalAccessItems={portalAccessItems}
        contentOwnsSpacing={routeKind === "shared"}
        desktopTools={
          <>
            <PortalSwitcher
              items={portalAccessItems}
              currentPortal="field"
              variant="compact"
            />
            <NotificationCenter currentUser={currentUser} />
            <ThemeToggle />
          </>
        }
        mobileNotification={
          <NotificationCenter
            currentUser={currentUser}
            enableLiveSync={false}
          />
        }
      >
        {children}
      </FieldAppShell>
    );
  }

  const internalRole =
    getPortalRole(currentUser.roles, "internal") ?? currentUser.role;
  const allowedMenuItems = internalNavigation.filter(
    (item) =>
      !item.hidden && hasPermission(currentUser.roles, item.permission),
  );
  const isAccountantFocused =
    currentUser.roles.includes("accountant") &&
    !currentUser.roles.some((role) =>
      ["owner", "manager", "dispatch_team", "order_team", "qc_team"].includes(
        role,
      ),
    );

  if (allowedMenuItems.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950 dark:bg-slate-950 dark:text-white">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
            Access Restricted
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Internal ERP Access Denied
          </h1>
          <p className="mt-4 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
            Your current role does not have permission to open any Internal ERP
            modules.
          </p>
          <Link
            href={fallbackPortal?.href ?? getPortalLandingPath(currentUser.role)}
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            {fallbackPortal?.label ?? getPortalLandingLabel(currentUser.role)}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <InternalAppShell
      items={allowedMenuItems}
      financeMode={isAccountantFocused}
      userName={currentUser.name}
      userRoleLabel={roleLabels[internalRole]}
      portalAccessItems={portalAccessItems}
      contentOwnsSpacing={routeKind === "shared"}
      desktopTools={
        <>
          <PortalSwitcher
            items={portalAccessItems}
            currentPortal="internal"
            variant="compact"
          />
          <NotificationCenter currentUser={currentUser} />
          <ThemeToggle />
        </>
      }
      mobileNotification={
        <NotificationCenter
          currentUser={currentUser}
          enableLiveSync={false}
        />
      }
      assistant={
        hasPermission(currentUser.roles, "manage_inventory") ? (
          <InventoryAiChatbot />
        ) : null
      }
    >
      {children}
    </InternalAppShell>
  );
}
