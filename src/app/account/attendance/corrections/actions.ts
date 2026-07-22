"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { getIndiaWorkDate } from "@/lib/office-attendance";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { isValidWorkDate } from "@/lib/attendance-payroll";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function parseIndiaDateTime(value: FormDataEntryValue | null) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function go(code: string, type: "error" | "success" = "error"): never {
  redirect(`/account/attendance/corrections?${type}=${encodeURIComponent(code)}`);
}

export async function requestAttendanceCorrectionAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "use_office_attendance",
    "/account/attendance/corrections",
  );
  if (!hasAccess || currentUser.roles.includes("dealer")) go("permission-denied");

  const workDate = text(formData.get("workDate"));
  const requestedPunchIn = parseIndiaDateTime(formData.get("requestedPunchIn"));
  const requestedPunchOut = parseIndiaDateTime(formData.get("requestedPunchOut"));
  const reason = text(formData.get("reason"));

  if (!isValidWorkDate(workDate) || !requestedPunchIn || !requestedPunchOut || requestedPunchOut <= requestedPunchIn || reason.length < 5) {
    go("invalid-request");
  }
  if (workDate > getIndiaWorkDate()) go("future-date");
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(requestedPunchIn);
  const outIndiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(requestedPunchOut);
  if (indiaDate !== workDate || outIndiaDate !== workDate) go("date-mismatch");

  const monthKey = workDate.slice(0, 7);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${monthKey}`}))`;

      const finalized = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public."PayrollRun"
        WHERE "monthKey" = ${monthKey} AND "status" = 'FINALIZED'
        LIMIT 1
      `;
      if (finalized.length) throw new Error("PAYROLL_LOCKED");

      const duplicate = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public."AttendanceCorrectionRequest"
        WHERE "userId" = ${currentUser.id}
          AND "workDate" = ${workDate}
          AND "status" = 'PENDING'::public."AttendanceRequestStatus"
        LIMIT 1
      `;
      if (duplicate.length) throw new Error("ALREADY_PENDING");

      await tx.$executeRaw`
        INSERT INTO public."AttendanceCorrectionRequest" (
          "id", "userId", "workDate", "requestedPunchIn", "requestedPunchOut",
          "reason", "status", "requestedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${currentUser.id}, ${workDate}, ${requestedPunchIn}, ${requestedPunchOut},
          ${reason}, 'PENDING'::public."AttendanceRequestStatus", CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYROLL_LOCKED") go("payroll-locked");
    if (error instanceof Error && error.message === "ALREADY_PENDING") go("already-pending");
    throw error;
  }

  await createWorkflowNotification({
    title: "Attendance correction requested",
    message: `${currentUser.name} requested attendance correction for ${workDate}.`,
    module: "hr",
    href: "/internal/hr",
    actor: currentUser,
    recipientRoles: ["owner", "manager"],
    priority: "HIGH",
    dedupeKey: `attendance-correction:${currentUser.id}:${workDate}`,
  });
  await createSecurityAuditLog({
    eventType: "ATTENDANCE_CORRECTION_REQUESTED",
    user: currentUser,
    path: "/account/attendance/corrections",
    description: `Requested attendance correction for ${workDate}. Reason: ${reason}`,
  });
  revalidatePath("/account/attendance/corrections");
  revalidatePath("/internal/hr");
  go("request-sent", "success");
}
