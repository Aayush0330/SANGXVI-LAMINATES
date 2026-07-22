"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  getMonthKey,
  getPayrollSummary,
  isValidMonthKey,
  isValidWorkDate,
} from "@/lib/attendance-payroll";
import { markStaleAttendanceForReview } from "@/lib/attendance-reconciliation";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanNumber(value: FormDataEntryValue | null) {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function payrollRedirect(
  message: string,
  type: "error" | "success" = "error",
  employeeId?: string,
  monthKey?: string,
): never {
  const params = new URLSearchParams({ [type]: message });

  if (employeeId) {
    params.set("employee", employeeId);
  }

  if (monthKey) params.set("month", monthKey);

  redirect(`/internal/attendance/payroll?${params.toString()}`);
}

function revalidatePayrollPaths() {
  revalidatePath("/internal/attendance/payroll");
  revalidatePath("/internal/attendance/payroll/payslips");
  revalidatePath("/internal/attendance/summary");
  revalidatePath("/account/attendance/advance");
  revalidatePath("/account/attendance/leave");
  revalidatePath("/account/attendance/payslips");
  revalidatePath("/internal/hr/reports");
  revalidatePath("/internal/reports");
  revalidatePath("/internal/dashboard");
}

export async function updateAttendancePayProfileAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );

  if (!hasAccess) {
    payrollRedirect("permission-denied");
  }

  const userId = cleanText(formData.get("userId"));
  const monthlyBaseSalary = Math.max(
    0,
    cleanNumber(formData.get("monthlyBaseSalary")),
  );
  const monthlyAllowance = Math.max(0, cleanNumber(formData.get("monthlyAllowance")));
  const monthlyDeduction = Math.max(0, cleanNumber(formData.get("monthlyDeduction")));
  const standardDailyMinutes = Math.max(60, Math.round(cleanNumber(formData.get("standardDailyMinutes")) || 480));
  const overtimeHourlyRate = Math.max(0, cleanNumber(formData.get("overtimeHourlyRate")));
  const effectiveMonth = cleanText(formData.get("effectiveMonth"));
  const effectiveFrom = `${effectiveMonth}-01`;

  if (!userId) {
    payrollRedirect("employee-required");
  }

  if (!isValidMonthKey(effectiveMonth) || !isValidWorkDate(effectiveFrom)) {
    payrollRedirect("effective-date-required", "error", userId);
  }

  const lockedRuns = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM public."PayrollRun"
    WHERE "monthKey" = ${effectiveMonth} AND "status" = 'FINALIZED'
    LIMIT 1
  `;
  if (lockedRuns.length > 0) {
    payrollRedirect("payroll-locked", "error", userId, effectiveMonth);
  }

  const employeeRows = await prisma.$queryRaw<{ id: string; name: string; role: string }[]>`
    SELECT "id", "name", "role"::text AS "role"
    FROM public."User"
    WHERE "id" = ${userId}
      AND "status" = 'ACTIVE'::public."UserStatus"
      AND (
        "role"::text <> 'DEALER'
        OR EXISTS (
          SELECT 1 FROM public."UserRoleAssignment" assignment
          WHERE assignment."userId" = public."User"."id"
            AND assignment."role"::text <> 'DEALER'
        )
      )
    LIMIT 1
  `;

  const employee = employeeRows[0];

  if (!employee) {
    payrollRedirect("employee-not-found");
  }

  await prisma.$executeRaw`
    INSERT INTO public."AttendancePayProfile" (
      "id",
      "userId",
      "monthlyBaseSalary",
      "monthlyAllowance",
      "monthlyDeduction",
      "standardDailyMinutes",
      "overtimeHourlyRate",
      "updatedById",
      "updatedByName",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${userId},
      ${monthlyBaseSalary},
      ${monthlyAllowance},
      ${monthlyDeduction},
      ${standardDailyMinutes},
      ${overtimeHourlyRate},
      ${currentUser.id},
      ${currentUser.name},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId") DO UPDATE SET
      "monthlyBaseSalary" = EXCLUDED."monthlyBaseSalary",
      "monthlyAllowance" = EXCLUDED."monthlyAllowance",
      "monthlyDeduction" = EXCLUDED."monthlyDeduction",
      "standardDailyMinutes" = EXCLUDED."standardDailyMinutes",
      "overtimeHourlyRate" = EXCLUDED."overtimeHourlyRate",
      "updatedById" = EXCLUDED."updatedById",
      "updatedByName" = EXCLUDED."updatedByName",
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  await prisma.$executeRaw`
    INSERT INTO public."AttendanceSalaryRevision" (
      "id", "userId", "effectiveFrom", "monthlyBaseSalary",
      "monthlyAllowance", "monthlyDeduction", "standardDailyMinutes",
      "overtimeHourlyRate", "createdById",
      "createdByName", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${effectiveFrom}, ${monthlyBaseSalary},
      ${monthlyAllowance}, ${monthlyDeduction}, ${standardDailyMinutes},
      ${overtimeHourlyRate}, ${currentUser.id},
      ${currentUser.name}, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId", "effectiveFrom") DO UPDATE SET
      "monthlyBaseSalary" = EXCLUDED."monthlyBaseSalary",
      "monthlyAllowance" = EXCLUDED."monthlyAllowance",
      "monthlyDeduction" = EXCLUDED."monthlyDeduction",
      "standardDailyMinutes" = EXCLUDED."standardDailyMinutes",
      "overtimeHourlyRate" = EXCLUDED."overtimeHourlyRate",
      "createdById" = EXCLUDED."createdById",
      "createdByName" = EXCLUDED."createdByName",
      "createdAt" = CURRENT_TIMESTAMP
  `;

  await createSecurityAuditLog({
    eventType: "ATTENDANCE_PAY_PROFILE_UPDATED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `Updated attendance pay profile for ${employee.name}, effective ${effectiveFrom}. Monthly base salary: ₹${monthlyBaseSalary}, allowance: ₹${monthlyAllowance}, fixed deduction: ₹${monthlyDeduction}, standard minutes: ${standardDailyMinutes}, overtime hourly rate: ₹${overtimeHourlyRate}.`,
  });

  revalidatePayrollPaths();
  payrollRedirect("pay-profile-updated", "success", userId, effectiveMonth);
}

