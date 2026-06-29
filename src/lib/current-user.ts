import { redirect } from "next/navigation";
import type { UserRole } from "./permissions";
import { getPortalByRole } from "./permissions";
import { prisma } from "./db";
import type { UserRole as PrismaUserRole } from "@/generated/prisma/client";
import { formatPersonName } from "./user-formatters";
import { getCurrentSession } from "./session";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

const prismaRoleToAppRole: Record<PrismaUserRole, UserRole> = {
  OWNER: "owner",
  MANAGER: "manager",
  ACCOUNTANT: "accountant",
  INVENTORY_TEAM: "inventory_team",
  DISPATCH_TEAM: "dispatch_team",
  QC_TEAM: "qc_team",
  DRIVER_TRANSPORT: "driver_transport",
  COLLECTION_TEAM: "collection_team",
  SALES_FIELD_TEAM: "sales_field_team",
  DEALER: "dealer",
};

export async function getLoginUsers() {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return users.map((user) => ({
    name: formatPersonName(user.name),
    email: user.email,
    role: prismaRoleToAppRole[user.role],
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
  };
}

export function getPortalLandingPath(role: UserRole) {
  const portal = getPortalByRole(role);

  if (role === "driver_transport") {
    return "/field/deliveries";
  }

  if (role === "collection_team") {
    return "/field/collections";
  }

  if (role === "sales_field_team") {
    return "/field/visits";
  }

  if (portal === "dealer") {
    return "/dealer/dashboard";
  }

  if (portal === "field") {
    return "/field/dashboard";
  }

  return "/internal/dashboard";
}
