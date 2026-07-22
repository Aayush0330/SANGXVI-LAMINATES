import { redirect } from "next/navigation";
import type { UserRole } from "./permissions";
import { prisma } from "./db";
import { formatPersonName } from "./user-formatters";
import { getCurrentSession } from "./session";
import {
  getAppRolesFromUser,
  prismaRoleToAppRole,
} from "./user-role-utils";

export {
  getPortalAccessItems,
  getPortalDisplayCopy,
  getPortalLandingLabel,
  getPortalLandingPath,
  getPortalLandingPathForRoles,
  getPortalRole,
} from "./portal-access";
export type { PortalAccessItem } from "./portal-access";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  geofenceMode: "OFFICE_REQUIRED" | "ANYWHERE";
};

export async function getLoginUsers() {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    include: { roleAssignments: true },
    orderBy: { createdAt: "asc" },
  });

  return users.map((user) => ({
    name: formatPersonName(user.name),
    email: user.email,
    role: prismaRoleToAppRole[user.role],
    roles: getAppRolesFromUser(user),
  }));
}

export async function getCurrentUser(): Promise<AppUser> {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login?error=session-required");
  }

  if (session.user.mustChangePassword) {
    redirect("/account/change-password?reason=required");
  }

  return {
    id: session.user.id,
    name: formatPersonName(session.user.name),
    email: session.user.email,
    role: prismaRoleToAppRole[session.user.role],
    roles: getAppRolesFromUser(session.user),
    geofenceMode: session.user.geofenceMode,
  };
}
