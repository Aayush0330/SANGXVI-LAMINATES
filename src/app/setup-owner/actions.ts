"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createAuthSession } from "@/lib/session";
import { hashPassword, isStrongEnoughPassword } from "@/lib/password";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  formatIndianPhoneNumber,
  formatPersonName,
  normalizeEmail,
} from "@/lib/user-formatters";

export async function createFirstOwnerAction(formData: FormData) {
  const name = formatPersonName(String(formData.get("name") ?? ""));
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const phone = formatIndianPhoneNumber(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !email || !password || !confirmPassword) {
    redirect("/setup-owner?error=missing-fields");
  }

  if (!email.includes("@")) {
    redirect("/setup-owner?error=invalid-email");
  }

  if (!isStrongEnoughPassword(password)) {
    redirect("/setup-owner?error=weak-password");
  }

  if (password !== confirmPassword) {
    redirect("/setup-owner?error=password-mismatch");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingOwnerCount = await tx.user.count({
      where: {
        role: "OWNER",
      },
    });

    if (existingOwnerCount > 0) {
      return { status: "owner-exists" as const };
    }

    const existingUser = await tx.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return { status: "duplicate-email" as const };
    }

    const owner = await tx.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash: hashPassword(password),
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    return { status: "created" as const, owner };
  });

  if (result.status === "owner-exists") {
    redirect("/login?error=owner-already-exists");
  }

  if (result.status === "duplicate-email") {
    redirect("/setup-owner?error=duplicate-email");
  }

  await createSecurityAuditLog({
    eventType: "FIRST_OWNER_CREATED",
    user: result.owner,
    path: "/setup-owner",
    description: "First owner account was created.",
  });

  await createAuthSession(result.owner.id);

  redirect("/internal/dashboard");
}
