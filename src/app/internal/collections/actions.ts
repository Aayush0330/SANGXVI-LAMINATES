"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CollectionPaymentMode,
  CollectionStatus,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

const collectionAssignableRoles = new Set([
  "OWNER",
  "MANAGER",
  "ACCOUNTANT",
  "COLLECTION_TEAM",
]);
const allowedProofTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const allowedProofLabels = new Set([
  "PAYMENT_PROOF",
  "CHEQUE_PHOTO",
  "UPI_SCREENSHOT",
  "CASH_RECEIPT",
  "BANK_TRANSFER_PROOF",
]);
const maxProofSizeBytes = 4 * 1024 * 1024;
const maxProofFiles = 5;
const maxTotalProofSizeBytes = maxProofFiles * maxProofSizeBytes;

function getString(formData: FormData, key: string, maxLength = 5_000) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function getOptionalString(
  formData: FormData,
  key: string,
  maxLength = 5_000
) {
  return getString(formData, key, maxLength) || null;
}

function getOptionalDate(formData: FormData, key: string) {
  const value = getString(formData, key, 64);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAmount(formData: FormData, key: string) {
  const amount = Number(getString(formData, key, 32));
  return Number.isSafeInteger(amount) ? amount : 0;
}

function getPaymentMode(value: string): CollectionPaymentMode {
  if (value === "CHEQUE") return CollectionPaymentMode.CHEQUE;
  if (value === "UPI") return CollectionPaymentMode.UPI;
  if (value === "BANK_TRANSFER") return CollectionPaymentMode.BANK_TRANSFER;
  if (value === "OWNER_COLLECTED") {
    return CollectionPaymentMode.OWNER_COLLECTED;
  }
  if (value === "OTHER") return CollectionPaymentMode.OTHER;
  return CollectionPaymentMode.CASH;
}

function getEditableStatus(value: string): CollectionStatus {
  if (value === "ON_THE_WAY") return CollectionStatus.ON_THE_WAY;
  if (value === "REACHED") return CollectionStatus.REACHED;
  if (value === "PARTIALLY_COLLECTED") {
    return CollectionStatus.PARTIALLY_COLLECTED;
  }
  if (value === "COLLECTED") return CollectionStatus.COLLECTED;
  if (value === "FAILED") return CollectionStatus.FAILED;
  if (value === "RESCHEDULED") return CollectionStatus.RESCHEDULED;
  if (value === "CANCELLED") return CollectionStatus.CANCELLED;
  return CollectionStatus.ASSIGNED;
}

function canManageInternalCollections(role: string) {
  return role === "owner" || role === "manager" || role === "accountant";
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string) {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[index + offset] === byte);

  if (mimeType === "image/jpeg") return startsWith([0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === "image/webp") {
    return (
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      startsWith([0x57, 0x45, 0x42, 0x50], 8)
    );
  }
  if (mimeType === "application/pdf") {
    return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
  }
  return false;
}

async function requireInternalCollectionAccess() {
  const result = await checkPermission(
    "manage_collections",
    "/internal/collections"
  );

  if (!result.hasAccess || !canManageInternalCollections(result.currentUser.role)) {
    redirect("/internal/collections?error=permission-denied");
  }

  return result.currentUser;
}

async function getActiveAssignee(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, status: true, role: true },
  });

  if (
    !user ||
    user.status !== "ACTIVE" ||
    !collectionAssignableRoles.has(user.role)
  ) {
    redirect("/internal/collections?error=agent-not-found");
  }

  return user;
}

function getProofFiles(formData: FormData) {
  const files = formData
    .getAll("proofFiles")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length === 0) {
    redirect("/internal/collections?error=proof-required");
  }
  if (files.length > maxProofFiles) {
    redirect("/internal/collections?error=too-many-proofs");
  }
  if (files.some((file) => file.size > maxProofSizeBytes)) {
    redirect("/internal/collections?error=proof-too-large");
  }
  if (
    files.reduce((total, file) => total + file.size, 0) >
    maxTotalProofSizeBytes
  ) {
    redirect("/internal/collections?error=proofs-total-too-large");
  }

  return files;
}

