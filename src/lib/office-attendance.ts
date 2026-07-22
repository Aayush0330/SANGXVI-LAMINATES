import { prisma } from "./db";
import type { UserRole } from "./permissions";
export { calculateDistanceMeters } from "./geolocation";

export type AttendanceActionType =
  | "PUNCH_IN"
  | "LUNCH_START"
  | "LUNCH_END"
  | "TEA_START"
  | "TEA_END"
  | "SMALL_BREAK_START"
  | "SMALL_BREAK_END"
  | "PUNCH_OUT";

export type BreakType = "LUNCH" | "TEA" | "SMALL_BREAK";

export type OfficeLocationRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  isActive: boolean;
  updatedAt: Date | string;
  updatedByName: string | null;
};

export type OfficeAttendanceRow = {
  id: string;
  userId: string;
  workDate: string;
  status: string;
  punchInAt: Date | string | null;
  punchInLatitude: number | null;
  punchInLongitude: number | null;
  punchInAccuracyMeters: number | null;
  punchInDistanceMeters: number | null;
  punchInInsideGeofence: boolean | null;
  punchInPhotoDataUrl: string | null;
  punchOutAt: Date | string | null;
  punchOutLatitude: number | null;
  punchOutLongitude: number | null;
  punchOutAccuracyMeters: number | null;
  punchOutDistanceMeters: number | null;
  punchOutInsideGeofence: boolean | null;
  punchOutPhotoDataUrl: string | null;
  currentBreakType: string | null;
  currentBreakStartedAt: Date | string | null;
  breakMinutes: number | null;
  totalMinutes: number | null;
  netWorkingMinutes: number | null;
};

export type OfficeAttendanceEventRow = {
  id: string;
  attendanceId: string;
  userId: string;
  eventType: AttendanceActionType | string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  insideGeofence: boolean | null;
  photoDataUrl: string | null;
  note: string | null;
  createdAt: Date | string;
};

export type EmployeeAttendanceRow = OfficeAttendanceRow & {
  userName: string;
  userEmail: string;
  userRole: string;
  userPhone: string | null;
  attendanceId: string | null;
};

export type AttendanceAttemptRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  actionType: string;
  status: string;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  insideGeofence: boolean | null;
  attemptedAt: Date | string;
};

const employeeRoles: UserRole[] = [
  "owner",
  "manager",
  "accountant",
  "dispatch_team",
  "order_team",
  "qc_team",
  "driver_transport",
  "collection_team",
  "sales_field_team",
];

export function canUseOfficeAttendance(role: UserRole) {
  return employeeRoles.includes(role);
}

export function getIndiaWorkDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function parseDatabaseDate(value: Date | string) {
  if (value instanceof Date) return value;
  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const utcValue = normalizedValue.endsWith("Z") ? normalizedValue : `${normalizedValue}Z`;
  return new Date(utcValue);
}

export function formatIndiaDateTime(value?: Date | string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parseDatabaseDate(value));
}

export function formatIndiaTime(value?: Date | string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parseDatabaseDate(value));
}

