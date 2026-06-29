"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPortalLandingPath } from "@/lib/current-user";
import { setMustChangePassword } from "@/lib/password-change-state";
import {
  hashPassword,
  isStrongEnoughPassword,
  verifyPassword,
} from "@/lib/password";
import {
  clearForcePasswordChangeCookie,
  getCurrentSession,
} from "@/lib/session";
import { createSecurityAuditLog } from "@/lib/security-audit";
import type { UserRole as PrismaUserRole } from "@/generated/prisma/client";

const prismaRoleToAppRole: Record<
  PrismaUserRole,
  Parameters<typeof getPortalLandingPath>[0]
> = {
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

export async function changeOwnPasswordAction(formData: FormData) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login?error=session-required");
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect("/account/change-password?error=missing-fields");
  }

  if (!session.user.passwordHash) {
    redirect("/account/change-password?error=password-not-set");
  }

  const currentPasswordValid = verifyPassword(
    currentPassword,
    session.user.passwordHash
  );

  if (!currentPasswordValid) {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      user: session.user,
      path: "/account/change-password",
      description:
        "Password change failed because current password was incorrect.",
    });

    redirect("/account/change-password?error=current-password-wrong");
  }

  if (!isStrongEnoughPassword(newPassword)) {
    redirect("/account/change-password?error=weak-password");
  }

  if (newPassword !== confirmPassword) {
    redirect("/account/change-password?error=password-mismatch");
  }

  if (currentPassword === newPassword) {
    redirect("/account/change-password?error=same-password");
  }

  await prisma.user.update({
    where: {
      id: session.user.id,
    },
    data: {
      passwordHash: hashPassword(newPassword),
    },
  });

  await setMustChangePassword(session.user.id, false);

  await clearForcePasswordChangeCookie();

  await createSecurityAuditLog({
    eventType: "PASSWORD_CHANGED",
    user: session.user,
    path: "/account/change-password",
    description: "User changed their own password successfully.",
  });

  redirect(getPortalLandingPath(prismaRoleToAppRole[session.user.role]));
}
