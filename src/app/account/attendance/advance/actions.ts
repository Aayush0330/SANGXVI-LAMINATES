"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canUsePayrollSelfService } from "@/lib/attendance-payroll";
import { createWorkflowNotification } from "@/lib/notifications";
import { createSecurityAuditLog } from "@/lib/security-audit";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanNumber(value: FormDataEntryValue | null) {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function advanceRedirect(message: string, type: "error" | "success" = "error"): never {
  redirect(`/account/attendance/advance?${type}=${encodeURIComponent(message)}`);
}

function revalidateAdvancePaths() {
  revalidatePath("/account/attendance/advance");
  revalidatePath("/internal/attendance/payroll");
  revalidatePath("/internal/dashboard");
}

export async function requestAdvancePayAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser.roles.some((role) => canUsePayrollSelfService(role))) {
    advanceRedirect("not-allowed");
  }

  const amount = Math.max(0, cleanNumber(formData.get("amount")));
  const reason = cleanText(formData.get("reason")) || null;

  if (amount <= 0) {
    advanceRedirect("amount-required");
  }

  await prisma.$executeRaw`
    INSERT INTO public."AttendanceAdvanceRequest" (
      "id",
      "userId",
      "amount",
      "reason",
      "status",
      "requestedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${currentUser.id},
      ${amount},
      ${reason},
      'PENDING'::public."AttendanceRequestStatus",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;

  await createWorkflowNotification({
    title: "Advance pay request",
    message: `${currentUser.name} requested advance pay of ₹${Math.round(amount)}.`,
    module: "attendance",
    href: "/internal/attendance/payroll?tab=advance",
    actor: currentUser,
    recipientRoles: ["owner", "manager"],
    priority: "HIGH",
  });

  await createSecurityAuditLog({
    eventType: "ATTENDANCE_ADVANCE_REQUESTED",
    user: currentUser,
    path: "/account/attendance/advance",
    description: `Requested advance pay of ₹${amount}.`,
  });

  revalidateAdvancePaths();
  advanceRedirect("advance-requested", "success");
}
