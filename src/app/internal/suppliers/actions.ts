"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  cleanText,
  normalizeGstNumber,
  normalizePostalCode,
  normalizeSupplierCode,
  optionalText,
  parseMoney,
  parseWholeNumber,
} from "@/lib/purchasing";
import { createSecurityAuditLog } from "@/lib/security-audit";

const SUPPLIERS_PATH = "/internal/suppliers";

function go(code: string, type: "error" | "success" = "error", supplierId?: string): never {
  const path = supplierId ? `${SUPPLIERS_PATH}/${supplierId}` : SUPPLIERS_PATH;
  redirect(`${path}?${type}=${encodeURIComponent(code)}`);
}

function revalidateSupplierPaths(supplierId?: string) {
  revalidatePath(SUPPLIERS_PATH);
  revalidatePath("/internal/reorder");
  revalidatePath("/internal/inventory");
  revalidatePath("/internal/dashboard");
  if (supplierId) revalidatePath(`${SUPPLIERS_PATH}/${supplierId}`);
}

export async function createSupplierAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_suppliers", SUPPLIERS_PATH);
  if (!hasAccess) go("permission-denied");

  const code = normalizeSupplierCode(formData.get("code"));
  const companyName = cleanText(formData.get("companyName"), 140);
  const gstNumber = normalizeGstNumber(formData.get("gstNumber"));
  const postalCode = normalizePostalCode(formData.get("postalCode"));
  const leadTime = parseWholeNumber(formData.get("defaultLeadTimeDays"), { min: 0, max: 3650 });

  if (!code || !companyName) go("missing-fields");
  if (gstNumber === "INVALID") go("invalid-gst");
  if (postalCode === "INVALID") go("invalid-postal-code");
  if (leadTime === null) go("invalid-lead-time");

  const duplicate = await prisma.supplier.findFirst({
    where: {
      OR: [
        { code },
        { companyName: { equals: companyName, mode: "insensitive" } },
        ...(gstNumber ? [{ gstNumber }] : []),
      ],
    },
    select: { id: true, code: true, gstNumber: true },
  });
  if (duplicate) go(duplicate.gstNumber === gstNumber && gstNumber ? "duplicate-gst" : "duplicate-supplier");

  const supplier = await prisma.supplier.create({
    data: {
      code,
      companyName,
      contactPerson: optionalText(formData.get("contactPerson"), 120),
      phone: optionalText(formData.get("phone"), 40),
      email: optionalText(formData.get("email"), 160)?.toLowerCase() ?? null,
      gstNumber,
      addressLine1: optionalText(formData.get("addressLine1"), 180),
      addressLine2: optionalText(formData.get("addressLine2"), 180),
      city: optionalText(formData.get("city"), 80),
      state: optionalText(formData.get("state"), 80),
      postalCode,
      paymentTerms: optionalText(formData.get("paymentTerms"), 160),
      defaultLeadTimeDays: leadTime,
      internalNotes: optionalText(formData.get("internalNotes"), 1200),
      createdById: currentUser.id,
      createdByName: currentUser.name,
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
    },
  });

  await createSecurityAuditLog({
    eventType: "SUPPLIER_CREATED",
    user: currentUser,
    path: SUPPLIERS_PATH,
    description: `Created supplier ${supplier.companyName} (${supplier.code}).`,
  });

  revalidateSupplierPaths(supplier.id);
  go("supplier-created", "success", supplier.id);
}

