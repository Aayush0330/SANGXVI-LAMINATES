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
const MAX_PHOTO_BYTES = 650 * 1024;
const configuredMaxAccuracy = Number(
  process.env.ATTENDANCE_MAX_ACCURACY_METERS || 150,
);
const MAX_ACCURACY_METERS =
  Number.isFinite(configuredMaxAccuracy) && configuredMaxAccuracy > 0
    ? configuredMaxAccuracy
    : 150;

type AttendanceWriteClient = Pick<
  typeof prisma,
  "$executeRaw" | "$queryRaw"
>;

class AttendanceStateError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

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

function parseJpegDataUrl(value: string) {
  const prefix = "data:image/jpeg;base64,";
  if (!value.startsWith(prefix)) return null;
  const encoded = value.slice(prefix.length);
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    return null;
  }

  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length < 4 ||
    bytes.length > MAX_PHOTO_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return null;
  }

  return `${prefix}${bytes.toString("base64")}`;
}

async function saveAttendanceAttempt({
  client = prisma,
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
  client?: AttendanceWriteClient;
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
  await client.$executeRaw`
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
  client = prisma,
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
  client?: AttendanceWriteClient;
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
  await client.$executeRaw`
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
  const photoDataUrl = photoRequired
    ? parseJpegDataUrl(rawPhotoDataUrl)
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
    redirect(
      rawPhotoDataUrl
        ? "/account/attendance?error=invalid-photo-content"
        : "/account/attendance?error=photo-required",
    );
  }

  const office = await getActiveOfficeLocation();
  const geofenceRequired = currentUser.geofenceMode === "OFFICE_REQUIRED";

  if (
    accuracyMeters !== null &&
    (accuracyMeters <= 0 || accuracyMeters > 10_000)
  ) {
    redirect("/account/attendance?error=invalid-location");
  }
  if (
    geofenceRequired &&
    (accuracyMeters === null || accuracyMeters > MAX_ACCURACY_METERS)
  ) {
    redirect(
      `/account/attendance?error=inaccurate-location&maxAccuracy=${encodeURIComponent(String(MAX_ACCURACY_METERS))}`,
    );
  }

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
    const message = `Punch In approved. User was ${distanceMeters}m from office.`;

    try {
      await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
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

      await saveAttendanceEvent({
        client: tx,
        attendanceId,
        userId: currentUser.id,
        actionType,
        latitude,
        longitude,
        accuracyMeters,
        distanceMeters,
        insideGeofence,
        photoDataUrl: null,
        note: message,
      });

      await saveAttendanceAttempt({
        client: tx,
        userId: currentUser.id,
        actionType,
        status: "APPROVED",
        message,
        latitude,
        longitude,
        accuracyMeters,
        distanceMeters,
        insideGeofence,
        photoDataUrl: null,
      });
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/unique|23505|OfficeAttendance_userId_workDate/i.test(text)) {
        redirect("/account/attendance?error=already-punched-in");
      }
      throw error;
    }

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

    const message = `${getBreakTypeLabel(breakType)} started. User was ${distanceMeters}m from office.`;

    try {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE public."OfficeAttendance"
          SET
            "status" = ${getBreakStatusFromType(breakType)},
            "currentBreakType" = ${breakType},
            "currentBreakStartedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${todayAttendance.id}
            AND "punchOutAt" IS NULL
            AND "currentBreakType" IS NULL
          RETURNING "id"
        `;
        if (changed.length !== 1) {
          throw new AttendanceStateError("end-current-break-first");
        }

        await saveAttendanceEvent({
          client: tx,
          attendanceId: todayAttendance.id,
          userId: currentUser.id,
          actionType,
          latitude,
          longitude,
          accuracyMeters,
          distanceMeters,
          insideGeofence,
          photoDataUrl: null,
          note: message,
        });

        await saveAttendanceAttempt({
          client: tx,
          userId: currentUser.id,
          actionType,
          status: "APPROVED",
          message,
          latitude,
          longitude,
          accuracyMeters,
          distanceMeters,
          insideGeofence,
          photoDataUrl: null,
        });
      });
    } catch (error) {
      if (error instanceof AttendanceStateError) {
        redirect(`/account/attendance?error=${error.code}`);
      }
      throw error;
    }

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

    const message = `${getBreakTypeLabel(breakType)} ended. User was ${distanceMeters}m from office.`;

    try {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE public."OfficeAttendance"
          SET
            "status" = 'PUNCHED_IN',
            "breakMinutes" = "breakMinutes" + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "currentBreakStartedAt")) / 60)::int),
            "currentBreakType" = NULL,
            "currentBreakStartedAt" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${todayAttendance.id}
            AND "punchOutAt" IS NULL
            AND "currentBreakType" = ${breakType}
            AND "currentBreakStartedAt" IS NOT NULL
          RETURNING "id"
        `;
        if (changed.length !== 1) {
          throw new AttendanceStateError("invalid-break-end");
        }

        await saveAttendanceEvent({
          client: tx,
          attendanceId: todayAttendance.id,
          userId: currentUser.id,
          actionType,
          latitude,
          longitude,
          accuracyMeters,
          distanceMeters,
          insideGeofence,
          photoDataUrl: null,
          note: message,
        });

        await saveAttendanceAttempt({
          client: tx,
          userId: currentUser.id,
          actionType,
          status: "APPROVED",
          message,
          latitude,
          longitude,
          accuracyMeters,
          distanceMeters,
          insideGeofence,
          photoDataUrl: null,
        });
      });
    } catch (error) {
      if (error instanceof AttendanceStateError) {
        redirect(`/account/attendance?error=${error.code}`);
      }
      throw error;
    }

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

  const message = `Logging Out / Punch Out saved. User was ${distanceMeters}m from office.`;

  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public."OfficeAttendance"
        SET
          "status" = 'COMPLETED',
          "punchOutAt" = CURRENT_TIMESTAMP,
          "punchOutLatitude" = ${latitude},
          "punchOutLongitude" = ${longitude},
          "punchOutAccuracyMeters" = ${accuracyMeters},
          "punchOutDistanceMeters" = ${distanceMeters},
          "punchOutInsideGeofence" = ${insideGeofence},
          "punchOutPhotoDataUrl" = NULL,
          "totalMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "punchInAt")) / 60)::int),
          "netWorkingMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "punchInAt")) / 60)::int - "breakMinutes"),
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${todayAttendance.id}
          AND "punchInAt" IS NOT NULL
          AND "punchOutAt" IS NULL
          AND "currentBreakType" IS NULL
        RETURNING "id"
      `;
      if (changed.length !== 1) {
        throw new AttendanceStateError("already-completed");
      }

      await saveAttendanceEvent({
        client: tx,
        attendanceId: todayAttendance.id,
        userId: currentUser.id,
        actionType,
        latitude,
        longitude,
        accuracyMeters,
        distanceMeters,
        insideGeofence,
        photoDataUrl: null,
        note: message,
      });

      await saveAttendanceAttempt({
        client: tx,
        userId: currentUser.id,
        actionType,
        status: "APPROVED",
        message,
        latitude,
        longitude,
        accuracyMeters,
        distanceMeters,
        insideGeofence,
        photoDataUrl: null,
      });
    });
  } catch (error) {
    if (error instanceof AttendanceStateError) {
      redirect(`/account/attendance?error=${error.code}`);
    }
    throw error;
  }

  await createSecurityAuditLog({
    eventType: "ATTENDANCE_PUNCH",
    user: currentUser,
    path: "/account/attendance",
    description: message,
  });

  redirect("/account/attendance?success=punched-out");
}
