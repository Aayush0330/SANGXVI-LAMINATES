"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

export async function clearOldSecurityLogsAction() {
  const { currentUser, hasAccess } = await checkPermission(
    "view_security_logs",
    "/internal/security"
  );

  if (!hasAccess) {
    redirect("/internal/security?error=permission-denied");
  }

  await prisma.$executeRaw`
    DELETE FROM public."SecurityAuditLog"
    WHERE "createdAt" < NOW() - INTERVAL '30 days'
  `;

  await createSecurityAuditLog({
    eventType: "ACCESS_DENIED",
    user: currentUser,
    path: "/internal/security",
    description:
      "Security log maintenance completed: logs older than 30 days were cleared.",
  });

  revalidatePath("/internal/security");
  redirect("/internal/security?success=old-cleared");
}

export async function clearAllSecurityLogsAction() {
  const { currentUser, hasAccess } = await checkPermission(
    "view_security_logs",
    "/internal/security"
  );

  if (!hasAccess) {
    redirect("/internal/security?error=permission-denied");
  }

  await prisma.$executeRaw`
    DELETE FROM public."SecurityAuditLog"
  `;

  await createSecurityAuditLog({
    eventType: "ACCESS_DENIED",
    user: currentUser,
    path: "/internal/security",
    description:
      "Security log maintenance completed: all previous logs were cleared.",
  });

  revalidatePath("/internal/security");
  redirect("/internal/security?success=all-cleared");
}