export async function updateSupplierAction(formData: FormData) {
  const supplierId = cleanText(formData.get("supplierId"), 100);
  const { currentUser, hasAccess } = await checkPermission("manage_suppliers", `${SUPPLIERS_PATH}/${supplierId}`);
  if (!hasAccess) go("permission-denied", "error", supplierId);

  const code = normalizeSupplierCode(formData.get("code"));
  const companyName = cleanText(formData.get("companyName"), 140);
  const gstNumber = normalizeGstNumber(formData.get("gstNumber"));
  const postalCode = normalizePostalCode(formData.get("postalCode"));
  const leadTime = parseWholeNumber(formData.get("defaultLeadTimeDays"), { min: 0, max: 3650 });

  if (!supplierId || !code || !companyName) go("missing-fields", "error", supplierId);
  if (gstNumber === "INVALID") go("invalid-gst", "error", supplierId);
  if (postalCode === "INVALID") go("invalid-postal-code", "error", supplierId);
  if (leadTime === null) go("invalid-lead-time", "error", supplierId);

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) go("supplier-not-found");
  if (!supplier.isActive) go("supplier-not-active", "error", supplierId);

  const duplicate = await prisma.supplier.findFirst({
    where: {
      NOT: { id: supplierId },
      OR: [
        { code },
        { companyName: { equals: companyName, mode: "insensitive" } },
        ...(gstNumber ? [{ gstNumber }] : []),
      ],
    },
    select: { id: true, gstNumber: true },
  });
  if (duplicate) go(duplicate.gstNumber === gstNumber && gstNumber ? "duplicate-gst" : "duplicate-supplier", "error", supplierId);

  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      code,
      companyName,
      contactPerson: optionalText(formData.get("contactPerson"), 120),
      phone: optionalText(formData.get("phone"), 40),
      email: optionalText(formData.get("email"), 160)?.toLowerCase() ?? null,
      gstNumber,
      addressLine1: optionalText(formData.get("addressLine1"), 180),
      addressLine2: optionalText(formData.get("addressLine2"), 180),
      city: optionalText(formData.get("city"), 80),
      state: optionalText(formData.get("state"), 80),
      postalCode,
      paymentTerms: optionalText(formData.get("paymentTerms"), 160),
      defaultLeadTimeDays: leadTime,
      internalNotes: optionalText(formData.get("internalNotes"), 1200),
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
    },
  });

  await createSecurityAuditLog({
    eventType: "SUPPLIER_UPDATED",
    user: currentUser,
    path: `${SUPPLIERS_PATH}/${supplierId}`,
    description: `Updated supplier ${companyName} (${code}).`,
  });
  revalidateSupplierPaths(supplierId);
  go("supplier-updated", "success", supplierId);
}

export async function archiveSupplierAction(formData: FormData) {
  const supplierId = cleanText(formData.get("supplierId"), 100);
  const reason = cleanText(formData.get("reason"), 500);
  const { currentUser, hasAccess } = await checkPermission("manage_suppliers", `${SUPPLIERS_PATH}/${supplierId}`);
  if (!hasAccess) go("permission-denied", "error", supplierId);
  if (!reason) go("archive-reason-required", "error", supplierId);

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, companyName: true, isActive: true, internalNotes: true },
  });
  if (!supplier) go("supplier-not-found");
  if (!supplier.isActive) go("supplier-already-archived", "error", supplierId);

  const openRequests = await prisma.purchaseRequest.count({
    where: {
      supplierId,
      status: { in: ["SUBMITTED", "APPROVED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] },
    },
  });
  if (openRequests > 0) go("supplier-has-open-purchases", "error", supplierId);

  await prisma.$transaction([
    prisma.supplier.update({
      where: { id: supplierId },
      data: {
        isActive: false,
        archivedAt: new Date(),
        archivedById: currentUser.id,
        archivedByName: currentUser.name,
        updatedById: currentUser.id,
        updatedByName: currentUser.name,
        internalNotes: [supplier.internalNotes, `Archived on ${new Date().toISOString()}: ${reason}`]
          .filter(Boolean)
          .join("\n\n"),
      },
    }),
    prisma.productSupplier.updateMany({ where: { supplierId }, data: { isActive: false, isPreferred: false } }),
  ]);

  await createSecurityAuditLog({
    eventType: "SUPPLIER_ARCHIVED",
    user: currentUser,
    path: `${SUPPLIERS_PATH}/${supplierId}`,
    description: `Archived supplier ${supplier.companyName}. Reason: ${reason}`,
  });
  revalidateSupplierPaths(supplierId);
  go("supplier-archived", "success", supplierId);
}

export async function reactivateSupplierAction(formData: FormData) {
  const supplierId = cleanText(formData.get("supplierId"), 100);
  const { currentUser, hasAccess } = await checkPermission("manage_suppliers", `${SUPPLIERS_PATH}/${supplierId}`);
  if (!hasAccess) go("permission-denied", "error", supplierId);

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, companyName: true, isActive: true } });
  if (!supplier) go("supplier-not-found");
  if (supplier.isActive) go("supplier-already-active", "error", supplierId);

  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      isActive: true,
      archivedAt: null,
      archivedById: null,
      archivedByName: null,
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
    },
  });

  await createSecurityAuditLog({
    eventType: "SUPPLIER_REACTIVATED",
    user: currentUser,
    path: `${SUPPLIERS_PATH}/${supplierId}`,
    description: `Reactivated supplier ${supplier.companyName}.`,
  });
  revalidateSupplierPaths(supplierId);
  go("supplier-reactivated", "success", supplierId);
}