async function getValidatedProof(file: File, index: number) {
  if (!allowedProofTypes.has(file.type)) {
    redirect("/internal/collections?error=invalid-proof-type");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedSignature(bytes, file.type)) {
    redirect("/internal/collections?error=invalid-proof-content");
  }

  return {
    fileName: file.name.slice(0, 255) || `collection-proof-${index + 1}`,
    mimeType: file.type,
    fileDataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

function revalidateCollectionPaths() {
  revalidatePath("/internal/collections");
  revalidatePath("/field/collections");
  revalidatePath("/field/dashboard");
  revalidatePath("/internal/security");
}

export async function createCollectionAction(formData: FormData) {
  const currentUser = await requireInternalCollectionAccess();
  const amountToCollect = getAmount(formData, "amountToCollect");
  const assignedToId = getString(formData, "assignedToId", 100);
  const dealerId = getOptionalString(formData, "dealerId", 100);

  if (amountToCollect <= 0) {
    redirect("/internal/collections?error=invalid-amount");
  }
  if (!assignedToId) {
    redirect("/internal/collections?error=missing-agent");
  }

  const [assignedUser, dealer] = await Promise.all([
    getActiveAssignee(assignedToId),
    dealerId
      ? prisma.user.findFirst({
          where: { id: dealerId, role: "DEALER", status: "ACTIVE" },
          select: { id: true, name: true, phone: true },
        })
      : Promise.resolve(null),
  ]);
  const dealerName = getString(formData, "dealerName", 200) || dealer?.name;

  if (!dealerName) {
    redirect("/internal/collections?error=missing-dealer");
  }

  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const collection = await prisma.collectionAssignment.create({
    data: {
      collectionNumber: `COL-${datePart}-${randomUUID().slice(0, 8).toUpperCase()}`,
      dealerId: dealer?.id ?? null,
      dealerName,
      contactPerson: getOptionalString(formData, "contactPerson", 200),
      contactPhone:
        getOptionalString(formData, "contactPhone", 50) ?? dealer?.phone ?? null,
      assignedToId: assignedUser.id,
      amountToCollect,
      paymentMode: getPaymentMode(getString(formData, "paymentMode", 50)),
      dueAt: getOptionalDate(formData, "dueAt"),
      notes: getOptionalString(formData, "notes", 10_000),
      createdById: currentUser.id,
      createdByName: currentUser.name,
      createdByEmail: currentUser.email,
    },
  });

  await createSecurityAuditLog({
    eventType: "COLLECTION_CREATED",
    user: currentUser,
    path: "/internal/collections",
    description: `Collection ${collection.collectionNumber} assigned to ${assignedUser.name} for ${dealerName}.`,
  });

  revalidateCollectionPaths();
  redirect("/internal/collections?success=collection-created");
}

export async function updateCollectionAssignmentAction(formData: FormData) {
  const currentUser = await requireInternalCollectionAccess();
  const collectionId = getString(formData, "collectionId", 100);
  const assignedToId = getString(formData, "assignedToId", 100);
  const amountCollected = getAmount(formData, "amountCollected");
  const status = getEditableStatus(getString(formData, "status", 50));

  const [existing, assignee] = await Promise.all([
    prisma.collectionAssignment.findUnique({ where: { id: collectionId } }),
    assignedToId ? getActiveAssignee(assignedToId) : Promise.resolve(null),
  ]);

  if (!existing) {
    redirect("/internal/collections?error=collection-not-found");
  }
  if (existing.status === CollectionStatus.VERIFIED) {
    redirect("/internal/collections?error=collection-locked");
  }
  if (amountCollected < 0 || amountCollected > existing.amountToCollect) {
    redirect("/internal/collections?error=invalid-collected-amount");
  }

  const now = new Date();
  const normalizedStatus =
    status === CollectionStatus.COLLECTED ||
    status === CollectionStatus.PARTIALLY_COLLECTED
      ? amountCollected >= existing.amountToCollect
        ? CollectionStatus.COLLECTED
        : CollectionStatus.PARTIALLY_COLLECTED
      : status;
  const collection = await prisma.collectionAssignment.update({
    where: { id: existing.id },
    data: {
      assignedToId: assignee?.id ?? null,
      amountCollected,
      status: normalizedStatus,
      paymentMode: getPaymentMode(getString(formData, "paymentMode", 50)),
      dueAt: getOptionalDate(formData, "dueAt"),
      notes: getOptionalString(formData, "notes", 10_000),
      nextFollowUpAt: getOptionalDate(formData, "nextFollowUpAt"),
      failureReason: getOptionalString(formData, "failureReason", 2_000),
      onTheWayAt:
        normalizedStatus === CollectionStatus.ON_THE_WAY
          ? existing.onTheWayAt ?? now
          : existing.onTheWayAt,
      reachedAt:
        normalizedStatus === CollectionStatus.REACHED
          ? existing.reachedAt ?? now
          : existing.reachedAt,
      failedAt:
        normalizedStatus === CollectionStatus.FAILED ? now : existing.failedAt,
      rescheduledAt:
        normalizedStatus === CollectionStatus.RESCHEDULED
          ? now
          : existing.rescheduledAt,
      collectedAt:
        normalizedStatus === CollectionStatus.COLLECTED
          ? existing.collectedAt ?? now
          : existing.collectedAt,
    },
  });

  await createSecurityAuditLog({
    eventType: "COLLECTION_UPDATED",
    user: currentUser,
    path: "/internal/collections",
    description: `Collection ${collection.collectionNumber} updated with status ${collection.status}.`,
  });

  revalidateCollectionPaths();
  redirect("/internal/collections?success=collection-updated");
}

export async function uploadInternalCollectionProofAction(formData: FormData) {
  const currentUser = await requireInternalCollectionAccess();
  const collectionId = getString(formData, "collectionId", 100);
  const amountCollected = getAmount(formData, "amountCollected");

  if (amountCollected <= 0) {
    redirect("/internal/collections?error=invalid-amount");
  }

  const proofFiles = getProofFiles(formData);
  const proofTypeValue = getString(formData, "proofType", 64);
  const proofType = allowedProofLabels.has(proofTypeValue)
    ? proofTypeValue
    : "PAYMENT_PROOF";
  const note = getString(formData, "proofNote", 2_000) || null;
  const files = await Promise.all(
    proofFiles.map((file, index) => getValidatedProof(file, index))
  );

  const updated = await prisma.$transaction(async (tx) => {
    const collection = await tx.collectionAssignment.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      redirect("/internal/collections?error=collection-not-found");
    }
    if (collection.status === CollectionStatus.VERIFIED) {
      redirect("/internal/collections?error=collection-locked");
    }

    const pendingAmount =
      collection.amountToCollect - collection.amountCollected;
    if (amountCollected > pendingAmount) {
      redirect("/internal/collections?error=invalid-collected-amount");
    }

    const newTotal = collection.amountCollected + amountCollected;
    return tx.collectionAssignment.update({
      where: { id: collection.id },
      data: {
        amountCollected: newTotal,
        status:
          newTotal === collection.amountToCollect
            ? CollectionStatus.COLLECTED
            : CollectionStatus.PARTIALLY_COLLECTED,
        paymentMode: getPaymentMode(getString(formData, "paymentMode", 50)),
        collectedAt: collection.collectedAt ?? new Date(),
        collectedById: currentUser.id,
        collectedByName: currentUser.name,
        proofs: {
          create: files.map((file) => ({
            ...file,
            uploadedById: currentUser.id,
            proofType,
            note,
          })),
        },
      },
    });
  });

  await createSecurityAuditLog({
    eventType: "COLLECTION_PROOF_UPLOADED",
    user: currentUser,
    path: "/internal/collections",
    description: `${files.length} proof file(s) uploaded internally for ${updated.collectionNumber}; Rs ${amountCollected} collected.`,
  });

  revalidateCollectionPaths();
  redirect("/internal/collections?success=proof-uploaded");
}

export async function verifyCollectionAction(formData: FormData) {
  const currentUser = await requireInternalCollectionAccess();
  const collectionId = getString(formData, "collectionId", 100);
  const collection = await prisma.collectionAssignment.findUnique({
    where: { id: collectionId },
    include: { proofs: { select: { id: true } } },
  });

  if (!collection) {
    redirect("/internal/collections?error=collection-not-found");
  }
  if (collection.proofs.length === 0) {
    redirect("/internal/collections?error=proof-required");
  }
  if (collection.amountCollected < collection.amountToCollect) {
    redirect("/internal/collections?error=collection-incomplete");
  }

  await prisma.collectionAssignment.update({
    where: { id: collection.id },
    data: {
      status: CollectionStatus.VERIFIED,
      verifiedAt: new Date(),
      verifiedById: currentUser.id,
    },
  });

  await createSecurityAuditLog({
    eventType: "COLLECTION_VERIFIED",
    user: currentUser,
    path: "/internal/collections",
    description: `Collection ${collection.collectionNumber} verified by ${currentUser.name}.`,
  });

  revalidateCollectionPaths();
  redirect("/internal/collections?success=collection-verified");
}
