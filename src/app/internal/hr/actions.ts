"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { isValidWorkDate } from "@/lib/attendance-payroll";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { getIndiaWorkDate } from "@/lib/office-attendance";
import { createSecurityAuditLog } from "@/lib/security-audit";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function optional(value: FormDataEntryValue | null) {
  return text(value) || null;
}
function hrRedirect(code: string, type: "error" | "success" = "error", employeeId?: string): never {
  const params = new URLSearchParams({ [type]: code });
  if (employeeId) params.set("employee", employeeId);
  redirect(`/internal/hr?${params.toString()}`);
}
function validOptionalDate(value: string | null) {
  return !value || isValidWorkDate(value);
}

type EmployeeRow = { id: string; name: string; email: string; status: string };
type ProfileRow = {
  employeeCode: string | null;
  department: string | null;
  designation: string | null;
  reportingManagerId: string | null;
  joiningDate: string | null;
};

async function getInternalEmployee(userId: string) {
  const rows = await prisma.$queryRaw<EmployeeRow[]>`
    SELECT u."id", u."name", u."email", u."status"::text AS "status"
    FROM public."User" u
    WHERE u."id" = ${userId}
      AND (
        u."role"::text <> 'DEALER'
        OR EXISTS (
          SELECT 1 FROM public."UserRoleAssignment" assignment
          WHERE assignment."userId" = u."id" AND assignment."role"::text <> 'DEALER'
        )
      )
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function saveEmployeeProfileAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_hr", "/internal/hr");
  if (!hasAccess) hrRedirect("permission-denied");

  const userId = text(formData.get("userId"));
  const employeeCode = optional(formData.get("employeeCode"));
  const department = optional(formData.get("department"));
  const designation = optional(formData.get("designation"));
  const employmentType = text(formData.get("employmentType")) || "FULL_TIME";
  const joiningDate = optional(formData.get("joiningDate"));
  const probationEndDate = optional(formData.get("probationEndDate"));
  const reportingManagerId = optional(formData.get("reportingManagerId"));
  const emergencyContactName = optional(formData.get("emergencyContactName"));
  const emergencyContactPhone = optional(formData.get("emergencyContactPhone"));
  const lastWorkingDate = optional(formData.get("lastWorkingDate"));
  const notes = optional(formData.get("notes"));
  const allowedTypes = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"];

  if (!userId || !allowedTypes.includes(employmentType) || !validOptionalDate(joiningDate) || !validOptionalDate(probationEndDate) || !validOptionalDate(lastWorkingDate)) {
    hrRedirect("invalid-profile", "error", userId);
  }
  if (joiningDate && probationEndDate && probationEndDate < joiningDate) hrRedirect("invalid-probation", "error", userId);
  if (joiningDate && lastWorkingDate && lastWorkingDate < joiningDate) hrRedirect("invalid-exit-date", "error", userId);

  const employee = await getInternalEmployee(userId);
  if (!employee) hrRedirect("employee-not-found");

  let managerName: string | null = null;
  if (reportingManagerId) {
    if (reportingManagerId === userId) hrRedirect("self-manager", "error", userId);
    const manager = await getInternalEmployee(reportingManagerId);
    if (!manager || manager.status !== "ACTIVE") hrRedirect("manager-not-found", "error", userId);
    managerName = manager.name;
  }

  if (employeeCode) {
    const duplicates = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM public."EmployeeProfile"
      WHERE LOWER("employeeCode") = LOWER(${employeeCode}) AND "userId" <> ${userId}
      LIMIT 1
    `;
    if (duplicates.length) hrRedirect("employee-code-exists", "error", userId);
  }

  const oldRows = await prisma.$queryRaw<ProfileRow[]>`
    SELECT "employeeCode", "department", "designation", "reportingManagerId", "joiningDate"
    FROM public."EmployeeProfile" WHERE "userId" = ${userId} LIMIT 1
  `;
  const previous = oldRows[0] ?? null;

  await prisma.$executeRaw`
    INSERT INTO public."EmployeeProfile" (
      "id", "userId", "employeeCode", "department", "designation", "employmentType",
      "joiningDate", "probationEndDate", "reportingManagerId", "reportingManagerName",
      "emergencyContactName", "emergencyContactPhone", "lastWorkingDate", "notes",
      "createdById", "createdByName", "updatedById", "updatedByName", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${employeeCode}, ${department}, ${designation},
      ${employmentType}::public."EmploymentType", ${joiningDate}, ${probationEndDate},
      ${reportingManagerId}, ${managerName}, ${emergencyContactName}, ${emergencyContactPhone},
      ${lastWorkingDate}, ${notes}, ${currentUser.id}, ${currentUser.name},
      ${currentUser.id}, ${currentUser.name}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "employeeCode" = EXCLUDED."employeeCode",
      "department" = EXCLUDED."department",
      "designation" = EXCLUDED."designation",
      "employmentType" = EXCLUDED."employmentType",
      "joiningDate" = EXCLUDED."joiningDate",
      "probationEndDate" = EXCLUDED."probationEndDate",
      "reportingManagerId" = EXCLUDED."reportingManagerId",
      "reportingManagerName" = EXCLUDED."reportingManagerName",
      "emergencyContactName" = EXCLUDED."emergencyContactName",
      "emergencyContactPhone" = EXCLUDED."emergencyContactPhone",
      "lastWorkingDate" = EXCLUDED."lastWorkingDate",
      "notes" = EXCLUDED."notes",
      "updatedById" = EXCLUDED."updatedById",
      "updatedByName" = EXCLUDED."updatedByName",
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  let eventType = "PROFILE_UPDATED";
  let title = "Employee profile updated";
  let previousValue: string | null = null;
  let newValue: string | null = null;
  if (!previous && joiningDate) {
    eventType = "JOINED";
    title = "Employee joined";
    newValue = joiningDate;
  } else if (previous?.designation !== designation) {
    eventType = "PROMOTED";
    title = "Designation updated";
    previousValue = previous?.designation ?? null;
    newValue = designation;
  } else if (previous?.department !== department || previous?.reportingManagerId !== reportingManagerId) {
    eventType = "TRANSFERRED";
    title = "Department or reporting manager updated";
    previousValue = previous?.department ?? null;
    newValue = department;
  }

  await prisma.$executeRaw`
    INSERT INTO public."EmployeeLifecycleEvent" (
      "id", "userId", "eventType", "effectiveDate", "title", "details",
      "previousValue", "newValue", "createdById", "createdByName", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${eventType}::public."EmployeeLifecycleType",
      ${joiningDate ?? getIndiaWorkDate()}, ${title}, ${notes}, ${previousValue}, ${newValue},
      ${currentUser.id}, ${currentUser.name}, CURRENT_TIMESTAMP
    )
  `;

  await createWorkflowNotification({
    title: "Employee profile updated",
    message: `Your employee profile was updated by ${currentUser.name}.`,
    module: "hr",
    href: "/account/attendance",
    actor: currentUser,
    recipientUserIds: [userId],
    priority: "NORMAL",
  });
  await createSecurityAuditLog({
    eventType: "EMPLOYEE_PROFILE_UPDATED",
    user: currentUser,
    path: "/internal/hr",
    description: `Updated HR profile for ${employee.name}${employeeCode ? ` (${employeeCode})` : ""}.`,
  });
  revalidatePath("/internal/hr");
  revalidatePath("/internal/hr/reports");
  hrRedirect("profile-saved", "success", userId);
}

export async function addLifecycleEventAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_hr", "/internal/hr");
  if (!hasAccess) hrRedirect("permission-denied");
  const userId = text(formData.get("userId"));
  const eventType = text(formData.get("eventType"));
  const effectiveDate = text(formData.get("effectiveDate"));
  const title = text(formData.get("title"));
  const details = optional(formData.get("details"));
  const previousValue = optional(formData.get("previousValue"));
  const newValue = optional(formData.get("newValue"));
  const allowed = ["JOINED", "PROFILE_UPDATED", "TRANSFERRED", "PROMOTED", "STATUS_CHANGED", "EXITED", "REACTIVATED", "NOTE"];
  if (!userId || !allowed.includes(eventType) || !isValidWorkDate(effectiveDate) || title.length < 3) hrRedirect("invalid-lifecycle", "error", userId);
  const employee = await getInternalEmployee(userId);
  if (!employee) hrRedirect("employee-not-found");

  await prisma.$executeRaw`
    INSERT INTO public."EmployeeLifecycleEvent" (
      "id", "userId", "eventType", "effectiveDate", "title", "details",
      "previousValue", "newValue", "createdById", "createdByName", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${eventType}::public."EmployeeLifecycleType",
      ${effectiveDate}, ${title}, ${details}, ${previousValue}, ${newValue},
      ${currentUser.id}, ${currentUser.name}, CURRENT_TIMESTAMP
    )
  `;
  await createSecurityAuditLog({
    eventType: "EMPLOYEE_LIFECYCLE_RECORDED",
    user: currentUser,
    path: "/internal/hr",
    description: `Recorded ${eventType} lifecycle event for ${employee.name}: ${title}.`,
  });
  revalidatePath("/internal/hr");
  revalidatePath("/internal/hr/reports");
  hrRedirect("lifecycle-added", "success", userId);
}

export async function decideAttendanceCorrectionAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_attendance", "/internal/hr");
  if (!hasAccess) hrRedirect("permission-denied");
  const requestId = text(formData.get("requestId"));
  const decision = text(formData.get("decision"));
  const decisionNote = optional(formData.get("decisionNote"));
  if (!requestId || !["APPROVED", "REJECTED"].includes(decision)) hrRedirect("invalid-correction-decision");

  const rows = await prisma.$queryRaw<{
    id: string; userId: string; userName: string; workDate: string;
    requestedPunchIn: Date; requestedPunchOut: Date; reason: string; status: string;
  }[]>`
    SELECT request."id", request."userId", employee."name" AS "userName", request."workDate",
      request."requestedPunchIn", request."requestedPunchOut", request."reason",
      request."status"::text AS "status"
    FROM public."AttendanceCorrectionRequest" request
    INNER JOIN public."User" employee ON employee."id" = request."userId"
    WHERE request."id" = ${requestId} LIMIT 1
  `;
  const request = rows[0];
  if (!request) hrRedirect("correction-not-found");
  if (request.status !== "PENDING") hrRedirect("correction-already-decided");
  const monthKey = request.workDate.slice(0, 7);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${monthKey}`}))`;

      const lockedRequests = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status"
        FROM public."AttendanceCorrectionRequest"
        WHERE "id" = ${requestId}
        FOR UPDATE
      `;
      if (!lockedRequests[0]) throw new Error("CORRECTION_NOT_FOUND");
      if (lockedRequests[0].status !== "PENDING") {
        throw new Error("CORRECTION_ALREADY_DECIDED");
      }

      const lockedPayroll = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public."PayrollRun"
        WHERE "monthKey" = ${monthKey} AND "status" = 'FINALIZED'
        LIMIT 1
      `;
      if (lockedPayroll.length) throw new Error("PAYROLL_LOCKED");

      if (decision === "APPROVED") {
        const totalMinutes = Math.max(
          0,
          Math.floor(
            (request.requestedPunchOut.getTime() - request.requestedPunchIn.getTime()) /
              60000,
          ),
        );
        const existingRows = await tx.$queryRaw<{
          id: string;
          punchInAt: Date | null;
          punchOutAt: Date | null;
          breakMinutes: number;
          netWorkingMinutes: number | null;
        }[]>`
          SELECT "id", "punchInAt", "punchOutAt", "breakMinutes", "netWorkingMinutes"
          FROM public."OfficeAttendance"
          WHERE "userId" = ${request.userId} AND "workDate" = ${request.workDate}
          LIMIT 1
          FOR UPDATE
        `;
        const existing = existingRows[0];
        const attendanceId = existing?.id ?? randomUUID();
        const breakMinutes = Number(existing?.breakMinutes ?? 0);
        const netMinutes = Math.max(0, totalMinutes - breakMinutes);

        await tx.$executeRaw`
          INSERT INTO public."OfficeAttendance" (
            "id", "userId", "workDate", "status", "punchInAt", "punchOutAt",
            "breakMinutes", "totalMinutes", "netWorkingMinutes", "createdAt", "updatedAt"
          ) VALUES (
            ${attendanceId}, ${request.userId}, ${request.workDate}, 'COMPLETED',
            ${request.requestedPunchIn}, ${request.requestedPunchOut}, ${breakMinutes},
            ${totalMinutes}, ${netMinutes}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT ("userId", "workDate") DO UPDATE SET
            "punchInAt" = EXCLUDED."punchInAt", "punchOutAt" = EXCLUDED."punchOutAt",
            "status" = 'COMPLETED', "currentBreakType" = NULL, "currentBreakStartedAt" = NULL,
            "totalMinutes" = EXCLUDED."totalMinutes", "netWorkingMinutes" = EXCLUDED."netWorkingMinutes",
            "updatedAt" = CURRENT_TIMESTAMP
        `;
        await tx.$executeRaw`
          INSERT INTO public."AttendanceCorrection" (
            "id", "attendanceId", "userId", "previousPunchIn", "previousPunchOut",
            "correctedPunchIn", "correctedPunchOut", "previousNetMinutes", "correctedNetMinutes",
            "reason", "correctedById", "correctedByName", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${attendanceId}, ${request.userId}, ${existing?.punchInAt ?? null},
            ${existing?.punchOutAt ?? null}, ${request.requestedPunchIn}, ${request.requestedPunchOut},
            ${existing?.netWorkingMinutes ?? null}, ${netMinutes}, ${request.reason},
            ${currentUser.id}, ${currentUser.name}, CURRENT_TIMESTAMP
          )
        `;
        await tx.$executeRaw`
          INSERT INTO public."OfficeAttendanceEvent" (
            "id", "attendanceId", "userId", "eventType", "label", "insideGeofence", "note", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${attendanceId}, ${request.userId}, 'MANAGER_CORRECTION',
            'Attendance correction request approved', false, ${request.reason}, CURRENT_TIMESTAMP
          )
        `;
        await tx.$executeRaw`
          DELETE FROM public."AttendanceOvertimeApproval" WHERE "attendanceId" = ${attendanceId}
        `;
        await tx.$executeRaw`
          UPDATE public."AttendanceCorrectionRequest"
          SET "status" = 'APPROVED'::public."AttendanceRequestStatus",
            "decidedById" = ${currentUser.id}, "decidedByName" = ${currentUser.name},
            "decidedAt" = CURRENT_TIMESTAMP, "decisionNote" = ${decisionNote},
            "appliedAttendanceId" = ${attendanceId}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${requestId}
            AND "status" = 'PENDING'::public."AttendanceRequestStatus"
        `;
      } else {
        await tx.$executeRaw`
          UPDATE public."AttendanceCorrectionRequest"
          SET "status" = 'REJECTED'::public."AttendanceRequestStatus",
            "decidedById" = ${currentUser.id}, "decidedByName" = ${currentUser.name},
            "decidedAt" = CURRENT_TIMESTAMP, "decisionNote" = ${decisionNote},
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${requestId}
            AND "status" = 'PENDING'::public."AttendanceRequestStatus"
        `;
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CORRECTION_NOT_FOUND") {
      hrRedirect("correction-not-found");
    }
    if (error instanceof Error && error.message === "CORRECTION_ALREADY_DECIDED") {
      hrRedirect("correction-already-decided");
    }
    if (error instanceof Error && error.message === "PAYROLL_LOCKED") {
      hrRedirect("payroll-locked");
    }
    throw error;
  }


  await createWorkflowNotification({
    title: decision === "APPROVED" ? "Attendance correction approved" : "Attendance correction rejected",
    message: `Your attendance correction for ${request.workDate} was ${decision.toLowerCase()} by ${currentUser.name}.`,
    module: "hr",
    href: "/account/attendance/corrections",
    actor: currentUser,
    recipientUserIds: [request.userId],
    priority: decision === "APPROVED" ? "NORMAL" : "HIGH",
  });
  await createSecurityAuditLog({
    eventType: decision === "APPROVED" ? "ATTENDANCE_CORRECTION_APPROVED" : "ATTENDANCE_CORRECTION_REJECTED",
    user: currentUser,
    path: "/internal/hr",
    description: `${decision === "APPROVED" ? "Approved" : "Rejected"} ${request.userName}'s attendance correction for ${request.workDate}.`,
  });
  revalidatePath("/internal/hr");
  revalidatePath("/internal/attendance");
  revalidatePath("/internal/attendance/payroll");
  revalidatePath("/account/attendance/corrections");
  hrRedirect(decision === "APPROVED" ? "correction-approved" : "correction-rejected", "success");
}