export async function savePayrollHolidayAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );
  if (!hasAccess) payrollRedirect("permission-denied");

  const holidayDate = cleanText(formData.get("holidayDate"));
  const name = cleanText(formData.get("name"));
  const isPaid = cleanText(formData.get("isPaid")) !== "false";
  if (!isValidWorkDate(holidayDate) || !name) {
    payrollRedirect("holiday-details-required");
  }
  const monthKey = holidayDate.slice(0, 7);
  const locked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM public."PayrollRun"
    WHERE "monthKey" = ${monthKey} AND "status" = 'FINALIZED' LIMIT 1
  `;
  if (locked.length > 0) payrollRedirect("payroll-locked", "error", undefined, monthKey);

  await prisma.$executeRaw`
    INSERT INTO public."AttendanceHoliday" (
      "id", "holidayDate", "name", "isPaid", "createdById",
      "createdByName", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${holidayDate}, ${name}, ${isPaid}, ${currentUser.id},
      ${currentUser.name}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("holidayDate") DO UPDATE SET
      "name" = EXCLUDED."name", "isPaid" = EXCLUDED."isPaid",
      "createdById" = EXCLUDED."createdById",
      "createdByName" = EXCLUDED."createdByName",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
  await createSecurityAuditLog({
    eventType: "ATTENDANCE_HOLIDAY_UPDATED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `${name} (${holidayDate}) saved as ${isPaid ? "paid" : "unpaid"} holiday.`,
  });
  revalidatePayrollPaths();
  payrollRedirect("holiday-saved", "success", undefined, monthKey);
}

