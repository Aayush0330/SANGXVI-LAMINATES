"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import { closeStockBlockTimeline } from "@/lib/stock-block-timeline";
import { OrderStatus, ProductStatus } from "@/generated/prisma/client";

function hasExpectedFileSignature(bytes: Uint8Array, mimeType: string) {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (mimeType === "image/jpeg") {
    return startsWith([0xff, 0xd8, 0xff]);
  }

  if (mimeType === "image/png") {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimeType === "image/webp") {
    return (
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte)
    );
  }

  if (mimeType === "application/pdf") {
    return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
  }

  return false;
}

function getProductStatus(quantity: number, minimumStock: number) {
  if (quantity <= 0) {
    return ProductStatus.OUT_OF_STOCK;
  }

  if (quantity <= minimumStock) {
    return ProductStatus.LOW_STOCK;
  }

  return ProductStatus.AVAILABLE;
}

export async function markOnTheWayAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "update_delivery_status"
  );

  if (!hasAccess) {
    redirect("/field/deliveries?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/field/deliveries?error=missing-order");
  }

  const driver = await prisma.user.findUnique({
    where: {
      email: currentUser.email,
    },
  });

  if (!driver) {
    redirect("/field/deliveries?error=driver-not-found");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    redirect("/field/deliveries?error=order-not-found");
  }

  if (order.assignedDriverId !== driver.id) {
    redirect("/field/deliveries?error=not-your-delivery");
  }

  if (order.status !== OrderStatus.TRANSPORT_ASSIGNED) {
    redirect("/field/deliveries?error=invalid-status");
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: OrderStatus.ON_THE_WAY,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.ON_THE_WAY,
      title: "Order On The Way",
      description: "Driver marked the order as on the way.",
      currentUser,
    });
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");

  redirect("/field/deliveries?success=on-the-way");
}

export async function markDeliveredAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "update_delivery_status"
  );

  if (!hasAccess) {
    redirect("/field/deliveries?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/field/deliveries?error=missing-order");
  }

  const driver = await prisma.user.findUnique({
    where: {
      email: currentUser.email,
    },
  });

  if (!driver) {
    redirect("/field/deliveries?error=driver-not-found");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!order) {
    redirect("/field/deliveries?error=order-not-found");
  }

  if (order.assignedDriverId !== driver.id) {
    redirect("/field/deliveries?error=not-your-delivery");
  }

  if (order.status !== OrderStatus.ON_THE_WAY) {
    redirect("/field/deliveries?error=invalid-status");
  }

  let nextStatus: OrderStatus = OrderStatus.DELIVERED;
  let redirectSuccess = "delivered";

  await prisma.$transaction(async (tx) => {
    let deliveredNow = 0;
    let requestedTotal = 0;
    let deliveredTotalAfter = 0;
    let cancelledTotal = 0;

    for (const item of order.items) {
      const blockedToDeliver = item.blockedQuantity;

      requestedTotal +=
        item.requestedQuantity && item.requestedQuantity > 0
          ? item.requestedQuantity
          : item.quantity;
      cancelledTotal += item.cancelledQuantity ?? 0;

      if (blockedToDeliver <= 0) {
        deliveredTotalAfter += item.deliveredQuantity ?? 0;
        continue;
      }

      const nextBlocked = Math.max(0, item.product.blocked - blockedToDeliver);
      const nextDelivered = (item.deliveredQuantity ?? 0) + blockedToDeliver;

      await tx.product.update({
        where: {
          id: item.product.id,
        },
        data: {
          blocked: nextBlocked,
          status: getProductStatus(
            item.product.quantity,
            item.product.minimumStock
          ),
        },
      });

      await tx.orderItem.update({
        where: {
          id: item.id,
        },
        data: {
          blockedQuantity: 0,
          deliveredQuantity: nextDelivered,
        },
      });

      await closeStockBlockTimeline({
        client: tx,
        orderId: order.id,
        orderItemId: item.id,
        productId: item.productId,
        quantity: blockedToDeliver,
        currentUser,
        status: "CONSUMED",
        releaseReason: "DELIVERED",
        notes: `${blockedToDeliver} blocked quantity consumed after delivery.`,
      });

      deliveredNow += blockedToDeliver;
      deliveredTotalAfter += nextDelivered;
    }

    const remainingAfterDelivery = Math.max(
      0,
      requestedTotal - deliveredTotalAfter - cancelledTotal
    );

    if (remainingAfterDelivery > 0) {
      nextStatus = OrderStatus.PARTIALLY_DELIVERED;
      redirectSuccess = "partially-delivered";
    }

    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: nextStatus,
        assignedDriverId: order.assignedDriverId,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: nextStatus,
      title:
        nextStatus === OrderStatus.PARTIALLY_DELIVERED
          ? "Order Partially Delivered"
          : "Order Delivered",
      description:
        nextStatus === OrderStatus.PARTIALLY_DELIVERED
          ? `${deliveredNow} quantity delivered. ${remainingAfterDelivery} quantity is still remaining from dealer requested quantity.`
          : `${deliveredNow} quantity delivered and blocked stock cleared.`,
      currentUser,
    });
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");

  redirect(`/field/deliveries?success=${redirectSuccess}`);
}


export async function uploadSignedInvoiceProofAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "upload_delivery_proof",
  );

  if (!hasAccess) {
    redirect("/field/deliveries?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const file = formData.get("signedInvoice") as File | null;

  if (!orderId) {
    redirect("/field/deliveries?error=missing-order");
  }

  if (!file || file.size <= 0) {
    redirect("/field/deliveries?error=missing-proof");
  }

  const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]);

  if (!allowedMimeTypes.has(file.type)) {
    redirect("/field/deliveries?error=invalid-proof-type");
  }

  const maxSize = 3 * 1024 * 1024;

  if (file.size > maxSize) {
    redirect("/field/deliveries?error=proof-too-large");
  }

  if (note.length > 500) {
    redirect("/field/deliveries?error=proof-note-too-long");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!hasExpectedFileSignature(buffer, file.type)) {
    redirect("/field/deliveries?error=invalid-proof-content");
  }

  const driver = await prisma.user.findUnique({
    where: {
      email: currentUser.email,
    },
  });

  if (!driver) {
    redirect("/field/deliveries?error=driver-not-found");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    redirect("/field/deliveries?error=order-not-found");
  }

  if (order.assignedDriverId !== driver.id) {
    redirect("/field/deliveries?error=not-your-delivery");
  }

  const proofAllowedStatuses: OrderStatus[] = [
    OrderStatus.DELIVERED,
    OrderStatus.PARTIALLY_DELIVERED,
    OrderStatus.INVOICE_UPLOADED,
  ];

  if (!proofAllowedStatuses.includes(order.status)) {
    redirect("/field/deliveries?error=proof-not-allowed");
  }

  const fileDataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
  const safeFileName = (file.name || "signed-duplicate-invoice")
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 180);
  const proofId = randomUUID();
  const nextStatus =
    order.status === OrderStatus.DELIVERED
      ? OrderStatus.INVOICE_UPLOADED
      : order.status;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "DeliveryProof" (
        "id",
        "orderId",
        "uploadedById",
        "proofType",
        "fileName",
        "mimeType",
        "fileDataUrl",
        "note",
        "uploadedAt"
      )
      VALUES (
        ${proofId},
        ${order.id},
        ${driver.id},
        'SIGNED_DUPLICATE_INVOICE',
        ${safeFileName},
        ${file.type},
        ${fileDataUrl},
        ${note || null},
        CURRENT_TIMESTAMP
      )
    `;

    await tx.$executeRaw`
      UPDATE "Order"
      SET
        "signedInvoiceStatus" = 'UPLOADED',
        "signedInvoiceUploadedAt" = CURRENT_TIMESTAMP,
        "status" = ${nextStatus}::"OrderStatus",
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${order.id}
    `;

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: nextStatus,
      title: "Signed Duplicate Invoice Uploaded",
      description: `${driver.name} uploaded signed duplicate invoice proof${
        note ? ` with note: ${note}` : ""
      }.`,
      currentUser,
    });
  });

  await createSecurityAuditLog({
    eventType: "DELIVERY_PROOF_UPLOADED",
    user: currentUser,
    path: "/field/deliveries",
    description: `${driver.name} uploaded signed duplicate invoice for ${order.orderNumber}.`,
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/internal/security");

  redirect("/field/deliveries?success=proof-uploaded");
}
