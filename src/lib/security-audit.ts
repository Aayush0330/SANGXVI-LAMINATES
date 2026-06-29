import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { prisma } from "./db";

export type SecurityAuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "ACCESS_DENIED"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGED"
  | "FIRST_OWNER_CREATED";

type AuditUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

function getFirstHeaderValue(value: string | null) {
  if (!value) {
    return null;
  }

  return value.split(",")[0]?.trim() || null;
}

export async function createSecurityAuditLog({
  eventType,
  user,
  userEmail,
  path,
  description,
}: {
  eventType: SecurityAuditEventType;
  user?: AuditUser | null;
  userEmail?: string | null;
  path?: string | null;
  description?: string | null;
}) {
  try {
    const headerStore = await headers();

    const ipAddress =
      getFirstHeaderValue(headerStore.get("x-forwarded-for")) ||
      getFirstHeaderValue(headerStore.get("x-real-ip")) ||
      null;

    const userAgent = headerStore.get("user-agent") || null;

    await prisma.$executeRaw`
      INSERT INTO "SecurityAuditLog" (
        "id",
        "eventType",
        "userId",
        "userName",
        "userEmail",
        "userRole",
        "path",
        "ipAddress",
        "userAgent",
        "description",
        "createdAt"
      )
      VALUES (
        ${randomUUID()},
        ${eventType}::"SecurityEventType",
        ${user?.id ?? null},
        ${user?.name ?? null},
        ${user?.email ?? userEmail ?? null},
        ${user?.role ? String(user.role) : null},
        ${path ?? null},
        ${ipAddress},
        ${userAgent},
        ${description ?? null},
        CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error("Security audit log failed:", error);
  }
}
