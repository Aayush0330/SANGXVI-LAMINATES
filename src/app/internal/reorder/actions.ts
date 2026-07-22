"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import {
  cleanText,
  generatePurchaseReceiptNumber,
  generatePurchaseRequestNumber,
  getProductStatusForQuantity,
  optionalText,
  parseMoney,
  parseOptionalDate,
  parseWholeNumber,
} from "@/lib/purchasing";
import { createSecurityAuditLog } from "@/lib/security-audit";

const REORDER_PATH = "/internal/reorder";
const MAX_PURCHASE_TOTAL = 999_999_999_999.99;

type PurchaseInput = { productId?: unknown; quantity?: unknown; unitPrice?: unknown; notes?: unknown };

function go(code: string, type: "error" | "success" = "error", requestId?: string): never {
  const suffix = requestId ? `&requestId=${encodeURIComponent(requestId)}` : "";
  redirect(`${REORDER_PATH}?${type}=${encodeURIComponent(code)}${suffix}`);
}

function revalidatePurchasePaths(supplierId?: string) {
  revalidatePath(REORDER_PATH);
  revalidatePath("/internal/suppliers");
  revalidatePath("/internal/inventory");
  revalidatePath("/internal/inventory/insights");
  revalidatePath("/internal/inventory/calendar");
  revalidatePath("/internal/dashboard");
  revalidatePath("/internal/reports");
  revalidatePath("/dealer/products");
  revalidatePath("/dealer/place-order");
  if (supplierId) revalidatePath(`/internal/suppliers/${supplierId}`);
}

function parseItems(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as PurchaseInput[];
    if (!Array.isArray(parsed)) return null;
    const merged = new Map<string, { productId: string; quantity: number; unitPrice: number; notes: string | null }>();
    for (const raw of parsed) {
      const productId = cleanText(raw.productId, 100);
      const quantity = parseWholeNumber(raw.quantity, { min: 1, max: 1_000_000 });
      const unitPrice = parseMoney(raw.unitPrice);
      if (!productId || quantity === null || unitPrice === undefined || unitPrice === null) return null;
      const existing = merged.get(productId);
      if (existing) {
        const mergedQuantity = existing.quantity + quantity;
        if (mergedQuantity > 1_000_000) return null;
        existing.quantity = mergedQuantity;
        existing.unitPrice = unitPrice;
      } else {
        merged.set(productId, { productId, quantity, unitPrice, notes: optionalText(raw.notes, 400) });
      }
    }
    return Array.from(merged.values());
  } catch {
    return null;
  }
}