export async function decideOvertimeAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );
  if (!hasAccess) payrollRedirect("permission-denied");

  const attendanceId = cleanText(formData.get("attendanceId"));
  const decision = cleanText(formData.get("decision"));
  const requestedMonthKey = cleanText(formData.get("monthKey"));
  const calculatedMinutes = Math.max(
    0,
    Math.round(cleanNumber(formData.get("calculatedMinutes"))),
  );
  const approvedMinutes =
    decision === "APPROVED"
      ? Math.min(
          calculatedMinutes,
          Math.max(0, Math.round(cleanNumber(formData.get("approvedMinutes")))),
        )
      : 0;
  if (
    !attendanceId ||
    !isValidMonthKey(requestedMonthKey) ||
    !["APPROVED", "REJECTED"].includes(decision)
  ) {
    payrollRedirect("invalid-overtime", "error", undefined, requestedMonthKey);
  }

  const rows = await prisma.$queryRaw<{ userId: string; workDate: string }[]>`
    SELECT "userId", "workDate" FROM public."OfficeAttendance"
    WHERE "id" = ${attendanceId} AND "status" = 'COMPLETED' LIMIT 1
  `;
  const attendance = rows[0];
  if (!attendance) {
    payrollRedirect("attendance-not-found", "error", undefined, requestedMonthKey);
  }
  const monthKey = attendance.workDate.slice(0, 7);
  if (monthKey !== requestedMonthKey) {
    payrollRedirect("invalid-overtime", "error", undefined, requestedMonthKey);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${monthKey}`}))`;
      const lockedRuns = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public."PayrollRun"
        WHERE "monthKey" = ${monthKey} AND "status" = 'FINALIZED'
        LIMIT 1
      `;
      if (lockedRuns.length) throw new Error("PAYROLL_LOCKED");

      await tx.$executeRaw`
        INSERT INTO public."AttendanceOvertimeApproval" (
          "id", "attendanceId", "userId", "workDate", "calculatedMinutes",
          "approvedMinutes", "status", "decidedById", "decidedByName",
          "decidedAt", "decisionNote", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${attendanceId}, ${attendance.userId}, ${attendance.workDate},
          ${calculatedMinutes}, ${approvedMinutes}, ${decision}, ${currentUser.id},
          ${currentUser.name}, CURRENT_TIMESTAMP,
          ${cleanText(formData.get("decisionNote")) || null},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("attendanceId") DO UPDATE SET
          "calculatedMinutes" = EXCLUDED."calculatedMinutes",
          "approvedMinutes" = EXCLUDED."approvedMinutes", "status" = EXCLUDED."status",
          "decidedById" = EXCLUDED."decidedById", "decidedByName" = EXCLUDED."decidedByName",
          "decidedAt" = CURRENT_TIMESTAMP, "decisionNote" = EXCLUDED."decisionNote",
          "updatedAt" = CURRENT_TIMESTAMP
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYROLL_LOCKED") {
      payrollRedirect("payroll-locked", "error", undefined, monthKey);
    }
    throw error;
  }

  await createSecurityAuditLog({
    eventType:
      decision === "APPROVED"
        ? "ATTENDANCE_OVERTIME_APPROVED"
        : "ATTENDANCE_OVERTIME_REJECTED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `${decision === "APPROVED" ? "Approved" : "Rejected"} overtime for ${attendance.workDate}: ${approvedMinutes} minute(s).`,
  });
  revalidatePayrollPaths();
  payrollRedirect("overtime-decided", "success", undefined, monthKey);
}

