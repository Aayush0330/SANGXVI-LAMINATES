import type { UserRole as PrismaUserRole } from "@/generated/prisma/client";
import { getPortalLandingPath } from "./portal-access";
import { prismaRoleToAppRole } from "./user-role-utils";

export function getAuthenticatedEntryPath(user: {
  role: PrismaUserRole;
  mustChangePassword: boolean;
}) {
  if (user.mustChangePassword) {
    return "/account/change-password?reason=required";
  }

  return getPortalLandingPath(prismaRoleToAppRole[user.role]);
}
