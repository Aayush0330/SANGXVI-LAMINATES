"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  calculateDistanceMeters,
  canUseOfficeAttendance,
  getActiveOfficeLocation,
  getAttendanceActionLabel,
  getBreakStatusFromType,
  getBreakTypeFromAction,
  getBreakTypeLabel,
  getIndiaWorkDate,
  getTodayAttendanceForUser,
  isBreakEndAction,
  isBreakStartAction,
  type AttendanceActionType,
} from "@/lib/office-attendance";

const allowedActionTypes: AttendanceActionType[] = [
  "PUNCH_IN",
  "LUNCH_START",
  "LUNCH_END",
  "TEA_START",
  "TEA_END",
  "SMALL_BREAK_START",
  "SMALL_BREAK_END",
  "PUNCH_OUT",
];

function parseNumber(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function getSafeRedirectQuery(message: string) {
  return encodeURIComponent(message.slice(0, 160));
}

async function saveAttendanceAttempt({
  userId,
  actionType,
  status,
  message,
  latitude,
  longitude,
  accuracyMeters,
  distanceMeters,
  insideGeofence,
  photoDataUrl,
}: {
  userId: string;
  actionType: AttendanceActionType;
  status: string;
  message: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  insideGeofence: boolean;
  photoDataUrl: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO public."OfficeAttendanceAttempt" (
      "id",
      "userId",
      "actionType",
      "status",
      "message",
      "latitude",
      "longitude",
      "accuracyMeters",
      "distanceMeters",
      "insideGeofence",
      "photoDataUrl",
      "attemptedAt"
    )
    VALUES (
      ${randomUUID()},
      ${userId},
      ${actionType},
      ${status},
      ${message},
      ${latitude},
      ${longitude},
      ${accuracyMeters},
      ${distanceMeters},
      ${insideGeofence},
      ${photoDataUrl},
      CURRENT_TIMESTAMP
    )
  `;
}

async function saveAttendanceEvent({
  attendanceId,
  userId,
  actionType,
  latitude,
  longitude,
  accuracyMeters,
  distanceMeters,
  insideGeofence,
  photoDataUrl,
  note,
}: {
  attendanceId: string;
  userId: string;
  actionType: AttendanceActionType;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  distanceMeters: number;
  insideGeofence: boolean;
  photoDataUrl: string | null;
  note: string;
}) {
  await prisma.$executeRaw`
    INSERT INTO public."OfficeAttendanceEvent" (
      "id",
      "attendanceId",
      "userId",
      "eventType",
      "label",
      "latitude",
      "longitude",
      "accuracyMeters",
      "distanceMeters",
      "insideGeofence",
      "photoDataUrl",
      "note",
      "createdAt"
    )
    VALUES (
      ${randomUUID()},
      ${attendanceId},
      ${userId},
      ${actionType},
      ${getAttendanceActionLabel(actionType)},
      ${latitude},
      ${longitude},
      ${accuracyMeters},
      ${distanceMeters},
      ${insideGeofence},
      ${photoDataUrl},
      ${note},
      CURRENT_TIMESTAMP
    )
  `;
}

function getSuccessQuery(actionType: AttendanceActionType) {
  if (actionType === "PUNCH_IN") return "punched-in";
  if (actionType === "PUNCH_OUT") return "punched-out";
  if (actionType === "LUNCH_START") return "lunch-started";
  if (actionType === "LUNCH_END") return "lunch-ended";
  if (actionType === "TEA_START") return "tea-started";
  if (actionType === "TEA_END") return "tea-ended";
  if (actionType === "SMALL_BREAK_START") return "small-break-started";
  return "small-break-ended";
}

export async function submitAttendancePunchAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser.roles.some((role) => canUseOfficeAttendance(role))) {
    redirect("/account/attendance?error=attendance-not-allowed");
  }

  const actionType = String(formData.get("actionType")) as AttendanceActionType;
  const latitude = parseNumber(formData.get("latitude"));
  const longitude = parseNumber(formData.get("longitude"));
  const accuracyMeters = parseNumber(formData.get("accuracyMeters"));
  const rawPhotoDataUrl = String(formData.get("photoDataUrl") ?? "");
  const photoRequired = actionType === "PUNCH_IN";
  const photoDataUrl =
    photoRequired && rawPhotoDataUrl.startsWith("data:image/jpeg;base64,")
      ? rawPhotoDataUrl
      : null;

  if (!allowedActionTypes.includes(actionType)) {
    redirect("/account/attendance?error=invalid-action");
  }

  if (latitude === null || longitude === null) {
    redirect("/account/attendance?error=location-required");
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    redirect("/account/attendance?error=invalid-location");
  }

  if (photoRequired && !photoDataUrl) {
    redirect("/account/attendance?error=photo-required");
  }

  if (photoDataUrl && photoDataUrl.length > 900000) {
    redirect("/account/attendance?error=photo-too-large");
  }

  const office = await getActiveOfficeLocation();
  const geofenceRequired = currentUser.geofenceMode === "OFFICE_REQUIRED";

  if (
    geofenceRequired &&
    (!office || office.latitude === null || office.longitude === null)
  ) {
    redirect("/account/attendance?error=office-not-configured");
  }

  const distanceMeters =
    office && office.latitude !== null && office.longitude !== null
      ? calculateDistanceMeters(
          office.latitude,
          office.longitude,
          latitude,
          longitude,
        )
      : 0;

  const insideGeofence =
    !geofenceRequired || Boolean(office && distanceMeters <= office.radiusMeters);
  const actionLabel = getAttendanceActionLabel(actionType);

  if (geofenceRequired && !insideGeofence && office) {
    const message = `Blocked ${actionLabel}. User was ${distanceMeters}m away from office. Allowed radius is ${office.radiusMeters}m.`;

    await saveAttendanceAttempt({
      userId: currentUser.id,
      actionType,
      status: "BLOCKED_OUTSIDE_OFFICE",
      message,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
    });

    await createSecurityAuditLog({
      eventType: "ATTENDANCE_BLOCKED",
      user: currentUser,
      path: "/account/attendance",
      description: message,
    });

    redirect(
      `/account/attendance?error=outside-office&distance=${distanceMeters}&message=${getSafeRedirectQuery(
        message
      )}`
    );
  }

  const workDate = getIndiaWorkDate();
  const todayAttendance = await getTodayAttendanceForUser(currentUser.id);

  if (actionType === "PUNCH_IN") {
    if (todayAttendance?.punchInAt && !todayAttendance.punchOutAt) {
      redirect("/account/attendance?error=already-punched-in");
    }

    if (todayAttendance?.punchOutAt) {
      redirect("/account/attendance?error=already-completed");
    }

    const attendanceId = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO public."OfficeAttendance" (
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
        "breakMinutes",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${attendanceId},
        ${currentUser.id},
        ${workDate},
        'PUNCHED_IN',
        CURRENT_TIMESTAMP,
        ${latitude},
        ${longitude},
        ${accuracyMeters},
        ${distanceMeters},
        ${insideGeofence},
        ${photoDataUrl},
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

    const message = `Punch In approved. User was ${distanceMeters}m from office.`;

    await saveAttendanceEvent({
      attendanceId,
      userId: currentUser.id,
      actionType,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
      note: message,
    });

    await saveAttendanceAttempt({
      userId: currentUser.id,
      actionType,
      status: "APPROVED",
      message,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
    });

    await createSecurityAuditLog({
      eventType: "ATTENDANCE_PUNCH",
      user: currentUser,
      path: "/account/attendance",
      description: message,
    });

    redirect("/account/attendance?success=punched-in");
  }

  if (!todayAttendance?.id || !todayAttendance.punchInAt) {
    redirect("/account/attendance?error=punch-in-first");
  }

  if (todayAttendance.punchOutAt || todayAttendance.status === "COMPLETED") {
    redirect("/account/attendance?error=already-completed");
  }

  if (isBreakStartAction(actionType)) {
    if (todayAttendance.currentBreakType) {
      redirect("/account/attendance?error=end-current-break-first");
    }

    const breakType = getBreakTypeFromAction(actionType);

    if (!breakType) {
      redirect("/account/attendance?error=invalid-action");
    }

    await prisma.$executeRaw`
      UPDATE public."OfficeAttendance"
      SET
        "status" = ${getBreakStatusFromType(breakType)},
        "currentBreakType" = ${breakType},
        "currentBreakStartedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${todayAttendance.id}
    `;

    const message = `${getBreakTypeLabel(breakType)} started. User was ${distanceMeters}m from office.`;

    await saveAttendanceEvent({
      attendanceId: todayAttendance.id,
      userId: currentUser.id,
      actionType,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
      note: message,
    });

    await saveAttendanceAttempt({
      userId: currentUser.id,
      actionType,
      status: "APPROVED",
      message,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
    });

    await createSecurityAuditLog({
      eventType: "ATTENDANCE_BREAK",
      user: currentUser,
      path: "/account/attendance",
      description: message,
    });

    redirect(`/account/attendance?success=${getSuccessQuery(actionType)}`);
  }

  if (isBreakEndAction(actionType)) {
    const breakType = getBreakTypeFromAction(actionType);

    if (!breakType || todayAttendance.currentBreakType !== breakType) {
      redirect("/account/attendance?error=invalid-break-end");
    }

    await prisma.$executeRaw`
      UPDATE public."OfficeAttendance"
      SET
        "status" = 'PUNCHED_IN',
        "breakMinutes" = "breakMinutes" + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "currentBreakStartedAt")) / 60)::int),
        "currentBreakType" = NULL,
        "currentBreakStartedAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${todayAttendance.id}
    `;

    const message = `${getBreakTypeLabel(breakType)} ended. User was ${distanceMeters}m from office.`;

    await saveAttendanceEvent({
      attendanceId: todayAttendance.id,
      userId: currentUser.id,
      actionType,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
      note: message,
    });

    await saveAttendanceAttempt({
      userId: currentUser.id,
      actionType,
      status: "APPROVED",
      message,
      latitude,
      longitude,
      accuracyMeters,
      distanceMeters,
      insideGeofence,
      photoDataUrl,
    });

    await createSecurityAuditLog({
      eventType: "ATTENDANCE_BREAK",
      user: currentUser,
      path: "/account/attendance",
      description: message,
    });

    redirect(`/account/attendance?success=${getSuccessQuery(actionType)}`);
  }

  if (actionType !== "PUNCH_OUT") {
    redirect("/account/attendance?error=invalid-action");
  }

  if (todayAttendance.currentBreakType) {
    redirect("/account/attendance?error=end-current-break-first");
  }

  await prisma.$executeRaw`
    UPDATE public."OfficeAttendance"
    SET
      "status" = 'COMPLETED',
      "punchOutAt" = CURRENT_TIMESTAMP,
      "punchOutLatitude" = ${latitude},
      "punchOutLongitude" = ${longitude},
      "punchOutAccuracyMeters" = ${accuracyMeters},
      "punchOutDistanceMeters" = ${distanceMeters},
      "punchOutInsideGeofence" = ${insideGeofence},
      "punchOutPhotoDataUrl" = ${photoDataUrl},
      "totalMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "punchInAt")) / 60)::int),
      "netWorkingMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "punchInAt")) / 60)::int - "breakMinutes"),
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${todayAttendance.id}
  `;

  const message = `Logging Out / Punch Out saved. User was ${distanceMeters}m from office.`;

  await saveAttendanceEvent({
    attendanceId: todayAttendance.id,
    userId: currentUser.id,
    actionType,
    latitude,
    longitude,
    accuracyMeters,
    distanceMeters,
    insideGeofence,
    photoDataUrl,
    note: message,
  });

  await saveAttendanceAttempt({
    userId: currentUser.id,
    actionType,
    status: "APPROVED",
    message,
    latitude,
    longitude,
    accuracyMeters,
    distanceMeters,
    insideGeofence,
    photoDataUrl,
  });

  await createSecurityAuditLog({
    eventType: "ATTENDANCE_PUNCH",
    user: currentUser,
    path: "/account/attendance",
    description: message,
  });

  redirect("/account/attendance?success=punched-out");
}