export async function finalizePayrollAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );
  if (!hasAccess) payrollRedirect("permission-denied");

  const monthKey = cleanText(formData.get("monthKey"));
  if (!isValidMonthKey(monthKey)) payrollRedirect("invalid-month");

  await markStaleAttendanceForReview();

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${monthKey}`}))`;

        const existingRuns = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT "id", "status"
          FROM public."PayrollRun"
          WHERE "monthKey" = ${monthKey}
          LIMIT 1
          FOR UPDATE
        `;
        if (existingRuns[0]?.status === "FINALIZED") {
          throw new Error("PAYROLL_ALREADY_FINALIZED");
        }

        const payroll = await getPayrollSummary(monthKey, {
          db: tx,
          reconcile: false,
        });
        const reviewRows = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS "count" FROM public."OfficeAttendance"
          WHERE "workDate" LIKE ${`${monthKey}-%`} AND "status" = 'REVIEW_REQUIRED'
        `;
        if (Number(reviewRows[0]?.count ?? 0) > 0) {
          throw new Error("ATTENDANCE_REVIEW_REQUIRED");
        }

        const pendingCorrections = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS "count"
          FROM public."AttendanceCorrectionRequest"
          WHERE "workDate" LIKE ${`${monthKey}-%`}
            AND "status" = 'PENDING'::public."AttendanceRequestStatus"
        `;
        if (Number(pendingCorrections[0]?.count ?? 0) > 0) {
          throw new Error("PENDING_CORRECTIONS");
        }

        if (payroll.payrollRun?.status === "FINALIZED") {
          throw new Error("PAYROLL_ALREADY_FINALIZED");
        }
        if (
          payroll.leaves.some(
            (leave) =>
              leave.status === "PENDING" &&
              leave.startDate <= `${monthKey}-31` &&
              leave.endDate >= `${monthKey}-01`,
          )
        ) {
          throw new Error("PENDING_LEAVE_REQUESTS");
        }
        if (
          payroll.advances.some(
            (advance) =>
              advance.status === "PENDING" &&
              getMonthKey(new Date(advance.requestedAt)) === monthKey,
          )
        ) {
          throw new Error("PENDING_ADVANCE_REQUESTS");
        }
        if (payroll.overtimeCandidates.some((candidate) => candidate.status === "PENDING")) {
          throw new Error("PENDING_OVERTIME");
        }

        const runRows = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO public."PayrollRun" (
            "id", "monthKey", "status", "finalizedAt", "finalizedById",
            "finalizedByName", "createdAt", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${monthKey}, 'FINALIZED', CURRENT_TIMESTAMP,
            ${currentUser.id}, ${currentUser.name}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT ("monthKey") DO UPDATE SET
            "status" = 'FINALIZED',
            "finalizedAt" = CURRENT_TIMESTAMP,
            "finalizedById" = EXCLUDED."finalizedById",
            "finalizedByName" = EXCLUDED."finalizedByName",
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE public."PayrollRun"."status" <> 'FINALIZED'
          RETURNING "id"
        `;
        const savedRunId = runRows[0]?.id;
        if (!savedRunId) throw new Error("PAYROLL_ALREADY_FINALIZED");

        await tx.$executeRaw`
          DELETE FROM public."PayrollRunItem" WHERE "payrollRunId" = ${savedRunId}
        `;

        for (const row of payroll.summary) {
          await tx.$executeRaw`
            INSERT INTO public."PayrollRunItem" (
              "id", "payrollRunId", "userId", "userName", "userEmail", "userRole",
              "monthlyBaseSalary", "monthlyAllowance", "monthlyDeduction",
              "perDaySalary", "standardDailyMinutes", "overtimeHourlyRate", "fullDays", "halfDays", "paidLeaveDays",
              "paidSundayDays", "paidHolidayDays", "payableDays", "overtimeMinutes",
              "grossSalary", "overtimePay", "approvedAdvance", "netPay", "createdAt", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${savedRunId}, ${row.userId}, ${row.userName}, ${row.userEmail},
              ${row.userRole}, ${row.monthlyBaseSalary}, ${row.monthlyAllowance},
              ${row.monthlyDeduction}, ${row.perDaySalary}, ${row.standardDailyMinutes},
              ${row.overtimeHourlyRate}, ${row.fullDays}, ${row.halfDays},
              ${row.approvedPaidLeaveDays}, ${row.paidSundayDays}, ${row.paidHolidayDays},
              ${row.calendarPayDays}, ${row.overtimeMinutes}, ${row.grossSalary},
              ${row.overtimePay}, ${row.approvedAdvance}, ${row.netPay},
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `;
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "PAYROLL_ALREADY_FINALIZED") {
      payrollRedirect("payroll-already-finalized", "error", undefined, monthKey);
    }
    if (error instanceof Error && error.message === "ATTENDANCE_REVIEW_REQUIRED") {
      payrollRedirect("attendance-review-required", "error", undefined, monthKey);
    }
    if (error instanceof Error && error.message === "PENDING_CORRECTIONS") {
      payrollRedirect("pending-corrections", "error", undefined, monthKey);
    }
    if (error instanceof Error && error.message === "PENDING_LEAVE_REQUESTS") {
      payrollRedirect("pending-leave-requests", "error", undefined, monthKey);
    }
    if (error instanceof Error && error.message === "PENDING_ADVANCE_REQUESTS") {
      payrollRedirect("pending-advance-requests", "error", undefined, monthKey);
    }
    if (error instanceof Error && error.message === "PENDING_OVERTIME") {
      payrollRedirect("pending-overtime", "error", undefined, monthKey);
    }
    throw error;
  }

  await createSecurityAuditLog({
    eventType: "PAYROLL_FINALIZED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `Finalized and locked payroll for ${monthKey}.`,
  });
  revalidatePayrollPaths();
  payrollRedirect("payroll-finalized", "success", undefined, monthKey);
}