export async function upsertProductSupplierAction(formData: FormData) {
  const supplierId = cleanText(formData.get("supplierId"), 100);
  const productId = cleanText(formData.get("productId"), 100);
  const { currentUser, hasAccess } = await checkPermission("manage_suppliers", `${SUPPLIERS_PATH}/${supplierId}`);
  if (!hasAccess) go("permission-denied", "error", supplierId);

  const minimumOrderQuantity = parseWholeNumber(formData.get("minimumOrderQuantity"), { min: 1, max: 1_000_000 });
  const leadTimeDays = parseWholeNumber(formData.get("leadTimeDays"), { min: 0, max: 3650 });
  const lastPurchasePrice = parseMoney(formData.get("lastPurchasePrice"), { allowEmpty: true });
  const isPreferred = cleanText(formData.get("isPreferred"), 5) === "1";
  if (!supplierId || !productId) go("missing-product-link", "error", supplierId);
  if (minimumOrderQuantity === null || leadTimeDays === null || lastPurchasePrice === undefined) go("invalid-product-link", "error", supplierId);

  const [supplier, product] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: supplierId, isActive: true }, select: { id: true, companyName: true } }),
    prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true, name: true } }),
  ]);
  if (!supplier) go("supplier-not-active", "error", supplierId);
  if (!product) go("product-not-found", "error", supplierId);

  await prisma.$transaction(async (tx) => {
    if (isPreferred) {
      await tx.productSupplier.updateMany({
        where: { productId, NOT: { supplierId } },
        data: { isPreferred: false },
      });
    }

    await tx.productSupplier.upsert({
      where: { productId_supplierId: { productId, supplierId } },
      create: {
        productId,
        supplierId,
        supplierProductCode: optionalText(formData.get("supplierProductCode"), 80),
        isPreferred,
        minimumOrderQuantity,
        lastPurchasePrice: lastPurchasePrice === null ? null : new Prisma.Decimal(lastPurchasePrice),
        leadTimeDays,
        isActive: true,
      },
      update: {
        supplierProductCode: optionalText(formData.get("supplierProductCode"), 80),
        isPreferred,
        minimumOrderQuantity,
        lastPurchasePrice: lastPurchasePrice === null ? null : new Prisma.Decimal(lastPurchasePrice),
        leadTimeDays,
        isActive: true,
      },
    });
  });

  await createSecurityAuditLog({
    eventType: "PRODUCT_SUPPLIER_UPDATED",
    user: currentUser,
    path: `${SUPPLIERS_PATH}/${supplierId}`,
    description: `Linked ${product.name} to ${supplier.companyName}${isPreferred ? " as preferred supplier" : ""}.`,
  });
  revalidateSupplierPaths(supplierId);
  go("product-link-updated", "success", supplierId);
}

export async function deactivateProductSupplierAction(formData: FormData) {
  const supplierId = cleanText(formData.get("supplierId"), 100);
  const linkId = cleanText(formData.get("linkId"), 100);
  const { currentUser, hasAccess } = await checkPermission("manage_suppliers", `${SUPPLIERS_PATH}/${supplierId}`);
  if (!hasAccess) go("permission-denied", "error", supplierId);

  const link = await prisma.productSupplier.findFirst({
    where: { id: linkId, supplierId },
    include: {
      product: { select: { name: true } },
      supplier: { select: { companyName: true, isActive: true } },
    },
  });
  if (!link) go("product-link-not-found", "error", supplierId);
  if (!link.supplier.isActive) go("supplier-not-active", "error", supplierId);

  await prisma.productSupplier.update({ where: { id: link.id }, data: { isActive: false, isPreferred: false } });
  await createSecurityAuditLog({
    eventType: "PRODUCT_SUPPLIER_UPDATED",
    user: currentUser,
    path: `${SUPPLIERS_PATH}/${supplierId}`,
    description: `Disabled ${link.product.name} mapping for ${link.supplier.companyName}.`,
  });
  revalidateSupplierPaths(supplierId);
  go("product-link-disabled", "success", supplierId);
}