export async function createPurchaseRequestAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_purchase_requests", REORDER_PATH);
  if (!hasAccess) go("permission-denied");

  const supplierId = cleanText(formData.get("supplierId"), 100);
  const items = parseItems(formData.get("itemsJson"));
  const priority = cleanText(formData.get("priority"), 20);
  const expectedDeliveryDate = parseOptionalDate(formData.get("expectedDeliveryDate"));
  if (!supplierId || !items?.length) go("invalid-request-items");
  if (!["NORMAL", "HIGH", "URGENT"].includes(priority)) go("invalid-priority");
  if (expectedDeliveryDate === undefined) go("invalid-expected-date");

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, isActive: true },
    include: { productLinks: { where: { isActive: true }, select: { productId: true, minimumOrderQuantity: true } } },
  });
  if (!supplier) go("supplier-not-active");

  const linkedProducts = new Map(supplier.productLinks.map((link) => [link.productId, link]));
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) }, isActive: true },
    select: { id: true, name: true, code: true },
  });
  if (products.length !== items.length) go("product-not-found");
  for (const item of items) {
    const link = linkedProducts.get(item.productId);
    if (!link) go("product-not-linked");
    if (item.quantity < link.minimumOrderQuantity) go("below-minimum-order-quantity");
  }

  const estimatedTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (
    !Number.isFinite(estimatedTotal) ||
    estimatedTotal > MAX_PURCHASE_TOTAL ||
    items.some((item) => item.quantity * item.unitPrice > MAX_PURCHASE_TOTAL)
  ) {
    go("purchase-total-too-large");
  }
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseRequest.create({
      data: {
        requestNumber: generatePurchaseRequestNumber(),
        supplierId,
        status: "SUBMITTED",
        priority: priority as "NORMAL" | "HIGH" | "URGENT",
        requestedById: currentUser.id,
        requestedByName: currentUser.name,
        requestedByRole: currentUser.role,
        submittedAt: new Date(),
        expectedDeliveryDate,
        notes: optionalText(formData.get("notes"), 1500),
        estimatedTotal: new Prisma.Decimal(estimatedTotal.toFixed(2)),
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            requestedQuantity: item.quantity,
            estimatedUnitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
            lineTotal: new Prisma.Decimal((item.quantity * item.unitPrice).toFixed(2)),
            notes: item.notes,
          })),
        },
      },
    });

    await createWorkflowNotification({
      client: tx,
      title: "Purchase approval required",
      message: `${created.requestNumber} for ${supplier.companyName} is waiting for owner approval.`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${created.id}`,
      actor: currentUser,
      recipientRoles: ["owner"],
      priority: priority === "URGENT" ? "HIGH_ALERT" : "NORMAL",
      dedupeKey: `purchase-approval:${created.id}`,
    });
    return created;
  });

  await createSecurityAuditLog({
    eventType: "PURCHASE_REQUEST_CREATED",
    user: currentUser,
    path: REORDER_PATH,
    description: `Created ${request.requestNumber} for ${supplier.companyName} with ${items.length} product lines.`,
  });
  await createSecurityAuditLog({
    eventType: "PURCHASE_REQUEST_SUBMITTED",
    user: currentUser,
    path: REORDER_PATH,
    description: `Submitted ${request.requestNumber} for owner approval.`,
  });
  revalidatePurchasePaths(supplierId);
  go("purchase-request-created", "success", request.id);
}

export async function approvePurchaseRequestAction(formData: FormData) {
  const requestId = cleanText(formData.get("requestId"), 100);
  const { currentUser, hasAccess } = await checkPermission("approve_purchase_requests", REORDER_PATH);
  if (!hasAccess) go("approval-permission-denied", "error", requestId);

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    include: { supplier: true, items: { include: { product: true } } },
  });
  if (!request) go("request-not-found");
  if (request.status !== "SUBMITTED") go("invalid-approval-state", "error", request.id);

  const approved = request.items.map((item) => {
    const value = parseWholeNumber(formData.get(`approved_${item.id}`), { min: 0, max: 1_000_000 });
    if (value === null) go("invalid-approved-quantity", "error", request.id);
    if (value > item.requestedQuantity) go("approval-exceeds-requested", "error", request.id);
    return { id: item.id, quantity: value, lineTotal: value * Number(item.estimatedUnitPrice) };
  });
  if (!approved.some((item) => item.quantity > 0)) go("approval-needs-quantity", "error", request.id);
  const estimatedTotal = approved.reduce((sum, item) => sum + item.lineTotal, 0);

  await prisma.$transaction(async (tx) => {
    for (const item of approved) {
      await tx.purchaseRequestItem.update({
        where: { id: item.id },
        data: { approvedQuantity: item.quantity, lineTotal: new Prisma.Decimal(item.lineTotal.toFixed(2)) },
      });
    }
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedById: currentUser.id,
        approvedByName: currentUser.name,
        approvedAt: new Date(),
        rejectedById: null,
        rejectedByName: null,
        rejectedAt: null,
        rejectionReason: null,
        estimatedTotal: new Prisma.Decimal(estimatedTotal.toFixed(2)),
      },
    });
    await createWorkflowNotification({
      client: tx,
      title: "Purchase request approved",
      message: `${request.requestNumber} for ${request.supplier.companyName} was approved.`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${request.id}`,
      actor: currentUser,
      recipientUserIds: request.requestedById ? [request.requestedById] : [],
      recipientRoles: ["manager", "accountant"],
      priority: "NORMAL",
      dedupeKey: `purchase-approved:${request.id}`,
    });
  });

  await createSecurityAuditLog({ eventType: "PURCHASE_REQUEST_APPROVED", user: currentUser, path: REORDER_PATH, description: `Approved ${request.requestNumber}.` });
  revalidatePurchasePaths(request.supplierId);
  go("purchase-approved", "success", request.id);
}