export function formatDuration(totalMinutes?: number | null) {
  if (totalMinutes === null || totalMinutes === undefined) return "-";

  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function getAttendanceActionLabel(actionType: string) {
  if (actionType === "PUNCH_IN") return "Punch In";
  if (actionType === "PUNCH_OUT") return "Logging Out / Punch Out";
  if (actionType === "LUNCH_START") return "Lunch Break Start";
  if (actionType === "LUNCH_END") return "Lunch Break End";
  if (actionType === "TEA_START") return "Tea Break Start";
  if (actionType === "TEA_END") return "Tea Break End";
  if (actionType === "SMALL_BREAK_START") return "Small Break Start";
  if (actionType === "SMALL_BREAK_END") return "Small Break End";
  return actionType.replaceAll("_", " ");
}

export function getBreakTypeLabel(breakType?: string | null) {
  if (breakType === "LUNCH") return "Lunch Break";
  if (breakType === "TEA") return "Tea Break";
  if (breakType === "SMALL_BREAK") return "Small Break";
  return "Break";
}

export function isBreakStartAction(actionType: AttendanceActionType) {
  return actionType === "LUNCH_START" || actionType === "TEA_START" || actionType === "SMALL_BREAK_START";
}

export function isBreakEndAction(actionType: AttendanceActionType) {
  return actionType === "LUNCH_END" || actionType === "TEA_END" || actionType === "SMALL_BREAK_END";
}

export function getBreakTypeFromAction(actionType: AttendanceActionType): BreakType | null {
  if (actionType === "LUNCH_START" || actionType === "LUNCH_END") return "LUNCH";
  if (actionType === "TEA_START" || actionType === "TEA_END") return "TEA";
  if (actionType === "SMALL_BREAK_START" || actionType === "SMALL_BREAK_END") return "SMALL_BREAK";
  return null;
}

export function getBreakStatusFromType(breakType: BreakType) {
  if (breakType === "LUNCH") return "ON_LUNCH_BREAK";
  if (breakType === "TEA") return "ON_TEA_BREAK";
  return "ON_SMALL_BREAK";
}

export function getAllowedAttendanceActions(attendance?: OfficeAttendanceRow | null) {
  if (!attendance?.punchInAt) {
    return [{ actionType: "PUNCH_IN" as AttendanceActionType, label: "Punch In", tone: "primary" as const }];
  }

  if (attendance.punchOutAt || attendance.status === "COMPLETED") {
    return [];
  }

  if (attendance.currentBreakType) {
    const breakType = attendance.currentBreakType;

    if (breakType === "LUNCH") {
      return [{ actionType: "LUNCH_END" as AttendanceActionType, label: "End Lunch Break", tone: "primary" as const }];
    }

    if (breakType === "TEA") {
      return [{ actionType: "TEA_END" as AttendanceActionType, label: "End Tea Break", tone: "primary" as const }];
    }

    return [{ actionType: "SMALL_BREAK_END" as AttendanceActionType, label: "End Small Break", tone: "primary" as const }];
  }

  return [
    { actionType: "LUNCH_START" as AttendanceActionType, label: "Start Lunch Break", tone: "warning" as const },
    { actionType: "TEA_START" as AttendanceActionType, label: "Start Tea Break", tone: "warning" as const },
    { actionType: "SMALL_BREAK_START" as AttendanceActionType, label: "Start Small Break", tone: "warning" as const },
    { actionType: "PUNCH_OUT" as AttendanceActionType, label: "Logging Out / Punch Out", tone: "danger" as const },
  ];
}

export async function getActiveOfficeLocation() {
  const rows = await prisma.$queryRaw<OfficeLocationRow[]>`
    SELECT
      "id",
      "name",
      "address",
      "latitude",
      "longitude",
      "radiusMeters",
      "isActive",
      "updatedAt",
      "updatedByName"
    FROM public."OfficeLocation"
    WHERE "isActive" = true
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getTodayAttendanceForUser(userId: string) {
  const workDate = getIndiaWorkDate();

  const rows = await prisma.$queryRaw<OfficeAttendanceRow[]>`
    SELECT
      "id",
      "userId",
      "workDate",
      "status",
      "punchInAt",
      "punchInLatitude",
      "punchInLongitude",
      "punchInAccuracyMeters",
      "punchInDistanceMeters",
      "punchInInsideGeofence",
      "punchInPhotoDataUrl",
      "punchOutAt",
      "punchOutLatitude",
      "punchOutLongitude",
      "punchOutAccuracyMeters",
      "punchOutDistanceMeters",
      "punchOutInsideGeofence",
      "punchOutPhotoDataUrl",
      "currentBreakType",
      "currentBreakStartedAt",
      "breakMinutes",
      "totalMinutes",
      "netWorkingMinutes"
    FROM public."OfficeAttendance"
    WHERE "userId" = ${userId}
      AND "workDate" = ${workDate}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getTodayAttendanceEventsForUser(userId: string) {
  const workDate = getIndiaWorkDate();

  return prisma.$queryRaw<OfficeAttendanceEventRow[]>`
    SELECT
      e."id",
      e."attendanceId",
      e."userId",
      e."eventType",
      e."label",
      e."latitude",
      e."longitude",
      e."accuracyMeters",
      e."distanceMeters",
      e."insideGeofence",
      e."photoDataUrl",
      e."note",
      e."createdAt"
    FROM public."OfficeAttendanceEvent" e
    INNER JOIN public."OfficeAttendance" a ON a."id" = e."attendanceId"
    WHERE e."userId" = ${userId}
      AND a."workDate" = ${workDate}
    ORDER BY e."createdAt" ASC
  `;
}

export async function getAttendanceEventsForDate(workDate: string) {
  return prisma.$queryRaw<OfficeAttendanceEventRow[]>`
    SELECT
      e."id",
      e."attendanceId",
      e."userId",
      e."eventType",
      e."label",
      e."latitude",
      e."longitude",
      e."accuracyMeters",
      e."distanceMeters",
      e."insideGeofence",
      e."photoDataUrl",
      e."note",
      e."createdAt"
    FROM public."OfficeAttendanceEvent" e
    INNER JOIN public."OfficeAttendance" a ON a."id" = e."attendanceId"
    WHERE a."workDate" = ${workDate}
    ORDER BY e."createdAt" ASC
  `;
}

export async function getEmployeeAttendanceRows(workDate: string) {
  return prisma.$queryRaw<EmployeeAttendanceRow[]>`
    SELECT
      u."id" AS "userId",
      u."name" AS "userName",
      u."email" AS "userEmail",
      u."role"::text AS "userRole",
      u."phone" AS "userPhone",
      a."id" AS "attendanceId",
      a."id" AS "id",
      a."workDate" AS "workDate",
      a."status" AS "status",
      a."punchInAt" AS "punchInAt",
      a."punchInLatitude" AS "punchInLatitude",
      a."punchInLongitude" AS "punchInLongitude",
      a."punchInAccuracyMeters" AS "punchInAccuracyMeters",
      a."punchInDistanceMeters" AS "punchInDistanceMeters",
      a."punchInInsideGeofence" AS "punchInInsideGeofence",
      a."punchInPhotoDataUrl" AS "punchInPhotoDataUrl",
      a."punchOutAt" AS "punchOutAt",
      a."punchOutLatitude" AS "punchOutLatitude",
      a."punchOutLongitude" AS "punchOutLongitude",
      a."punchOutAccuracyMeters" AS "punchOutAccuracyMeters",
      a."punchOutDistanceMeters" AS "punchOutDistanceMeters",
      a."punchOutInsideGeofence" AS "punchOutInsideGeofence",
      a."punchOutPhotoDataUrl" AS "punchOutPhotoDataUrl",
      a."currentBreakType" AS "currentBreakType",
      a."currentBreakStartedAt" AS "currentBreakStartedAt",
      CASE
        WHEN a."id" IS NULL THEN NULL
        ELSE COALESCE(a."breakMinutes", 0) + CASE
          WHEN a."currentBreakStartedAt" IS NOT NULL AND a."punchOutAt" IS NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a."currentBreakStartedAt")) / 60)::int)
          ELSE 0
        END
      END AS "breakMinutes",
      CASE
        WHEN a."punchInAt" IS NULL THEN NULL
        WHEN a."punchOutAt" IS NOT NULL THEN a."totalMinutes"
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a."punchInAt")) / 60)::int)
      END AS "totalMinutes",
      CASE
        WHEN a."punchInAt" IS NULL THEN NULL
        WHEN a."punchOutAt" IS NOT NULL THEN a."netWorkingMinutes"
        ELSE GREATEST(
          0,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a."punchInAt")) / 60)::int)
          - (
            COALESCE(a."breakMinutes", 0) + CASE
              WHEN a."currentBreakStartedAt" IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a."currentBreakStartedAt")) / 60)::int)
              ELSE 0
            END
          )
        )
      END AS "netWorkingMinutes"
    FROM public."User" u
    LEFT JOIN public."OfficeAttendance" a
      ON a."userId" = u."id" AND a."workDate" = ${workDate}
    WHERE u."role"::text <> 'DEALER'
      AND u."status"::text = 'ACTIVE'
    ORDER BY u."name" ASC
  `;
}

export async function getRecentAttendanceAttempts(limit = 25) {
  return prisma.$queryRaw<AttendanceAttemptRow[]>`
    SELECT
      attempt."id",
      attempt."userId",
      u."name" AS "userName",
      u."email" AS "userEmail",
      u."role"::text AS "userRole",
      attempt."actionType",
      attempt."status",
      attempt."message",
      attempt."latitude",
      attempt."longitude",
      attempt."accuracyMeters",
      attempt."distanceMeters",
      attempt."insideGeofence",
      attempt."attemptedAt"
    FROM public."OfficeAttendanceAttempt" attempt
    INNER JOIN public."User" u ON u."id" = attempt."userId"
    ORDER BY attempt."attemptedAt" DESC
    LIMIT ${limit}
  `;
}