export async function decideAdvanceRequestAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );
  if (!hasAccess) payrollRedirect("permission-denied");

  const requestId = cleanText(formData.get("requestId"));
  const decision = cleanText(formData.get("decision"));
  const decisionNote = cleanText(formData.get("decisionNote")) || null;
  if (!requestId || !["APPROVED", "REJECTED"].includes(decision)) {
    payrollRedirect("invalid-advance-decision");
  }

  const rows = await prisma.$queryRaw<{
    id: string;
    userId: string;
    userName: string;
    amount: unknown;
    status: string;
    requestedAt: Date;
  }[]>`
    SELECT request."id", request."userId", u."name" AS "userName",
      request."amount", request."status"::text AS "status", request."requestedAt"
    FROM public."AttendanceAdvanceRequest" request
    INNER JOIN public."User" u ON u."id" = request."userId"
    WHERE request."id" = ${requestId}
    LIMIT 1
  `;
  const request = rows[0];
  if (!request) payrollRedirect("advance-request-not-found");
  if (request.status !== "PENDING") payrollRedirect("advance-already-decided");

  const monthKey = getMonthKey(new Date(request.requestedAt));
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${monthKey}`}))`;
      const lockedRequests = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status"
        FROM public."AttendanceAdvanceRequest"
        WHERE "id" = ${requestId}
        FOR UPDATE
      `;
      if (!lockedRequests[0]) throw new Error("ADVANCE_NOT_FOUND");
      if (lockedRequests[0].status !== "PENDING") {
        throw new Error("ADVANCE_ALREADY_DECIDED");
      }

      if (decision === "APPROVED") {
        const lockedRuns = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM public."PayrollRun"
          WHERE "monthKey" = ${monthKey} AND "status" = 'FINALIZED'
          LIMIT 1
        `;
        if (lockedRuns.length) throw new Error("PAYROLL_LOCKED");
      }

      await tx.$executeRaw`
        UPDATE public."AttendanceAdvanceRequest"
        SET "status" = ${decision}::public."AttendanceRequestStatus",
          "decidedById" = ${currentUser.id}, "decidedByName" = ${currentUser.name},
          "decidedAt" = CURRENT_TIMESTAMP, "decisionNote" = ${decisionNote},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${requestId}
          AND "status" = 'PENDING'::public."AttendanceRequestStatus"
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ADVANCE_NOT_FOUND") {
      payrollRedirect("advance-request-not-found");
    }
    if (error instanceof Error && error.message === "ADVANCE_ALREADY_DECIDED") {
      payrollRedirect("advance-already-decided");
    }
    if (error instanceof Error && error.message === "PAYROLL_LOCKED") {
      payrollRedirect("payroll-locked", "error", undefined, monthKey);
    }
    throw error;
  }

  await createWorkflowNotification({
    title: decision === "APPROVED" ? "Advance pay approved" : "Advance pay rejected",
    message:
      decision === "APPROVED"
        ? `Your advance pay request was approved by ${currentUser.name}.`
        : `Your advance pay request was rejected by ${currentUser.name}.`,
    module: "attendance",
    href: "/account/attendance/advance",
    actor: currentUser,
    recipientUserIds: [request.userId],
    priority: decision === "APPROVED" ? "NORMAL" : "HIGH",
  });
  await createSecurityAuditLog({
    eventType:
      decision === "APPROVED"
        ? "ATTENDANCE_ADVANCE_APPROVED"
        : "ATTENDANCE_ADVANCE_REJECTED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `${decision === "APPROVED" ? "Approved" : "Rejected"} advance pay request for ${request.userName}.`,
  });

  revalidatePayrollPaths();
  payrollRedirect(
    decision === "APPROVED" ? "advance-approved" : "advance-rejected",
    "success",
    undefined,
    monthKey,
  );
}

export async function decideLeaveRequestAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );

  if (!hasAccess) {
    payrollRedirect("permission-denied");
  }

  const requestId = cleanText(formData.get("requestId"));
  const decision = cleanText(formData.get("decision"));
  const decisionNote = cleanText(formData.get("decisionNote")) || null;

  if (!requestId || (decision !== "APPROVED" && decision !== "REJECTED")) {
    payrollRedirect("invalid-leave-decision");
  }

  const rows = await prisma.$queryRaw<{
    id: string;
    userId: string;
    userName: string;
    startDate: string;
    endDate: string;
    status: string;
  }[]>`
    SELECT
      request."id",
      request."userId",
      u."name" AS "userName",
      request."startDate",
      request."endDate",
      request."status"::text AS "status"
    FROM public."AttendanceLeaveRequest" request
    INNER JOIN public."User" u ON u."id" = request."userId"
    WHERE request."id" = ${requestId}
    LIMIT 1
  `;

  const request = rows[0];

  if (!request) {
    payrollRedirect("leave-request-not-found");
  }

  if (request.status !== "PENDING") {
    payrollRedirect("leave-already-decided");
  }

  const affectedMonths = new Set<string>();
  for (
    let cursor = new Date(`${request.startDate.slice(0, 7)}-01T00:00:00Z`);
    cursor <= new Date(`${request.endDate.slice(0, 7)}-01T00:00:00Z`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    affectedMonths.add(cursor.toISOString().slice(0, 7));
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const monthKey of [...affectedMonths].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payroll:${monthKey}`}))`;
      }

      const lockedRequests = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status"
        FROM public."AttendanceLeaveRequest"
        WHERE "id" = ${requestId}
        FOR UPDATE
      `;
      if (!lockedRequests[0]) throw new Error("LEAVE_NOT_FOUND");
      if (lockedRequests[0].status !== "PENDING") {
        throw new Error("LEAVE_ALREADY_DECIDED");
      }

      if (decision === "APPROVED") {
        const finalizedRuns = await tx.$queryRaw<{ monthKey: string }[]>`
          SELECT "monthKey"
          FROM public."PayrollRun"
          WHERE "monthKey" = ANY(${[...affectedMonths]}::text[])
            AND "status" = 'FINALIZED'
          LIMIT 1
        `;
        if (finalizedRuns.length) throw new Error("PAYROLL_LOCKED");
      }

      await tx.$executeRaw`
        UPDATE public."AttendanceLeaveRequest"
        SET
          "status" = ${decision}::public."AttendanceRequestStatus",
          "decidedById" = ${currentUser.id},
          "decidedByName" = ${currentUser.name},
          "decidedAt" = CURRENT_TIMESTAMP,
          "decisionNote" = ${decisionNote},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${requestId}
          AND "status" = 'PENDING'::public."AttendanceRequestStatus"
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LEAVE_NOT_FOUND") {
      payrollRedirect("leave-request-not-found");
    }
    if (error instanceof Error && error.message === "LEAVE_ALREADY_DECIDED") {
      payrollRedirect("leave-already-decided");
    }
    if (error instanceof Error && error.message === "PAYROLL_LOCKED") {
      payrollRedirect("payroll-locked");
    }
    throw error;
  }

  await createWorkflowNotification({
    title: decision === "APPROVED" ? "Leave approved" : "Leave rejected",
    message:
      decision === "APPROVED"
        ? `Your leave request was approved by ${currentUser.name}.`
        : `Your leave request was rejected by ${currentUser.name}.`,
    module: "attendance",
    href: "/account/attendance/leave",
    actor: currentUser,
    recipientUserIds: [request.userId],
    priority: decision === "APPROVED" ? "NORMAL" : "HIGH",
  });

  await createSecurityAuditLog({
    eventType: decision === "APPROVED" ? "ATTENDANCE_LEAVE_APPROVED" : "ATTENDANCE_LEAVE_REJECTED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `${decision === "APPROVED" ? "Approved" : "Rejected"} leave request for ${request.userName} from ${request.startDate} to ${request.endDate}.`,
  });

  revalidatePayrollPaths();
  payrollRedirect(decision === "APPROVED" ? "leave-approved" : "leave-rejected", "success");
}


export async function updatePayrollPaymentAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );
  if (!hasAccess) payrollRedirect("permission-denied");

  const payrollItemId = cleanText(formData.get("payrollItemId"));
  const monthKey = cleanText(formData.get("monthKey"));
  const paymentStatus = cleanText(formData.get("paymentStatus"));
  const paymentReference = cleanText(formData.get("paymentReference")) || null;
  const paymentNote = cleanText(formData.get("paymentNote")) || null;
  const allowedStatuses = ["PENDING", "PROCESSING", "PAID", "ON_HOLD", "FAILED"];

  if (!payrollItemId || !isValidMonthKey(monthKey) || !allowedStatuses.includes(paymentStatus)) {
    payrollRedirect("invalid-payment-update", "error", undefined, monthKey);
  }

  const rows = await prisma.$queryRaw<{
    id: string;
    userId: string;
    userName: string;
    netPay: unknown;
  }[]>`
    SELECT item."id", item."userId", item."userName", item."netPay"
    FROM public."PayrollRunItem" item
    INNER JOIN public."PayrollRun" run ON run."id" = item."payrollRunId"
    WHERE item."id" = ${payrollItemId}
      AND run."monthKey" = ${monthKey}
      AND run."status" = 'FINALIZED'
    LIMIT 1
  `;
  const item = rows[0];
  if (!item) payrollRedirect("payroll-item-not-found", "error", undefined, monthKey);

  await prisma.$executeRaw`
    UPDATE public."PayrollRunItem"
    SET
      "paymentStatus" = ${paymentStatus}::public."PayrollPaymentStatus",
      "paidAt" = CASE WHEN ${paymentStatus} = 'PAID' THEN CURRENT_TIMESTAMP ELSE NULL END,
      "paidById" = CASE WHEN ${paymentStatus} = 'PAID' THEN ${currentUser.id} ELSE NULL END,
      "paidByName" = CASE WHEN ${paymentStatus} = 'PAID' THEN ${currentUser.name} ELSE NULL END,
      "paymentReference" = ${paymentReference},
      "paymentNote" = ${paymentNote},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${payrollItemId}
  `;

  await createWorkflowNotification({
    title: paymentStatus === "PAID" ? "Salary payment recorded" : "Salary payment status updated",
    message:
      paymentStatus === "PAID"
        ? `Your ${monthKey} salary has been marked paid.`
        : `Your ${monthKey} salary payment status is now ${paymentStatus.replaceAll("_", " ").toLowerCase()}.`,
    module: "payroll",
    href: "/account/attendance/payslips",
    actor: currentUser,
    recipientUserIds: [item.userId],
    priority: paymentStatus === "FAILED" || paymentStatus === "ON_HOLD" ? "HIGH" : "NORMAL",
  });

  await createSecurityAuditLog({
    eventType: "PAYROLL_PAYMENT_UPDATED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `Updated ${item.userName}'s ${monthKey} payroll payment to ${paymentStatus}${paymentReference ? ` (${paymentReference})` : ""}.`,
  });
  revalidatePayrollPaths();
  payrollRedirect("payment-updated", "success", undefined, monthKey);
}