export async function rejectPurchaseRequestAction(formData: FormData) {
  const requestId = cleanText(formData.get("requestId"), 100);
  const reason = cleanText(formData.get("reason"), 800);
  const { currentUser, hasAccess } = await checkPermission("approve_purchase_requests", REORDER_PATH);
  if (!hasAccess) go("approval-permission-denied", "error", requestId);
  if (!reason) go("rejection-reason-required", "error", requestId);

  const request = await prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { supplier: true } });
  if (!request) go("request-not-found");
  if (request.status !== "SUBMITTED") go("invalid-approval-state", "error", request.id);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", rejectedById: currentUser.id, rejectedByName: currentUser.name, rejectedAt: new Date(), rejectionReason: reason },
    });
    await createWorkflowNotification({
      client: tx,
      title: "Purchase request rejected",
      message: `${request.requestNumber} was rejected. Reason: ${reason}`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${request.id}`,
      actor: currentUser,
      recipientUserIds: request.requestedById ? [request.requestedById] : [],
      priority: "HIGH_ALERT",
      dedupeKey: `purchase-rejected:${request.id}`,
    });
  });
  await createSecurityAuditLog({ eventType: "PURCHASE_REQUEST_REJECTED", user: currentUser, path: REORDER_PATH, description: `Rejected ${request.requestNumber}. Reason: ${reason}` });
  revalidatePurchasePaths(request.supplierId);
  go("purchase-rejected", "success", request.id);
}

export async function markPurchaseOrderedAction(formData: FormData) {
  const requestId = cleanText(formData.get("requestId"), 100);
  const purchaseOrderNumber = cleanText(formData.get("purchaseOrderNumber"), 100).toUpperCase();
  const expectedDeliveryDate = parseOptionalDate(formData.get("expectedDeliveryDate"));
  const { currentUser, hasAccess } = await checkPermission("manage_purchase_requests", REORDER_PATH);
  if (!hasAccess) go("permission-denied", "error", requestId);
  if (!purchaseOrderNumber) go("po-number-required", "error", requestId);
  if (expectedDeliveryDate === undefined) go("invalid-expected-date", "error", requestId);

  const request = await prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { supplier: true, items: true } });
  if (!request) go("request-not-found");
  if (request.status !== "APPROVED") go("invalid-order-state", "error", request.id);
  const duplicatePo = await prisma.purchaseRequest.findFirst({ where: { purchaseOrderNumber, NOT: { id: request.id } }, select: { id: true } });
  if (duplicatePo) go("duplicate-po-number", "error", request.id);

  await prisma.$transaction(async (tx) => {
    for (const item of request.items) {
      await tx.purchaseRequestItem.update({ where: { id: item.id }, data: { orderedQuantity: item.approvedQuantity } });
    }
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: "ORDERED",
        purchaseOrderNumber,
        orderedById: currentUser.id,
        orderedByName: currentUser.name,
        orderedAt: new Date(),
        expectedDeliveryDate,
      },
    });
    await createWorkflowNotification({
      client: tx,
      title: "Purchase ordered",
      message: `${request.requestNumber} was ordered from ${request.supplier.companyName} as ${purchaseOrderNumber}.`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${request.id}`,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "accountant"],
      priority: "NORMAL",
      dedupeKey: `purchase-ordered:${request.id}`,
    });
  });
  await createSecurityAuditLog({ eventType: "PURCHASE_REQUEST_ORDERED", user: currentUser, path: REORDER_PATH, description: `Marked ${request.requestNumber} ordered as ${purchaseOrderNumber}.` });
  revalidatePurchasePaths(request.supplierId);
  go("purchase-ordered", "success", request.id);
}

