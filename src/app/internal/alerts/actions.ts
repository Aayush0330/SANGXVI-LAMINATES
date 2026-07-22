"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function requireAlertManager() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_alert_center",
    "/internal/alerts",
  );

  if (!hasAccess) {
    redirect("/internal/alerts?error=permission-denied");
  }

  return currentUser;
}

export async function acknowledgeAlertAction(formData: FormData) {
  const currentUser = await requireAlertManager();
  const notificationId = clean(formData.get("notificationId"));

  if (!notificationId) {
    redirect("/internal/alerts?error=missing-alert");
  }

  const changed = await prisma.$executeRaw`
    UPDATE public."Notification"
    SET
      "status" = 'ACKNOWLEDGED',
      "acknowledgedAt" = COALESCE("acknowledgedAt", CURRENT_TIMESTAMP),
      "acknowledgedById" = COALESCE("acknowledgedById", ${currentUser.id})
    WHERE "id" = ${notificationId}
      AND "priority" IN ('HIGH_ALERT', 'BLOCKER', 'CRITICAL')
      AND "status" = 'OPEN'
  `;

  if (changed > 0) {
    await createSecurityAuditLog({
      eventType: "ALERT_ACKNOWLEDGED",
      user: currentUser,
      path: "/internal/alerts",
      description: `Acknowledged internal alert ${notificationId}.`,
    });
  }

  revalidatePath("/internal/alerts");
  revalidatePath("/internal/dashboard");
}

export async function resolveAlertAction(formData: FormData) {
  const currentUser = await requireAlertManager();
  const notificationId = clean(formData.get("notificationId"));
  const resolutionNote = clean(formData.get("resolutionNote"));

  if (!notificationId) {
    redirect("/internal/alerts?error=missing-alert");
  }

  if (resolutionNote.length < 3) {
    redirect(`/internal/alerts?error=resolution-required&alert=${encodeURIComponent(notificationId)}`);
  }

  const changed = await prisma.$executeRaw`
    UPDATE public."Notification"
    SET
      "status" = 'RESOLVED',
      "resolvedAt" = CURRENT_TIMESTAMP,
      "resolvedById" = ${currentUser.id},
      "resolutionNote" = ${resolutionNote.slice(0, 1000)},
      "acknowledgedAt" = COALESCE("acknowledgedAt", CURRENT_TIMESTAMP),
      "acknowledgedById" = COALESCE("acknowledgedById", ${currentUser.id})
    WHERE "id" = ${notificationId}
      AND "priority" IN ('HIGH_ALERT', 'BLOCKER', 'CRITICAL')
      AND "status" IN ('OPEN', 'ACKNOWLEDGED')
  `;

  if (changed > 0) {
    await createSecurityAuditLog({
      eventType: "ALERT_RESOLVED",
      user: currentUser,
      path: "/internal/alerts",
      description: `Resolved internal alert ${notificationId}. Note: ${resolutionNote.slice(0, 300)}`,
    });
  }

  revalidatePath("/internal/alerts");
  revalidatePath("/internal/dashboard");
}
