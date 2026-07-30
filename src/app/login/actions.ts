"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

const LOGIN_WINDOW_MINUTES = 15;
const MAX_EMAIL_FAILURES = 8;
const MAX_IP_FAILURES = 20;
const DUMMY_PASSWORD_HASH =
  `pbkdf2$120000$00000000000000000000000000000000$${"00".repeat(64)}`;

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

  const headerStore = await headers();
  const ipAddress =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip")?.trim() ||
    null;
  const rateRows = await prisma.$queryRaw<
    Array<{ emailFailures: bigint; ipFailures: bigint }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE "userEmail" = ${email})::bigint AS "emailFailures",
      COUNT(*) FILTER (
        WHERE ${ipAddress}::text IS NOT NULL
          AND "ipAddress" = ${ipAddress}
      )::bigint AS "ipFailures"
    FROM public."SecurityAuditLog"
    WHERE "eventType" = 'LOGIN_FAILED'::public."SecurityEventType"
      AND "createdAt" >= CURRENT_TIMESTAMP
        - (${LOGIN_WINDOW_MINUTES} * INTERVAL '1 minute')
  `;
  const rate = rateRows[0];
  if (
    Number(rate?.emailFailures ?? 0) >= MAX_EMAIL_FAILURES ||
    Number(rate?.ipFailures ?? 0) >= MAX_IP_FAILURES
  ) {
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      userEmail: email,
      path: "/login",
      description: "Login was rate-limited after repeated failed attempts.",
    });
    redirect("/login?error=too-many-attempts");
  }

  await prisma.authSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  const isValidPassword = verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (
    !user ||
    user.status !== "ACTIVE" ||
    !user.passwordHash ||
    !isValidPassword
  ) {
    const internalReason = !user
      ? "user not found"
      : user.status !== "ACTIVE"
        ? "account inactive"
        : !user.passwordHash
          ? "password not set"
          : "password incorrect";
    await createSecurityAuditLog({
      eventType: "LOGIN_FAILED",
      user: user ?? null,
      userEmail: email,
      path: "/login",
      description: `Login failed (${internalReason}).`,
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