export async function markPurchaseInTransitAction(formData: FormData) {
  const requestId = cleanText(formData.get("requestId"), 100);
  const { currentUser, hasAccess } = await checkPermission("manage_purchase_requests", REORDER_PATH);
  if (!hasAccess) go("permission-denied", "error", requestId);
  const request = await prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { supplier: true } });
  if (!request) go("request-not-found");
  if (request.status !== "ORDERED") go("invalid-transit-state", "error", request.id);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: { status: "IN_TRANSIT", inTransitAt: new Date(), supplierInvoiceNumber: optionalText(formData.get("supplierInvoiceNumber"), 120) },
    });
    await createWorkflowNotification({
      client: tx,
      title: "Purchase in transit",
      message: `${request.requestNumber} from ${request.supplier.companyName} is now in transit.`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${request.id}`,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "accountant"],
      priority: "NORMAL",
      dedupeKey: `purchase-transit:${request.id}`,
    });
  });
  await createSecurityAuditLog({ eventType: "PURCHASE_REQUEST_IN_TRANSIT", user: currentUser, path: REORDER_PATH, description: `Marked ${request.requestNumber} in transit.` });
  revalidatePurchasePaths(request.supplierId);
  go("purchase-in-transit", "success", request.id);
}

export async function cancelPurchaseRequestAction(formData: FormData) {
  const requestId = cleanText(formData.get("requestId"), 100);
  const reason = cleanText(formData.get("reason"), 800);
  const { currentUser, hasAccess } = await checkPermission("manage_purchase_requests", REORDER_PATH);
  if (!hasAccess) go("permission-denied", "error", requestId);
  if (!reason) go("cancel-reason-required", "error", requestId);

  const request = await prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { supplier: true, items: true } });
  if (!request) go("request-not-found");
  if (!["SUBMITTED", "APPROVED", "ORDERED", "IN_TRANSIT"].includes(request.status)) go("invalid-cancel-state", "error", request.id);
  if (request.items.some((item) => item.receivedQuantity + item.damagedQuantity + item.rejectedQuantity > 0)) go("cannot-cancel-received-purchase", "error", request.id);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        cancelledById: currentUser.id,
        cancelledByName: currentUser.name,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
    await createWorkflowNotification({
      client: tx,
      title: "Purchase request cancelled",
      message: `${request.requestNumber} for ${request.supplier.companyName} was cancelled. Reason: ${reason}`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${request.id}`,
      actor: currentUser,
      recipientUserIds: request.requestedById ? [request.requestedById] : [],
      recipientRoles: ["owner", "manager", "accountant"],
      priority: "HIGH_ALERT",
      dedupeKey: `purchase-cancelled:${request.id}`,
    });
  });
  await createSecurityAuditLog({ eventType: "PURCHASE_REQUEST_CANCELLED", user: currentUser, path: REORDER_PATH, description: `Cancelled ${request.requestNumber}. Reason: ${reason}` });
  revalidatePurchasePaths(request.supplierId);
  go("purchase-cancelled", "success", request.id);
}

