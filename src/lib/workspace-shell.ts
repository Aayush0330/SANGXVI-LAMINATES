import { getPortalRole } from "./portal-access";
import {
  getPortalByRole,
  type PortalType,
  type UserRole,
} from "./permissions";

export type WorkspaceRouteKind = "field" | "internal" | "shared";
export type WorkspaceShellPortal = Exclude<PortalType, "dealer">;

export function getWorkspaceShellPortal(
  roles: readonly UserRole[],
  primaryRole: UserRole,
  routeKind: WorkspaceRouteKind,
): WorkspaceShellPortal | null {
  if (routeKind === "field") return "field";

  const internalRole = getPortalRole(roles, "internal");
  const fieldRole = getPortalRole(roles, "field");

  if (routeKind === "internal") {
    if (internalRole) return "internal";
    if (fieldRole) return "field";
    return null;
  }

  const primaryPortal = getPortalByRole(primaryRole);

  if (primaryPortal === "field" && fieldRole) return "field";
  if (primaryPortal === "internal" && internalRole) return "internal";

  if (internalRole) return "internal";
  if (fieldRole) return "field";
  return null;
}
