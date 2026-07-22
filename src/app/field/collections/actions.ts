"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CollectionPaymentMode,
  CollectionStatus,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

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

function isInternalCollectionRole(role: string) {
  return role === "owner" || role === "manager" || role === "accountant";
}

function canAccessCollection(
  assignedToId: string | null,
  currentUserId: string,
  role: string
) {
  return assignedToId === currentUserId || isInternalCollectionRole(role);
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

function getProofFiles(formData: FormData) {
  const files = formData
    .getAll("proofFiles")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length === 0) {
    redirect("/field/collections?error=proof-required");
  }
  if (files.length > maxProofFiles) {
    redirect("/field/collections?error=too-many-proofs");
  }
  if (files.some((file) => file.size > maxProofSizeBytes)) {
    redirect("/field/collections?error=proof-too-large");
  }
  if (
    files.reduce((total, file) => total + file.size, 0) >
    maxTotalProofSizeBytes
  ) {
    redirect("/field/collections?error=proofs-total-too-large");
  }
  return files;
}

async function getValidatedProof(file: File, index: number) {
  if (!allowedProofTypes.has(file.type)) {
    redirect("/field/collections?error=invalid-proof-type");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedSignature(bytes, file.type)) {
    redirect("/field/collections?error=invalid-proof-content");
  }

  return {
    fileName:
      file.name.slice(0, 255) || `collection-proof-${index + 1}`,
    mimeType: file.type,
    fileDataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

function revalidateCollectionPaths() {
  revalidatePath("/field/collections");
  revalidatePath("/internal/collections");
  revalidatePath("/field/dashboard");
  revalidatePath("/internal/security");
}

export async function updateCollectionProgressAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_collections",
    "/field/collections"
  );
  if (!hasAccess) {
    redirect("/field/collections?error=permission-denied");
  }

  const collectionId = getString(formData, "collectionId", 100);
  const requestedStatus = getString(formData, "status", 50);
  const collection = await prisma.collectionAssignment.findUnique({
    where: { id: collectionId },
  });

  if (!collection) {
    redirect("/field/collections?error=collection-not-found");
  }
  if (
    !canAccessCollection(
      collection.assignedToId,
      currentUser.id,
      currentUser.role
    )
  ) {
    redirect("/field/collections?error=permission-denied");
  }
  if (["COLLECTED", "VERIFIED", "CANCELLED"].includes(collection.status)) {
    redirect("/field/collections?error=collection-closed");
  }

  const now = new Date();
  let data:
    | {
        status: CollectionStatus;
        onTheWayAt?: Date;
        reachedAt?: Date;
        failedAt?: Date;
        rescheduledAt?: Date;
        nextFollowUpAt?: Date | null;
        failureReason?: string | null;
      }
    | undefined;

  if (requestedStatus === "ON_THE_WAY") {
    data = {
      status: CollectionStatus.ON_THE_WAY,
      onTheWayAt: collection.onTheWayAt ?? now,
    };
  } else if (requestedStatus === "REACHED") {
    data = {
      status: CollectionStatus.REACHED,
      reachedAt: collection.reachedAt ?? now,
    };
  } else if (requestedStatus === "FAILED") {
    data = {
      status: CollectionStatus.FAILED,
      failedAt: now,
      failureReason: getString(formData, "note", 2_000) || null,
    };
  } else if (requestedStatus === "RESCHEDULED") {
    const nextFollowUpAt = getOptionalDate(formData, "nextFollowUpAt");
    if (!nextFollowUpAt) {
      redirect("/field/collections?error=follow-up-required");
    }
    data = {
      status: CollectionStatus.RESCHEDULED,
      rescheduledAt: now,
      nextFollowUpAt,
      failureReason: getString(formData, "note", 2_000) || null,
    };
  }

  if (!data) {
    redirect("/field/collections?error=invalid-status");
  }

  const updated = await prisma.collectionAssignment.update({
    where: { id: collection.id },
    data,
  });

  await createSecurityAuditLog({
    eventType: "COLLECTION_STATUS_CHANGED",
    user: currentUser,
    path: "/field/collections",
    description: `Collection ${updated.collectionNumber} status changed to ${updated.status}.`,
  });

  revalidateCollectionPaths();
  redirect("/field/collections?success=status-updated");
}

export async function uploadCollectionProofAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_collections",
    "/field/collections"
  );
  if (!hasAccess) {
    redirect("/field/collections?error=permission-denied");
  }

  const collectionId = getString(formData, "collectionId", 100);
  const amountCollected = getAmount(formData, "amountCollected");
  if (amountCollected <= 0) {
    redirect("/field/collections?error=invalid-amount");
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
      redirect("/field/collections?error=collection-not-found");
    }
    if (
      !canAccessCollection(
        collection.assignedToId,
        currentUser.id,
        currentUser.role
      )
    ) {
      redirect("/field/collections?error=permission-denied");
    }
    if (["COLLECTED", "VERIFIED", "CANCELLED"].includes(collection.status)) {
      redirect("/field/collections?error=collection-closed");
    }

    const pendingAmount =
      collection.amountToCollect - collection.amountCollected;
    if (amountCollected > pendingAmount) {
      redirect("/field/collections?error=amount-exceeds-pending");
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
        paymentMode: getPaymentMode(
          getString(formData, "paymentMode", 50)
        ),
        collectedAt: new Date(),
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
    path: "/field/collections",
    description: `${files.length} proof file(s) uploaded for ${updated.collectionNumber}; ₹${amountCollected} collected.`,
  });

  revalidateCollectionPaths();
  redirect("/field/collections?success=proof-uploaded");
}
