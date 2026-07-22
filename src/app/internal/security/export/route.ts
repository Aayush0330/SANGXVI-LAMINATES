import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getAppRolesFromUser } from "@/lib/user-role-utils";

type SecurityAuditLogRow = { id: string; eventType: string; userId: string | null; userName: string | null; userEmail: string | null; userRole: string | null; path: string | null; ipAddress: string | null; userAgent: string | null; description: string | null; createdAt: Date | string; };

function parseSqliteUtcDate(value: Date | string) { if (value instanceof Date) return value; const normalizedValue = value.includes("T") ? value : value.replace(" ", "T"); const utcValue = normalizedValue.endsWith("Z") ? normalizedValue : `${normalizedValue}Z`; return new Date(utcValue); }
function formatDateTime(date: Date | string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(parseSqliteUtcDate(date)); }
function getEventLabel(eventType: string) { if (eventType === "LOGIN_SUCCESS") return "Login Success"; if (eventType === "LOGIN_FAILED") return "Login Failed"; if (eventType === "LOGOUT") return "Logout"; if (eventType === "ACCESS_DENIED") return "Access Denied"; if (eventType === "PASSWORD_RESET") return "Password Reset"; if (eventType === "PASSWORD_CHANGED") return "Password Changed"; if (eventType === "FIRST_OWNER_CREATED") return "First Owner Created"; if (eventType === "OFFICE_LOCATION_UPDATED") return "Office Location Updated"; if (eventType === "ATTENDANCE_PUNCH") return "Attendance Punch"; if (eventType === "ATTENDANCE_BREAK") return "Attendance Break"; if (eventType === "ATTENDANCE_BLOCKED") return "Attendance Blocked"; if (eventType === "TRANSPORT_OPTION_CREATED") return "Transport Created"; if (eventType === "TRANSPORT_OPTION_UPDATED") return "Transport Updated"; if (eventType === "TRANSPORT_OPTION_DISABLED") return "Transport Disabled"; if (eventType === "TRANSPORT_ASSIGNED") return "Transport Assigned"; if (eventType === "DELIVERY_PROOF_UPLOADED") return "Delivery Proof Uploaded"; if (eventType === "ORDER_RECEIVED") return "Order Received"; if (eventType === "ORDER_RECEIVING_UPDATED") return "Order Receiving Updated"; if (eventType === "INVENTORY_INQUIRY_CREATED") return "Inquiry Created"; if (eventType === "INVENTORY_INQUIRY_UPDATED") return "Inquiry Updated"; if (eventType === "WORK_TEAM_CREATED") return "Team Created"; if (eventType === "WORK_TEAM_UPDATED") return "Team Updated"; if (eventType === "WORK_TEAM_MEMBER_UPDATED") return "Team Member Updated"; if (eventType === "WORK_TASK_CREATED") return "Task Created"; if (eventType === "WORK_TASK_UPDATED") return "Task Updated"; if (eventType === "WORK_TASK_COMMENTED") return "Task Commented"; if (eventType === "WORK_TASK_STATUS_CHANGED") return "Task Status Changed"; if (eventType === "FIELD_VISIT_CREATED") return "Field Visit Created"; if (eventType === "FIELD_VISIT_UPDATED") return "Field Visit Updated"; if (eventType === "COLLECTION_CREATED") return "Collection Created"; if (eventType === "COLLECTION_UPDATED") return "Collection Updated"; if (eventType === "COLLECTION_STATUS_CHANGED") return "Collection Status Changed"; if (eventType === "COLLECTION_PROOF_UPLOADED") return "Collection Proof Uploaded"; if (eventType === "COLLECTION_VERIFIED") return "Collection Verified"; return eventType; }
function matchesSearch(log: SecurityAuditLogRow, query: string) { if (!query) return true; const haystack = [log.eventType, getEventLabel(log.eventType), log.userName, log.userEmail, log.userRole, log.path, log.ipAddress, log.description, log.userAgent].filter(Boolean).join(" ").toLowerCase(); return haystack.includes(query.toLowerCase()); }
function csvEscape(value: string | number | null | undefined) { const text = value === null || value === undefined ? "" : String(value); return `"${text.replaceAll('"', '""')}"`; }

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const appRoles = getAppRolesFromUser(session.user);
  if (!hasPermission(appRoles, "view_security_logs")) return new NextResponse("Forbidden", { status: 403 });

  const eventType = request.nextUrl.searchParams.get("eventType") || "ALL";
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  const logs = await prisma.$queryRaw<SecurityAuditLogRow[]>`
    SELECT
      "id",
      "eventType"::text AS "eventType",
      "userId",
      "userName",
      "userEmail",
      "userRole",
      "path",
      "ipAddress",
      "userAgent",
      "description",
      "createdAt"
    FROM public."SecurityAuditLog"
    ORDER BY "createdAt" DESC
    LIMIT 500
  `;
  const filteredLogs = logs.filter((log) => (eventType === "ALL" || log.eventType === eventType) && matchesSearch(log, query));
  const rows = [["Time (IST)", "Event", "User Name", "User Email", "User Role", "Path", "IP Address", "User Agent", "Details"], ...filteredLogs.map((log) => [formatDateTime(log.createdAt), getEventLabel(log.eventType), log.userName || "Unknown", log.userEmail || "", log.userRole || "", log.path || "", log.ipAddress || "", log.userAgent || "", log.description || ""]),];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="security-audit-logs.csv"' } });
}
