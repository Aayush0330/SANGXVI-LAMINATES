"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/auth-guards";
import { createSecurityAuditLog } from "@/lib/security-audit";

function parseNumber(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function clampRadius(radius: number) {
  return Math.min(1000, Math.max(30, Math.round(radius)));
}

export async function saveOfficeLocationAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_attendance_settings",
    "/internal/attendance/settings"
  );

  if (!hasAccess) {
    redirect("/internal/attendance/settings?error=permission-denied");
  }

  const name = String(formData.get("name") ?? "").trim() || "Main Office";
  const address = String(formData.get("address") ?? "").trim() || null;
  const latitude = parseNumber(formData.get("latitude"));
  const longitude = parseNumber(formData.get("longitude"));
  const radiusValue = parseNumber(formData.get("radiusMeters"));

  if (latitude === null || longitude === null) {
    redirect("/internal/attendance/settings?error=location-required");
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    redirect("/internal/attendance/settings?error=invalid-location");
  }

  const radiusMeters = clampRadius(radiusValue ?? 200);

  const existingRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM public."OfficeLocation"
    WHERE "isActive" = true
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  const existing = existingRows[0];

  if (existing) {
    await prisma.$executeRaw`
      UPDATE public."OfficeLocation"
      SET
        "name" = ${name},
        "address" = ${address},
        "latitude" = ${latitude},
        "longitude" = ${longitude},
        "radiusMeters" = ${radiusMeters},
        "isActive" = true,
        "updatedById" = ${currentUser.id},
        "updatedByName" = ${currentUser.name},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existing.id}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO public."OfficeLocation" (
        "id",
        "name",
        "address",
        "latitude",
        "longitude",
        "radiusMeters",
        "isActive",
        "updatedById",
        "updatedByName",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${name},
        ${address},
        ${latitude},
        ${longitude},
        ${radiusMeters},
        true,
        ${currentUser.id},
        ${currentUser.name},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
  }

  await createSecurityAuditLog({
    eventType: "OFFICE_LOCATION_UPDATED",
    user: currentUser,
    path: "/internal/attendance/settings",
    description: `Office geofence updated: ${name}, radius ${radiusMeters}m.`,
  });

  redirect("/internal/attendance/settings?success=office-updated");
}
