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
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_STATUS_CHANGED"
  | "USER_ROLE_CHANGED"
  | "DEALER_MEMBER_CREATED"
  | "DEALER_MEMBER_UPDATED"
  | "DEALER_MEMBER_DELETED"
  | "DEALER_PROFILE_CREATED"
  | "DEALER_PROFILE_UPDATED"
  | "DEALER_ARCHIVED"
  | "DEALER_REACTIVATED"
  | "INTERNAL_DEALER_ORDER_CREATED"
  | "FIRST_OWNER_CREATED"
  | "OFFICE_LOCATION_UPDATED"
  | "ATTENDANCE_PUNCH"
  | "ATTENDANCE_BREAK"
  | "ATTENDANCE_BLOCKED"
  | "ATTENDANCE_PAY_PROFILE_UPDATED"
  | "ATTENDANCE_ADVANCE_REQUESTED"
  | "ATTENDANCE_ADVANCE_APPROVED"
  | "ATTENDANCE_ADVANCE_REJECTED"
  | "ATTENDANCE_LEAVE_REQUESTED"
  | "ATTENDANCE_OWNER_UNAVAILABLE_RECORDED"
  | "ATTENDANCE_LEAVE_APPROVED"
  | "ATTENDANCE_LEAVE_REJECTED"
  | "ATTENDANCE_CORRECTED"
  | "ATTENDANCE_STALE_REVIEW"
  | "ATTENDANCE_OVERTIME_APPROVED"
  | "ATTENDANCE_OVERTIME_REJECTED"
  | "ATTENDANCE_HOLIDAY_UPDATED"
  | "PAYROLL_FINALIZED"
  | "PAYROLL_PAYMENT_UPDATED"
  | "EMPLOYEE_PROFILE_UPDATED"
  | "EMPLOYEE_LIFECYCLE_RECORDED"
  | "ATTENDANCE_CORRECTION_REQUESTED"
  | "ATTENDANCE_CORRECTION_APPROVED"
  | "ATTENDANCE_CORRECTION_REJECTED"
  | "TRANSPORT_OPTION_CREATED"
  | "TRANSPORT_OPTION_UPDATED"
  | "TRANSPORT_OPTION_DISABLED"
  | "TRANSPORT_ASSIGNED"
  | "DELIVERY_PROOF_UPLOADED"
  | "DELIVERY_PROOF_ASSISTANCE_REQUESTED"
  | "DELIVERY_PROOF_ASSISTANCE_CANCELLED"
  | "DELIVERY_PROOF_ASSISTANCE_COMPLETED"
  | "DELIVERY_PROOF_REPLACED"
  | "ORDER_RECEIVED"
  | "ORDER_RECEIVING_UPDATED"
  | "PHYSICAL_TEAM_ASSIGNED"
  | "PHYSICAL_CHECK_STARTED"
  | "PHYSICAL_CHECK_COMPLETED"
  | "PHYSICAL_CHECK_ISSUE_REPORTED"
  | "QC_REWORK_REQUESTED"
  | "QC_REWORK_COMPLETED"
  | "QC_APPROVED"
  | "INVENTORY_INQUIRY_CREATED"
  | "INVENTORY_INQUIRY_UPDATED"
  | "WORK_TEAM_CREATED"
  | "WORK_TEAM_UPDATED"
  | "WORK_TEAM_MEMBER_UPDATED"
  | "WORK_TASK_CREATED"
  | "WORK_TASK_UPDATED"
  | "WORK_TASK_COMMENTED"
  | "WORK_TASK_STATUS_CHANGED"
  | "WORK_TASK_REMINDER_SWEEP"
  | "FIELD_VISIT_CREATED"
  | "FIELD_VISIT_UPDATED"
  | "COLLECTION_CREATED"
  | "COLLECTION_UPDATED"
  | "COLLECTION_STATUS_CHANGED"
  | "COLLECTION_PROOF_UPLOADED"
  | "COLLECTION_VERIFIED"
  | "ALERT_ACKNOWLEDGED"
  | "ALERT_RESOLVED"
  | "DAILY_ARCHIVE_GENERATED"
  | "SUPPLIER_CREATED"
  | "SUPPLIER_UPDATED"
  | "SUPPLIER_ARCHIVED"
  | "SUPPLIER_REACTIVATED"
  | "PRODUCT_SUPPLIER_UPDATED"
  | "PURCHASE_REQUEST_CREATED"
  | "PURCHASE_REQUEST_SUBMITTED"
  | "PURCHASE_REQUEST_APPROVED"
  | "PURCHASE_REQUEST_REJECTED"
  | "PURCHASE_REQUEST_ORDERED"
  | "PURCHASE_REQUEST_IN_TRANSIT"
  | "PURCHASE_REQUEST_CANCELLED"
  | "PURCHASE_STOCK_RECEIVED";

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
      INSERT INTO public."SecurityAuditLog" (
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
        ${eventType}::public."SecurityEventType",
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
