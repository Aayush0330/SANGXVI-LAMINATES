"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

function parseIndiaDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null;
  const date = new Date(`${text}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function correctAttendanceAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_attendance",
    "/internal/attendance",
  );
  if (!hasAccess) redirect("/internal/attendance?error=permission-denied");

  const attendanceId = String(formData.get("attendanceId") ?? "").trim();
  const selectedDate = String(formData.get("selectedDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const correctedPunchIn = parseIndiaDateTime(formData.get("correctedPunchIn"));
  const correctedPunchOut = parseIndiaDateTime(formData.get("correctedPunchOut"));

  if (!attendanceId || !reason || !correctedPunchIn || !correctedPunchOut || correctedPunchOut <= correctedPunchIn) {
    redirect(`/internal/attendance?date=${encodeURIComponent(selectedDate)}&error=invalid-correction`);
  }

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    userId: string;
    userName: string;
    workDate: string;
    punchInAt: Date | null;
    punchOutAt: Date | null;
    breakMinutes: number;
    netWorkingMinutes: number | null;
  }>>`
    SELECT attendance."id", attendance."userId", employee."name" AS "userName",
      attendance."workDate", attendance."punchInAt", attendance."punchOutAt",
      attendance."breakMinutes", attendance."netWorkingMinutes"
    FROM public."OfficeAttendance" attendance
    INNER JOIN public."User" employee ON employee."id" = attendance."userId"
    WHERE attendance."id" = ${attendanceId}
    LIMIT 1
  `;
  const attendance = rows[0];
  if (!attendance) redirect(`/internal/attendance?date=${encodeURIComponent(selectedDate)}&error=attendance-not-found`);

  const totalMinutes = Math.max(0, Math.floor((correctedPunchOut.getTime() - correctedPunchIn.getTime()) / 60000));
  const correctedNetMinutes = Math.max(0, totalMinutes - Number(attendance.breakMinutes ?? 0));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE public."OfficeAttendance"
      SET "punchInAt" = ${correctedPunchIn}, "punchOutAt" = ${correctedPunchOut},
        "totalMinutes" = ${totalMinutes}, "netWorkingMinutes" = ${correctedNetMinutes},
        "status" = 'COMPLETED', "currentBreakType" = NULL,
        "currentBreakStartedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${attendanceId}
    `;
    await tx.$executeRaw`
      INSERT INTO public."AttendanceCorrection" (
        "id", "attendanceId", "userId", "previousPunchIn", "previousPunchOut",
        "correctedPunchIn", "correctedPunchOut", "previousNetMinutes",
        "correctedNetMinutes", "reason", "correctedById", "correctedByName", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${attendanceId}, ${attendance.userId}, ${attendance.punchInAt},
        ${attendance.punchOutAt}, ${correctedPunchIn}, ${correctedPunchOut},
        ${attendance.netWorkingMinutes}, ${correctedNetMinutes}, ${reason},
        ${currentUser.id}, ${currentUser.name}, CURRENT_TIMESTAMP
      )
    `;
    await tx.$executeRaw`
      INSERT INTO public."OfficeAttendanceEvent" (
        "id", "attendanceId", "userId", "eventType", "label",
        "insideGeofence", "note", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${attendanceId}, ${attendance.userId}, 'MANUAL_CORRECTION',
        'Attendance corrected by manager', false, ${reason}, CURRENT_TIMESTAMP
      )
    `;
    await tx.$executeRaw`
      DELETE FROM public."AttendanceOvertimeApproval" WHERE "attendanceId" = ${attendanceId}
    `;
  });

  await createSecurityAuditLog({
    eventType: "ATTENDANCE_CORRECTED",
    user: currentUser,
    path: "/internal/attendance",
    description: `Corrected ${attendance.userName}'s attendance for ${attendance.workDate}. Reason: ${reason}`,
  });
  revalidatePath("/internal/attendance");
  revalidatePath("/internal/attendance/payroll");
  redirect(`/internal/attendance?date=${encodeURIComponent(attendance.workDate)}&success=attendance-corrected`);
}
