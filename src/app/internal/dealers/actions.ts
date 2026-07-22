"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  findDealerProfileByGst,
  getDealerProfile,
  insertDealerProfile,
  upsertDealerProfile,
} from "@/lib/dealer-directory";
import { createWorkflowNotification } from "@/lib/notifications";
import { hashPassword, isStrongEnoughPassword } from "@/lib/password";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { deleteUserSessions } from "@/lib/session";
import { formatIndianPhoneNumber, formatPersonName, normalizeEmail } from "@/lib/user-formatters";

const DEALER_DIRECTORY_PATH = "/internal/dealers";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function optional(value: FormDataEntryValue | null) {
  const normalized = clean(value);
  return normalized || null;
}

function money(value: FormDataEntryValue | null, { allowNegative = false } = {}) {
  const normalized = clean(value).replaceAll(",", "");
  if (!normalized) return "0";
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (!allowNegative && parsed < 0) return null;
  return parsed.toFixed(2);
}

function gstNumber(value: FormDataEntryValue | null) {
  const normalized = clean(value).toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  return /^[0-9A-Z]{8,20}$/.test(normalized) ? normalized : "INVALID";
}

function postalCode(value: FormDataEntryValue | null) {
  const normalized = clean(value).replace(/\D/g, "");
  if (!normalized) return null;
  return normalized.length === 6 ? normalized : "INVALID";
}

function go(message: string, type: "error" | "success" = "error"): never {
  redirect(`${DEALER_DIRECTORY_PATH}?${type}=${encodeURIComponent(message)}`);
}

function goToDealer(dealerId: string, message: string, type: "error" | "success" = "error"): never {
  redirect(`${DEALER_DIRECTORY_PATH}/${encodeURIComponent(dealerId)}?${type}=${encodeURIComponent(message)}`);
}

function revalidateDealerPaths(dealerId?: string) {
  revalidatePath(DEALER_DIRECTORY_PATH);
  revalidatePath("/internal/dashboard");
  revalidatePath("/internal/orders");
  revalidatePath("/internal/reports");
  revalidatePath("/internal/collections");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/dealer/profile");
  if (dealerId) revalidatePath(`${DEALER_DIRECTORY_PATH}/${dealerId}`);
}

