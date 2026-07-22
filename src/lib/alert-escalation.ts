import { randomUUID } from "node:crypto";
import { prisma } from "./db";

export async function runAlertEscalationSweep() {
  const expired = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE public."Notification"
    SET "status" = 'EXPIRED'
    WHERE "status" IN ('OPEN', 'ACKNOWLEDGED')
      AND "expiresAt" IS NOT NULL
      AND "expiresAt" <= CURRENT_TIMESTAMP
    RETURNING "id"
  `;

  const escalated = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE public."Notification"
    SET
      "priority" = 'CRITICAL',
      "escalatedAt" = CURRENT_TIMESTAMP
    WHERE "status" IN ('OPEN', 'ACKNOWLEDGED')
      AND "escalatedAt" IS NULL
      AND (
        ("priority" = 'BLOCKER' AND "createdAt" <= CURRENT_TIMESTAMP - INTERVAL '2 hours')
        OR
        ("priority" = 'HIGH_ALERT' AND "createdAt" <= CURRENT_TIMESTAMP - INTERVAL '8 hours')
      )
    RETURNING "id"
  `;

  if (escalated.length > 0) {
    const managers = await prisma.$queryRaw<{ id: string; role: string }[]>`
      SELECT DISTINCT u."id", u."role"::text AS "role"
      FROM public."User" u
      WHERE u."status" = 'ACTIVE'::public."UserStatus"
        AND (
          u."role" IN ('OWNER', 'MANAGER')
          OR EXISTS (
            SELECT 1
            FROM public."UserRoleAssignment" ura
            WHERE ura."userId" = u."id"
              AND ura."role" IN ('OWNER', 'MANAGER')
          )
        )
    `;

    for (const alert of escalated) {
      for (const manager of managers) {
        await prisma.$executeRaw`
          INSERT INTO public."NotificationRecipient" (
            "id",
            "notificationId",
            "userId",
            "roleSnapshot",
            "createdAt"
          )
          VALUES (
            ${randomUUID()},
            ${alert.id},
            ${manager.id},
            ${manager.role}::public."UserRole",
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("notificationId", "userId") DO NOTHING
        `;
      }
    }
  }

  return {
    expired: expired.length,
    escalated: escalated.length,
  };
}