export async function markAllPayrollPaidAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_payroll",
    "/internal/attendance/payroll",
  );
  if (!hasAccess) payrollRedirect("permission-denied");

  const monthKey = cleanText(formData.get("monthKey"));
  const paymentReference = cleanText(formData.get("paymentReference")) || null;
  if (!isValidMonthKey(monthKey)) payrollRedirect("invalid-payment-update");

  const rows = await prisma.$queryRaw<{ id: string; userId: string; userName: string }[]>`
    SELECT item."id", item."userId", item."userName"
    FROM public."PayrollRunItem" item
    INNER JOIN public."PayrollRun" run ON run."id" = item."payrollRunId"
    WHERE run."monthKey" = ${monthKey}
      AND run."status" = 'FINALIZED'
      AND item."paymentStatus" <> 'PAID'::public."PayrollPaymentStatus"
  `;
  if (rows.length === 0) payrollRedirect("no-pending-payments", "error", undefined, monthKey);

  await prisma.$executeRaw`
    UPDATE public."PayrollRunItem" item
    SET
      "paymentStatus" = 'PAID'::public."PayrollPaymentStatus",
      "paidAt" = CURRENT_TIMESTAMP,
      "paidById" = ${currentUser.id},
      "paidByName" = ${currentUser.name},
      "paymentReference" = COALESCE(${paymentReference}, item."paymentReference"),
      "updatedAt" = CURRENT_TIMESTAMP
    FROM public."PayrollRun" run
    WHERE run."id" = item."payrollRunId"
      AND run."monthKey" = ${monthKey}
      AND run."status" = 'FINALIZED'
      AND item."paymentStatus" <> 'PAID'::public."PayrollPaymentStatus"
  `;

  await Promise.all(
    rows.map((item) =>
      createWorkflowNotification({
        title: "Salary payment recorded",
        message: `Your ${monthKey} salary has been marked paid.`,
        module: "payroll",
        href: "/account/attendance/payslips",
        actor: currentUser,
        recipientUserIds: [item.userId],
        priority: "NORMAL",
      }),
    ),
  );
  await createSecurityAuditLog({
    eventType: "PAYROLL_PAYMENT_UPDATED",
    user: currentUser,
    path: "/internal/attendance/payroll",
    description: `Marked ${rows.length} payroll payment(s) paid for ${monthKey}${paymentReference ? ` with reference ${paymentReference}` : ""}.`,
  });
  revalidatePayrollPaths();
  payrollRedirect("all-payments-paid", "success", undefined, monthKey);
}