export async function createDealerAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dealer_directory", DEALER_DIRECTORY_PATH);
  if (!hasAccess) go("permission-denied");

  const contactName = formatPersonName(clean(formData.get("contactName")));
  const businessName = clean(formData.get("businessName"));
  const email = normalizeEmail(clean(formData.get("email")));
  const phone = formatIndianPhoneNumber(clean(formData.get("phone")));
  const password = clean(formData.get("password"));
  const gst = gstNumber(formData.get("gstNumber"));
  const pin = postalCode(formData.get("postalCode"));
  const creditLimit = money(formData.get("creditLimit"));
  const openingBalance = money(formData.get("openingBalance"), { allowNegative: true });

  if (!contactName || !businessName || !email || !password) go("missing-fields");
  if (!isStrongEnoughPassword(password)) go("weak-password");
  if (gst === "INVALID") go("invalid-gst");
  if (pin === "INVALID") go("invalid-postal-code");
  if (creditLimit === null || openingBalance === null) go("invalid-account-value");

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) go("duplicate-email");

  if (gst && await findDealerProfileByGst(gst)) go("duplicate-gst");

  const dealer = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: contactName,
        email,
        phone,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        role: "DEALER",
        status: "ACTIVE",
        geofenceMode: "ANYWHERE",
      },
    });

    await tx.userRoleAssignment.create({
      data: {
        userId: user.id,
        role: "DEALER",
        isPrimary: true,
        assignedById: currentUser.id,
        assignedByName: currentUser.name,
      },
    });

    const now = new Date();
    await insertDealerProfile(tx, {
      id: `dprof_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
      dealerId: user.id,
      businessName,
      contactPerson: contactName,
      gstNumber: gst,
      addressLine1: optional(formData.get("addressLine1")),
      addressLine2: optional(formData.get("addressLine2")),
      city: optional(formData.get("city")),
      state: optional(formData.get("state")),
      postalCode: pin,
      creditLimit: new Prisma.Decimal(creditLimit),
      openingBalance: new Prisma.Decimal(openingBalance),
      internalNotes: optional(formData.get("internalNotes")),
      createdById: currentUser.id,
      createdByName: currentUser.name,
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    });

    await createWorkflowNotification({
      client: tx,
      title: "Dealer account activated",
      message: `${businessName} is now active in the Sanghvi dealer network.`,
      module: "DEALERS",
      href: "/dealer/profile",
      actor: currentUser,
      recipientUserIds: [user.id],
      priority: "NORMAL",
    });

    return user;
  });

  await createSecurityAuditLog({
    eventType: "DEALER_PROFILE_CREATED",
    user: currentUser,
    path: DEALER_DIRECTORY_PATH,
    description: `Created dealer ${businessName} (${email}); dealer ID ${dealer.id}.`,
  });

  revalidateDealerPaths(dealer.id);
  redirect(`${DEALER_DIRECTORY_PATH}/${dealer.id}?success=dealer-created`);
}

export async function updateDealerProfileAction(formData: FormData) {
  const dealerId = clean(formData.get("dealerId"));
  const { currentUser, hasAccess } = await checkPermission("manage_dealer_directory", `${DEALER_DIRECTORY_PATH}/${dealerId}`);
  if (!hasAccess) goToDealer(dealerId, "permission-denied");

  const [dealer, dealerProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, include: { roleAssignments: true } }),
    getDealerProfile(dealerId),
  ]);
  if (!dealer || (dealer.role !== "DEALER" && !dealer.roleAssignments.some((assignment) => assignment.role === "DEALER"))) {
    go("dealer-not-found");
  }
  if (dealer.status !== "ACTIVE") {
    goToDealer(dealerId, "dealer-not-active");
  }

  const contactName = formatPersonName(clean(formData.get("contactName")));
  const businessName = clean(formData.get("businessName"));
  const email = normalizeEmail(clean(formData.get("email")));
  const phone = formatIndianPhoneNumber(clean(formData.get("phone")));
  const gst = gstNumber(formData.get("gstNumber"));
  const pin = postalCode(formData.get("postalCode"));
  const creditLimit = money(formData.get("creditLimit"));
  const openingBalance = money(formData.get("openingBalance"), { allowNegative: true });

  if (!contactName || !businessName || !email) goToDealer(dealerId, "missing-fields");
  if (gst === "INVALID") goToDealer(dealerId, "invalid-gst");
  if (pin === "INVALID") goToDealer(dealerId, "invalid-postal-code");
  if (creditLimit === null || openingBalance === null) goToDealer(dealerId, "invalid-account-value");

  const duplicateEmail = await prisma.user.findFirst({ where: { email, NOT: { id: dealerId } }, select: { id: true } });
  if (duplicateEmail) goToDealer(dealerId, "duplicate-email");

  if (gst && await findDealerProfileByGst(gst, dealerId)) goToDealer(dealerId, "duplicate-gst");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: dealerId },
      data: { name: contactName, email, phone },
    });

    await upsertDealerProfile(tx, {
      id: dealerProfile?.id ?? `dprof_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
      dealerId,
      businessName,
      contactPerson: contactName,
      gstNumber: gst,
      addressLine1: optional(formData.get("addressLine1")),
      addressLine2: optional(formData.get("addressLine2")),
      city: optional(formData.get("city")),
      state: optional(formData.get("state")),
      postalCode: pin,
      creditLimit: new Prisma.Decimal(creditLimit),
      openingBalance: new Prisma.Decimal(openingBalance),
      internalNotes: optional(formData.get("internalNotes")),
      createdById: dealerProfile?.createdById ?? currentUser.id,
      createdByName: dealerProfile?.createdByName ?? currentUser.name,
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
    });

    if (dealer.status === "ACTIVE") {
      await createWorkflowNotification({
        client: tx,
        title: "Dealer profile updated",
        message: `Official account details for ${businessName} were updated.`,
        module: "DEALERS",
        href: "/dealer/profile",
        actor: currentUser,
        recipientUserIds: [dealerId],
        priority: "NORMAL",
      });
    }
  });

  if (dealer.email !== email) await deleteUserSessions(dealerId);

  await createSecurityAuditLog({
    eventType: "DEALER_PROFILE_UPDATED",
    user: currentUser,
    path: `${DEALER_DIRECTORY_PATH}/${dealerId}`,
    description: `Updated dealer ${businessName} (${email}).`,
  });

  revalidateDealerPaths(dealerId);
  goToDealer(dealerId, "dealer-updated", "success");
}

