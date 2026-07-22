import { prisma } from "./db";
import { getIndiaWorkDate } from "./office-attendance";
import { createSecurityAuditLog } from "./security-audit";

type StaleAttendanceRow = {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
};

export async function markStaleAttendanceForReview() {
  const today = getIndiaWorkDate();
  const rows = await prisma.$queryRaw<StaleAttendanceRow[]>`
    UPDATE public."OfficeAttendance" attendance
    SET
      "status" = 'REVIEW_REQUIRED',
      "currentBreakType" = NULL,
      "currentBreakStartedAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM public."User" employee
    WHERE employee."id" = attendance."userId"
      AND attendance."workDate" < ${today}
      AND attendance."punchInAt" IS NOT NULL
      AND attendance."punchOutAt" IS NULL
      AND attendance."status" <> 'REVIEW_REQUIRED'
    RETURNING
      attendance."id",
      attendance."userId",
      employee."name" AS "userName",
      attendance."workDate"
  `;

  for (const row of rows) {
    await createSecurityAuditLog({
      eventType: "ATTENDANCE_STALE_REVIEW",
      userEmail: null,
      path: "/api/cron/attendance-close",
      description: `${row.userName}'s attendance for ${row.workDate} was left open and moved to manager review.`,
    });
  }

  return { reviewed: rows.length };
}
