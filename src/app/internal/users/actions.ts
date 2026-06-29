"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  formatIndianPhoneNumber,
  formatPersonName,
  normalizeEmail,
} from "@/lib/user-formatters";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import { hashPassword, isStrongEnoughPassword } from "@/lib/password";
import { deleteUserSessions } from "@/lib/session";
import { createSecurityAuditLog } from "@/lib/security-audit";

const validRoles = new Set(Object.values(UserRole));
const validStatuses = new Set(Object.values(UserStatus));

export async function createUserAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users"
  );

  if (!hasAccess) {
    redirect("/internal/users?error=permission-denied");
  }

  const name = formatPersonName(String(formData.get("name") ?? ""));
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const phone = formatIndianPhoneNumber(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const status = String(formData.get("status") ?? "ACTIVE");

  if (!name || !email || !password || !role) {
    redirect("/internal/users?error=missing-fields");
  }

  if (!isStrongEnoughPassword(password)) {
    redirect("/internal/users?error=weak-password");
  }

  if (!validRoles.has(role as UserRole)) {
    redirect("/internal/users?error=invalid-role");
  }

  if (!validStatuses.has(status as UserStatus)) {
    redirect("/internal/users?error=invalid-status");
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    redirect(`/internal/users?error=duplicate-email&email=${encodeURIComponent(email)}`);
  }

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      role: role as UserRole,
      status: status as UserStatus,
    },
  });

  await createSecurityAuditLog({
    eventType: "PASSWORD_RESET",
    user: currentUser,
    path: "/internal/users",
    description: `Initial password created for ${createdUser.email}. User must change password on first login.`,
  });

  revalidatePath("/internal/users");
  redirect("/internal/users?success=user-created");
}

export async function resetUserPasswordAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users"
  );

  if (!hasAccess) {
    redirect("/internal/users?error=permission-denied");
  }

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!userId || !password) {
    redirect("/internal/users?error=missing-password-reset-fields");
  }

  if (!isStrongEnoughPassword(password)) {
    redirect("/internal/users?error=weak-password");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    redirect("/internal/users?error=user-not-found");
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      passwordHash: hashPassword(password),
      mustChangePassword: false,
    },
  });

  await deleteUserSessions(user.id);

  await createSecurityAuditLog({
    eventType: "PASSWORD_RESET",
    user: currentUser,
    path: "/internal/users",
    description: `Password reset for ${user.email}. Existing sessions were signed out. The new password can be used directly.`,
  });

  revalidatePath("/internal/users");
  redirect("/internal/users?success=password-reset");
}
