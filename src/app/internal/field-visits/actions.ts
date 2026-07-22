"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldVisitStatus } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

function getSafeStatus(value: string): FieldVisitStatus {
  if (value === "GOAL_ACHIEVED") return FieldVisitStatus.GOAL_ACHIEVED;
  if (value === "GOAL_PENDING") return FieldVisitStatus.GOAL_PENDING;
  if (value === "FOLLOW_UP_REQUIRED") {
    return FieldVisitStatus.FOLLOW_UP_REQUIRED;
  }
  if (value === "CLOSED") return FieldVisitStatus.CLOSED;
  return FieldVisitStatus.VISIT_REPORTED;
}

export async function updateFieldVisitStatusAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "view_field_visit_reports",
    "/internal/field-visits"
  );

  if (!hasAccess) {
    redirect("/internal/field-visits?error=permission-denied");
  }

  const visitId = String(formData.get("visitId") ?? "").trim();
  const status = getSafeStatus(String(formData.get("status") ?? ""));

  if (!visitId) {
    redirect("/internal/field-visits?error=missing-visit");
  }

  const existingVisit = await prisma.fieldVisit.findUnique({
    where: { id: visitId },
    select: { id: true },
  });

  if (!existingVisit) {
    redirect("/internal/field-visits?error=visit-not-found");
  }

  const visit = await prisma.fieldVisit.update({
    where: { id: existingVisit.id },
    data: { status },
  });

  await createSecurityAuditLog({
    eventType: "FIELD_VISIT_UPDATED",
    user: currentUser,
    path: "/internal/field-visits",
    description: `Field visit ${visit.visitNumber} status updated to ${status}.`,
  });

  revalidatePath("/internal/field-visits");
  revalidatePath("/field/visits");
  revalidatePath("/field/dashboard");
  revalidatePath("/internal/security");

  redirect("/internal/field-visits?success=status-updated");
}
