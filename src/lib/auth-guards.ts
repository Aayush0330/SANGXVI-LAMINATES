import { getCurrentUser } from "./current-user";
import { hasPermission, type Permission } from "./permissions";
import { createSecurityAuditLog } from "./security-audit";

export async function checkPermission(permission: Permission, path?: string) {
  const currentUser = await getCurrentUser();
  const hasAccess = hasPermission(currentUser.roles, permission);

  if (!hasAccess) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: path ?? null,
      description: `Access denied because permission "${permission}" is missing.`,
    });
  }

  return {
    currentUser,
    hasAccess,
  };
}
