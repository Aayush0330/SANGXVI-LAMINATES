"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  calculateInclusiveDays,
  canUsePayrollSelfService,
  isValidWorkDate,
  type AttendanceLeaveType,
} from "@/lib/attendance-payroll";
import { createWorkflowNotification } from "@/lib/notifications";
import { createSecurityAuditLog } from "@/lib/security-audit";

const validLeaveTypes = new Set<AttendanceLeaveType>([
  "FULL_DAY",
  "HALF_DAY",
  "PAID",
  "UNPAID",
  "EMERGENCY",
]);

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function normalizeLeaveType(value: string) {
  return validLeaveTypes.has(value as AttendanceLeaveType) ? (value as AttendanceLeaveType) : null;
}

function leaveRedirect(message: string, type: "error" | "success" = "error"): never {
  redirect(`/account/attendance/leave?${type}=${encodeURIComponent(message)}`);
}

function revalidateLeavePaths() {
  revalidatePath("/account/attendance/leave");
  revalidatePath("/internal/attendance/payroll");
  revalidatePath("/internal/dashboard");
}

export async function requestLeaveAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser.roles.some((role) => canUsePayrollSelfService(role))) {
    leaveRedirect("not-allowed");
  }

  const startDate = cleanText(formData.get("startDate"));
  const endDate = cleanText(formData.get("endDate"));
  const leaveType = normalizeLeaveType(cleanText(formData.get("leaveType")) || "FULL_DAY");
  const reason = cleanText(formData.get("reason")) || null;

  if (!isValidWorkDate(startDate) || !isValidWorkDate(endDate) || !leaveType) {
    leaveRedirect("invalid-leave-details");
  }

  const totalDays = calculateInclusiveDays(startDate, endDate);

  if (totalDays <= 0) {
    leaveRedirect("invalid-date-range");
  }

  const payableDays = leaveType === "HALF_DAY" ? 0.5 : totalDays;

  const isOwner = currentUser.roles.includes("owner");
  const requestId = randomUUID();

  if (isOwner) {
    await prisma.$executeRaw`
      INSERT INTO public."AttendanceLeaveRequest" (
        "id",
        "userId",
        "startDate",
        "endDate",
        "leaveType",
        "days",
        "reason",
        "status",
        "requestedAt",
        "decidedById",
        "decidedByName",
        "decidedAt",
        "decisionNote",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${requestId},
        ${currentUser.id},
        ${startDate},
        ${endDate},
        ${leaveType}::public."AttendanceLeaveType",
        ${payableDays},
        ${reason},
        'APPROVED'::public."AttendanceRequestStatus",
        CURRENT_TIMESTAMP,
        ${currentUser.id},
        ${currentUser.name},
        CURRENT_TIMESTAMP,
        'Owner availability record. No approval required.',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

    await createSecurityAuditLog({
      eventType: "ATTENDANCE_OWNER_UNAVAILABLE_RECORDED",
      user: currentUser,
      path: "/account/attendance/leave",
      description: `Owner marked unavailable from ${startDate} to ${endDate}. No approval required. Sundays are included when date range covers Sunday.`,
    });

    revalidateLeavePaths();
    leaveRedirect("owner-unavailable-recorded", "success");
  }

  await prisma.$executeRaw`
    INSERT INTO public."AttendanceLeaveRequest" (
      "id",
      "userId",
      "startDate",
      "endDate",
      "leaveType",
      "days",
      "reason",
      "status",
      "requestedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${requestId},
      ${currentUser.id},
      ${startDate},
      ${endDate},
      ${leaveType}::public."AttendanceLeaveType",
      ${payableDays},
      ${reason},
      'PENDING'::public."AttendanceRequestStatus",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;

  const approverRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM public."User"
    WHERE "status" = 'ACTIVE'::public."UserStatus"
      AND "role"::text IN ('OWNER', 'MANAGER')
      AND "id" <> ${currentUser.id}
  `;

  if (approverRows.length > 0) {
    await createWorkflowNotification({
      title: "Leave request",
      message: `${currentUser.name} requested leave from ${startDate} to ${endDate}.`,
      module: "attendance",
      href: "/internal/attendance/payroll?tab=leave",
      actor: currentUser,
      recipientUserIds: approverRows.map((approver) => approver.id),
      priority: "HIGH",
    });
  }

  await createSecurityAuditLog({
    eventType: "ATTENDANCE_LEAVE_REQUESTED",
    user: currentUser,
    path: "/account/attendance/leave",
    description: `Requested ${leaveType.replaceAll("_", " ")} leave from ${startDate} to ${endDate}. Sundays are included in requested days when date range covers Sunday.`,
  });

  revalidateLeavePaths();
  leaveRedirect("leave-requested", "success");
}