export async function archiveDealerAction(formData: FormData) {
  const dealerId = clean(formData.get("dealerId"));
  const reason = clean(formData.get("reason"));
  const { currentUser, hasAccess } = await checkPermission("manage_dealer_directory", `${DEALER_DIRECTORY_PATH}/${dealerId}`);
  if (!hasAccess) goToDealer(dealerId, "permission-denied");
  if (!reason) goToDealer(dealerId, "archive-reason-required");

  const [dealer, dealerProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, include: { roleAssignments: true } }),
    getDealerProfile(dealerId),
  ]);
  if (!dealer || (dealer.role !== "DEALER" && !dealer.roleAssignments.some((assignment) => assignment.role === "DEALER"))) {
    go("dealer-not-found");
  }
  if (dealer.status !== "ACTIVE") goToDealer(dealerId, "dealer-already-inactive");

  await prisma.user.update({
    where: { id: dealerId },
    data: {
      status: "INACTIVE",
      archivedAt: new Date(),
      archivedById: currentUser.id,
      archivedByName: currentUser.name,
      exitReason: reason,
    },
  });
  await deleteUserSessions(dealerId);

  await createSecurityAuditLog({
    eventType: "DEALER_ARCHIVED",
    user: currentUser,
    path: `${DEALER_DIRECTORY_PATH}/${dealerId}`,
    description: `Archived dealer ${dealerProfile?.businessName ?? dealer.name}. Reason: ${reason}`,
  });

  revalidateDealerPaths(dealerId);
  goToDealer(dealerId, "dealer-archived", "success");
}

export async function reactivateDealerAction(formData: FormData) {
  const dealerId = clean(formData.get("dealerId"));
  const { currentUser, hasAccess } = await checkPermission("manage_dealer_directory", `${DEALER_DIRECTORY_PATH}/${dealerId}`);
  if (!hasAccess) goToDealer(dealerId, "permission-denied");

  const [dealer, dealerProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, include: { roleAssignments: true } }),
    getDealerProfile(dealerId),
  ]);
  if (!dealer || (dealer.role !== "DEALER" && !dealer.roleAssignments.some((assignment) => assignment.role === "DEALER"))) {
    go("dealer-not-found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: dealerId },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        archivedById: null,
        archivedByName: null,
        exitReason: null,
      },
    });

    await createWorkflowNotification({
      client: tx,
      title: "Dealer account reactivated",
      message: `${dealerProfile?.businessName ?? dealer.name} can use the Dealer Portal again.`,
      module: "DEALERS",
      href: "/dealer/profile",
      actor: currentUser,
      recipientUserIds: [dealerId],
      priority: "NORMAL",
    });
  });

  await createSecurityAuditLog({
    eventType: "DEALER_REACTIVATED",
    user: currentUser,
    path: `${DEALER_DIRECTORY_PATH}/${dealerId}`,
    description: `Reactivated dealer ${dealerProfile?.businessName ?? dealer.name}.`,
  });

  revalidateDealerPaths(dealerId);
  goToDealer(dealerId, "dealer-reactivated", "success");
}
