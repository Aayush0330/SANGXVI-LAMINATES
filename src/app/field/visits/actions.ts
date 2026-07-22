"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldVisitStatus } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedVisitTypes = new Set([
  "DEALER_VISIT",
  "NEW_DEALER_PROSPECT",
  "FOLLOW_UP",
  "COLLECTION_SUPPORT",
  "MARKET_SURVEY",
  "OTHER",
]);
const maxImageSizeBytes = 3 * 1024 * 1024;
const maxVisitPhotos = 5;
const maxTotalImageSizeBytes = maxVisitPhotos * maxImageSizeBytes;

function getString(formData: FormData, key: string, maxLength = 5_000) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function getOptionalString(
  formData: FormData,
  key: string,
  maxLength = 5_000
) {
  const value = getString(formData, key, maxLength);
  return value.length > 0 ? value : null;
}

function getOptionalDate(formData: FormData, key: string) {
  const value = getString(formData, key, 64);
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getOptionalFloat(formData: FormData, key: string) {
  const value = getString(formData, key, 64);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSafeStatus(value: string): FieldVisitStatus {
  if (value === "GOAL_ACHIEVED") return FieldVisitStatus.GOAL_ACHIEVED;
  if (value === "GOAL_PENDING") return FieldVisitStatus.GOAL_PENDING;
  if (value === "FOLLOW_UP_REQUIRED") {
    return FieldVisitStatus.FOLLOW_UP_REQUIRED;
  }
  if (value === "CLOSED") return FieldVisitStatus.CLOSED;
  return FieldVisitStatus.VISIT_REPORTED;
}

function hasExpectedImageSignature(bytes: Uint8Array, mimeType: string) {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[index + offset] === byte);

  if (mimeType === "image/jpeg") {
    return startsWith([0xff, 0xd8, 0xff]);
  }

  if (mimeType === "image/png") {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimeType === "image/webp") {
    return (
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      startsWith([0x57, 0x45, 0x42, 0x50], 8)
    );
  }

  return false;
}

async function getValidatedFile(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    redirect("/field/visits?error=invalid-photo-type");
  }

  if (file.size > maxImageSizeBytes) {
    redirect("/field/visits?error=photo-too-large");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedImageSignature(bytes, file.type)) {
    redirect("/field/visits?error=invalid-photo-content");
  }

  return {
    dataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`,
    fileName: file.name.slice(0, 255) || "shop-photo",
    mimeType: file.type,
  };
}

function getVisitPhotoFiles(formData: FormData) {
  const files = formData
    .getAll("visitPhotos")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length === 0) {
    redirect("/field/visits?error=missing-photo");
  }

  if (files.length > maxVisitPhotos) {
    redirect("/field/visits?error=too-many-photos");
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > maxTotalImageSizeBytes) {
    redirect("/field/visits?error=photos-total-too-large");
  }

  return files;
}

function createVisitNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FV-${datePart}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createFieldVisitAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_field_visits",
    "/field/visits"
  );

  if (!hasAccess) {
    redirect("/field/visits?error=permission-denied");
  }

  const shopName = getString(formData, "shopName", 200);
  const description = getString(formData, "description", 10_000);
  const latitude = getOptionalFloat(formData, "latitude");
  const longitude = getOptionalFloat(formData, "longitude");
  const accuracyMeters = getOptionalFloat(formData, "accuracyMeters");
  const visitPhotoFiles = getVisitPhotoFiles(formData);

  if (!shopName) {
    redirect("/field/visits?error=missing-shop");
  }

  if (!description) {
    redirect("/field/visits?error=missing-description");
  }

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    redirect("/field/visits?error=missing-location");
  }

  const photoPayloads = await Promise.all(
    visitPhotoFiles.map(async (file, index) => {
      const photo = await getValidatedFile(file);

      return {
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        fileDataUrl: photo.dataUrl,
        caption:
          index === 0
            ? "Primary shop proof photo"
            : `Visit proof photo ${index + 1}`,
        sortOrder: index,
      };
    })
  );
  const primaryPhoto = photoPayloads[0]!;
  const requestedVisitType = getString(formData, "visitType", 64);
  const visitType = allowedVisitTypes.has(requestedVisitType)
    ? requestedVisitType
    : "OTHER";
  const status = getSafeStatus(getString(formData, "status", 64));

  const visit = await prisma.fieldVisit.create({
    data: {
      visitNumber: createVisitNumber(),
      createdById: currentUser.id,
      createdByName: currentUser.name,
      createdByEmail: currentUser.email,
      createdByRole: currentUser.role,
      shopName,
      dealerName: getOptionalString(formData, "dealerName", 200),
      contactPerson: getOptionalString(formData, "contactPerson", 200),
      contactPhone: getOptionalString(formData, "contactPhone", 50),
      visitType,
      status,
      description,
      pointsDiscussed: getOptionalString(
        formData,
        "pointsDiscussed",
        10_000
      ),
      goalsAchieved: getOptionalString(formData, "goalsAchieved", 10_000),
      goalsPending: getOptionalString(formData, "goalsPending", 10_000),
      nextFollowUpAt: getOptionalDate(formData, "nextFollowUpAt"),
      latitude,
      longitude,
      accuracyMeters:
        accuracyMeters !== null && accuracyMeters >= 0
          ? accuracyMeters
          : null,
      locationLabel: `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`,
      shopPhotoFileName: primaryPhoto.fileName,
      shopPhotoMimeType: primaryPhoto.mimeType,
      shopPhotoDataUrl: primaryPhoto.fileDataUrl,
      photos: {
        create: photoPayloads,
      },
    },
  });

  await createSecurityAuditLog({
    eventType: "FIELD_VISIT_CREATED",
    user: currentUser,
    path: "/field/visits",
    description: `Field visit ${visit.visitNumber} created for ${shopName} with ${photoPayloads.length} photo proof(s).`,
  });

  revalidatePath("/field/visits");
  revalidatePath("/field/dashboard");
  revalidatePath("/internal/field-visits");
  revalidatePath("/internal/security");

  redirect("/field/visits?success=visit-saved");
}