export async function receivePurchaseStockAction(formData: FormData) {
  const requestId = cleanText(formData.get("requestId"), 100);
  const { currentUser, hasAccess } = await checkPermission("receive_purchase_stock", REORDER_PATH);
  if (!hasAccess) go("receiving-permission-denied", "error", requestId);

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    include: { supplier: true, items: { include: { product: true } } },
  });
  if (!request) go("request-not-found");
  if (!["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(request.status)) go("invalid-receiving-state", "error", request.id);

  const receiptResult = await prisma.$transaction(async (tx) => {
    // A no-op conditional UPDATE acquires the row lock using Prisma's normal
    // query path. PostgreSQL re-checks the status after a concurrent updater
    // commits, so a double-click cannot post the same remaining quantity twice.
    const claimed = await tx.purchaseRequest.updateMany({
      where: {
        id: requestId,
        status: { in: ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] },
      },
      data: { updatedAt: new Date() },
    });
    if (claimed.count !== 1) go("invalid-receiving-state", "error", requestId);

    const lockedRequest = await tx.purchaseRequest.findUnique({
      where: { id: requestId },
      include: { supplier: true, items: { include: { product: true } } },
    });
    if (!lockedRequest) go("request-not-found");
    if (!["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(lockedRequest.status)) {
      go("invalid-receiving-state", "error", lockedRequest.id);
    }

    const rows = lockedRequest.items.map((item) => {
      const totalReceived = parseWholeNumber(formData.get(`received_${item.id}`), { min: 0, max: 1_000_000 });
      const damaged = parseWholeNumber(formData.get(`damaged_${item.id}`), { min: 0, max: 1_000_000 });
      const rejected = parseWholeNumber(formData.get(`rejected_${item.id}`), { min: 0, max: 1_000_000 });
      const unitCost = parseMoney(formData.get(`unitCost_${item.id}`), { allowEmpty: true });
      if (totalReceived === null || damaged === null || rejected === null || unitCost === undefined) {
        go("invalid-receipt-values", "error", lockedRequest.id);
      }
      if (damaged + rejected > totalReceived) go("receipt-breakdown-invalid", "error", lockedRequest.id);
      const accepted = totalReceived - damaged - rejected;
      const target = item.orderedQuantity || item.approvedQuantity || item.requestedQuantity;
      const handled = item.receivedQuantity + item.damagedQuantity + item.rejectedQuantity;
      if (totalReceived > target - handled) go("receipt-exceeds-remaining", "error", lockedRequest.id);
      return { item, totalReceived, accepted, damaged, rejected, unitCost };
    }).filter((row) => row.totalReceived > 0);
    if (!rows.length) go("receipt-needs-quantity", "error", lockedRequest.id);

    const created = await tx.purchaseReceipt.create({
      data: {
        receiptNumber: generatePurchaseReceiptNumber(),
        purchaseRequestId: lockedRequest.id,
        supplierInvoiceReference: optionalText(formData.get("supplierInvoiceReference"), 120),
        challanReference: optionalText(formData.get("challanReference"), 120),
        receivedById: currentUser.id,
        receivedByName: currentUser.name,
        receivedAt: new Date(),
        notes: optionalText(formData.get("notes"), 1200),
      },
    });

    for (const row of rows) {
      await tx.purchaseReceiptItem.create({
        data: {
          purchaseReceiptId: created.id,
          purchaseRequestItemId: row.item.id,
          productId: row.item.productId,
          receivedQuantity: row.totalReceived,
          acceptedQuantity: row.accepted,
          damagedQuantity: row.damaged,
          rejectedQuantity: row.rejected,
          unitCost: row.unitCost === null ? null : new Prisma.Decimal(row.unitCost),
          notes: optionalText(formData.get(`notes_${row.item.id}`), 400),
        },
      });
      await tx.purchaseRequestItem.update({
        where: { id: row.item.id },
        data: {
          receivedQuantity: { increment: row.accepted },
          damagedQuantity: { increment: row.damaged },
          rejectedQuantity: { increment: row.rejected },
        },
      });
      const updatedProduct = await tx.product.update({
        where: { id: row.item.productId },
        data: {
          quantity: { increment: row.accepted },
          ...(row.unitCost === null ? {} : { purchasePrice: new Prisma.Decimal(row.unitCost) }),
        },
        select: { id: true, quantity: true, minimumStock: true },
      });
      await tx.product.update({
        where: { id: updatedProduct.id },
        data: { status: getProductStatusForQuantity(updatedProduct.quantity, updatedProduct.minimumStock) },
      });
      if (row.unitCost !== null) {
        await tx.productSupplier.updateMany({
          where: { supplierId: lockedRequest.supplierId, productId: row.item.productId },
          data: { lastPurchasePrice: new Prisma.Decimal(row.unitCost), isActive: true },
        });
      }
    }

    const refreshedItems = await tx.purchaseRequestItem.findMany({ where: { purchaseRequestId: lockedRequest.id } });
    const complete = refreshedItems.every((item) => {
      const target = item.orderedQuantity || item.approvedQuantity || item.requestedQuantity;
      return item.receivedQuantity + item.damagedQuantity + item.rejectedQuantity >= target;
    });
    const anyHandled = refreshedItems.some((item) => item.receivedQuantity + item.damagedQuantity + item.rejectedQuantity > 0);
    await tx.purchaseRequest.update({
      where: { id: lockedRequest.id },
      data: {
        status: complete ? "RECEIVED" : anyHandled ? "PARTIALLY_RECEIVED" : lockedRequest.status,
        actualDeliveryDate: complete ? new Date() : null,
      },
    });
    await createWorkflowNotification({
      client: tx,
      title: complete ? "Purchase fully received" : "Purchase partially received",
      message: `${created.receiptNumber} posted for ${lockedRequest.requestNumber}. Accepted stock was added to Product Master.`,
      module: "PURCHASING",
      href: `${REORDER_PATH}?requestId=${lockedRequest.id}`,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "accountant"],
      priority: rows.some((row) => row.damaged + row.rejected > 0) ? "HIGH_ALERT" : "NORMAL",
      dedupeKey: `purchase-receipt:${created.id}`,
    });
    return {
      receipt: created,
      acceptedTotal: rows.reduce((sum, row) => sum + row.accepted, 0),
      requestNumber: lockedRequest.requestNumber,
      supplierId: lockedRequest.supplierId,
    };
  });

  await createSecurityAuditLog({
    eventType: "PURCHASE_STOCK_RECEIVED",
    user: currentUser,
    path: REORDER_PATH,
    description: `Posted ${receiptResult.receipt.receiptNumber} against ${receiptResult.requestNumber}; ${receiptResult.acceptedTotal} accepted units added to stock.`,
  });
  revalidatePurchasePaths(receiptResult.supplierId);
  go("purchase-stock-received", "success", request.id);
}
