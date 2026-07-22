"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPortalLandingPath } from "@/lib/current-user";
import { getMustChangePassword } from "@/lib/password-change-state";
import { verifyPassword } from "@/lib/password";
import {
  clearForcePasswordChangeCookie,
  createAuthSession,
  setForcePasswordChangeCookie,
} from "@/lib/session";
import { normalizeEmail } from "@/lib/user-formatters";
import { createSecurityAuditLog } from "@/lib/security-audit";
import type { UserRole as PrismaUserRole } from "@/generated/prisma/client";

const prismaRoleToAppRole: Record<
  PrismaUserRole,
  Parameters<typeof getPortalLandingPath>[0]
> = {
  OWNER: "owner",
  MANAGER: "manager",
  ACCOUNTANT: "accountant",

  DISPATCH_TEAM: "dispatch_team",
  ORDER_TEAM: "order_team",
  QC_TEAM: "qc_team",
  DRIVER_TRANSPORT: "driver_transport",
  COLLECTION_TEAM: "collection_team",
  SALES_FIELD_TEAM: "sales_field_team",
  DEALER: "dealer",
};

export async function loginAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      userEmail: email || null,
      path: "/login",
      description: "Login failed because email or password was missing.",
    });

    redirect("/login?error=missing-fields");
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      userEmail: email,
      path: "/login",
      description: "Login failed because user was not found.",
    });

    redirect("/login?error=invalid-credentials");
  }

  if (user.status !== "ACTIVE") {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      user,
      path: "/login",
      description: "Login failed because user account is inactive.",
    });

    redirect("/login?error=inactive-user");
  }

  if (!user.passwordHash) {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      user,
      path: "/login",
      description: "Login failed because password is not set for this user.",
    });

    redirect("/login?error=password-not-set");
  }

  const isValidPassword = verifyPassword(password, user.passwordHash);

  if (!isValidPassword) {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      user,
      path: "/login",
      description: "Login failed because password was incorrect.",
    });

    redirect("/login?error=invalid-credentials");
  }

  await createSecurityAuditLog({
    eventType: "LOGIN_SUCCESS",
    user,
    path: "/login",
    description: "User logged in successfully.",
  });

  await createAuthSession(user.id);

  const mustChangePassword = await getMustChangePassword(user.id);

  if (mustChangePassword) {
    await setForcePasswordChangeCookie();
    redirect("/account/change-password?reason=required");
  }

  await clearForcePasswordChangeCookie();

  redirect(getPortalLandingPath(prismaRoleToAppRole[user.role]));
}
