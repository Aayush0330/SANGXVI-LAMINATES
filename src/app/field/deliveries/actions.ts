"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { readAndValidateDeliveryProof } from "@/lib/delivery-proof";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import { closeStockBlockTimeline } from "@/lib/stock-block-timeline";
import {
  ensureProofAssistanceTask,
  setAutomatedTaskStatus,
  workflowTaskKeys,
} from "@/lib/workflow-tasks";
import {
  DeliveryProofAssistanceStatus,
  DeliveryProofUploadMode,
  OrderStatus,
  ProductStatus,
} from "@/generated/prisma/client";

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

    await createWorkflowNotification({
      client: tx,
      title: "Order on the way",
      message: `${order.orderNumber} is now out for delivery.`,
      module: "DELIVERY",
      href: "/dealer/orders",
      orderId: order.id,
      actor: currentUser,
      recipientUserIds: [order.dealerId],
    });
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect("/field/deliveries?success=on-the-way");
}

export async function markDeliveredAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "update_delivery_status",
  );

  if (!hasAccess) redirect("/field/deliveries?error=permission-denied");

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) redirect("/field/deliveries?error=missing-order");

  const driver = await prisma.user.findUnique({
    where: { email: currentUser.email },
  });
  if (!driver) redirect("/field/deliveries?error=driver-not-found");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) redirect("/field/deliveries?error=order-not-found");
  if (order.assignedDriverId !== driver.id) {
    redirect("/field/deliveries?error=not-your-delivery");
  }
  if (order.status !== OrderStatus.ON_THE_WAY) {
    redirect("/field/deliveries?error=invalid-status");
  }

  const incompleteItem = order.items.find((item) => {
    const orderedQuantity =
      item.requestedQuantity > 0 ? item.requestedQuantity : item.quantity;
    return (
      item.quantity !== orderedQuantity ||
      item.blockedQuantity !== orderedQuantity ||
      item.product.blocked < orderedQuantity ||
      item.deliveredQuantity !== 0 ||
      item.cancelledQuantity !== 0
    );
  });

  if (incompleteItem) {
    redirect("/field/deliveries?error=complete-quantity-required");
  }

  const deliveredAt = new Date();
  const deliveredTotal = order.items.reduce(
    (total, item) =>
      total + (item.requestedQuantity > 0 ? item.requestedQuantity : item.quantity),
    0,
  );

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const orderedQuantity =
        item.requestedQuantity > 0 ? item.requestedQuantity : item.quantity;
      const nextBlocked = Math.max(0, item.product.blocked - orderedQuantity);

      await tx.product.update({
        where: { id: item.product.id },
        data: {
          blocked: nextBlocked,
          status: getProductStatus(
            item.product.quantity,
            item.product.minimumStock,
          ),
        },
      });

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          requestedQuantity: orderedQuantity,
          quantity: orderedQuantity,
          blockedQuantity: 0,
          deliveredQuantity: orderedQuantity,
          cancelledQuantity: 0,
        },
      });

      await closeStockBlockTimeline({
        client: tx,
        orderId: order.id,
        orderItemId: item.id,
        productId: item.productId,
        quantity: orderedQuantity,
        currentUser,
        status: "CONSUMED",
        releaseReason: "DELIVERED",
        notes: `${orderedQuantity} blocked quantity consumed after complete delivery.`,
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredById: driver.id,
        deliveredByName: driver.name,
        deliveredAt,
        deliveryProofAssistanceStatus:
          DeliveryProofAssistanceStatus.NOT_REQUESTED,
        deliveryProofRequestedById: null,
        deliveryProofRequestedByName: null,
        deliveryProofRequestedAt: null,
        deliveryProofRequestNote: null,
        deliveryProofCompletedById: null,
        deliveryProofCompletedByName: null,
        deliveryProofCompletedAt: null,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.DELIVERED,
      title: "Order Delivered",
      description: `${deliveredTotal} total quantity delivered in one complete delivery.`,
      currentUser,
    });

    await createWorkflowNotification({
      client: tx,
      title: "Order delivered",
      message: `${order.orderNumber} has been delivered completely.`,
      module: "DELIVERY",
      href: "/dealer/orders",
      orderId: order.id,
      actor: currentUser,
      recipientUserIds: [order.dealerId],
      priority: "HIGH",
    });

    await createWorkflowNotification({
      client: tx,
      title: "Delivery completed",
      message: `${order.orderNumber} is fully delivered. Await signed invoice proof if required.`,
      module: "DISPATCH",
      href: "/internal/dispatch",
      orderId: order.id,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "dispatch_team"],
    });
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect("/field/deliveries?success=delivered");
}

type LockedDeliveryOrder = {
  id: string;
  orderNumber: string;
  dealerId: string;
  assignedDriverId: string | null;
  status: string;
  signedInvoiceStatus: string;
  deliveredByName: string | null;
  deliveryProofAssistanceStatus: string;
  deliveryProofRequestedAt: Date | null;
};

class DeliveryProofActionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

async function getLockedDeliveryOrder(
  tx: Pick<typeof prisma, "$queryRaw">,
  orderId: string,
) {
  const rows = await tx.$queryRaw<LockedDeliveryOrder[]>`
    SELECT
      "id",
      "orderNumber",
      "dealerId",
      "assignedDriverId",
      "status"::text AS "status",
      "signedInvoiceStatus",
      "deliveredByName",
      "deliveryProofAssistanceStatus"::text AS "deliveryProofAssistanceStatus",
      "deliveryProofRequestedAt"
    FROM public."Order"
    WHERE "id" = ${orderId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

async function hasActiveSignedDeliveryProof(
  tx: Pick<typeof prisma, "$queryRaw">,
  orderId: string,
) {
  const rows = await tx.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM public."DeliveryProof"
      WHERE "orderId" = ${orderId}
        AND "proofType" = 'SIGNED_DUPLICATE_INVOICE'
        AND "isActive" = TRUE
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

function assertDriverOwnsDelivery(
  order: LockedDeliveryOrder,
  driverId: string,
) {
  if (order.assignedDriverId !== driverId) {
    throw new DeliveryProofActionError("not-your-delivery");
  }
}

function assertProofEligibleStatus(status: string) {
  if (status !== OrderStatus.DELIVERED && status !== OrderStatus.INVOICE_UPLOADED) {
    throw new DeliveryProofActionError("proof-not-allowed");
  }
}

function redirectFromProofError(error: unknown): never {
  if (error instanceof DeliveryProofActionError) {
    redirect(`/field/deliveries?error=${encodeURIComponent(error.code)}`);
  }

  throw error;
}

export async function requestManagerProofUploadAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "upload_delivery_proof",
    "/field/deliveries",
  );

  if (!hasAccess) {
    redirect("/field/deliveries?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");
  const requestNote = String(formData.get("requestNote") ?? "").trim();

  if (!orderId) {
    redirect("/field/deliveries?error=missing-order");
  }

  if (requestNote.length > 500) {
    redirect("/field/deliveries?error=proof-note-too-long");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const order = await getLockedDeliveryOrder(tx, orderId);

      if (!order) {
        throw new DeliveryProofActionError("order-not-found");
      }

      assertDriverOwnsDelivery(order, currentUser.id);
      assertProofEligibleStatus(order.status);

      if (
        order.signedInvoiceStatus === "UPLOADED" ||
        (await hasActiveSignedDeliveryProof(tx, order.id))
      ) {
        throw new DeliveryProofActionError("proof-already-uploaded");
      }

      if (
        order.deliveryProofAssistanceStatus ===
        DeliveryProofAssistanceStatus.REQUESTED
      ) {
        throw new DeliveryProofActionError("proof-help-already-requested");
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryProofAssistanceStatus:
            DeliveryProofAssistanceStatus.REQUESTED,
          deliveryProofRequestedById: currentUser.id,
          deliveryProofRequestedByName: currentUser.name,
          deliveryProofRequestedAt: new Date(),
          deliveryProofRequestNote: requestNote || null,
          deliveryProofCompletedById: null,
          deliveryProofCompletedByName: null,
          deliveryProofCompletedAt: null,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: order.id,
        fromStatus: order.status as OrderStatus,
        toStatus: order.status as OrderStatus,
        title: "Manager Proof Upload Requested",
        description: `${currentUser.name} requested manager assistance for delivery proof upload${
          requestNote ? `: ${requestNote}` : "."
        }`,
        currentUser,
      });

      await ensureProofAssistanceTask(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        driverName: currentUser.name,
        note: requestNote || null,
        actor: currentUser,
      });

      await createWorkflowNotification({
        client: tx,
        title: "Delivery proof help requested",
        message: `${currentUser.name} requested manager assistance for ${order.orderNumber}.`,
        module: "DELIVERY",
        href: "/internal/delivery-proofs",
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["owner", "manager"],
        priority: "HIGH",
      });
    });
  } catch (error) {
    redirectFromProofError(error);
  }

  await createSecurityAuditLog({
    eventType: "DELIVERY_PROOF_ASSISTANCE_REQUESTED",
    user: currentUser,
    path: "/field/deliveries",
    description: `${currentUser.name} requested manager proof assistance for order ${orderId}.`,
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/delivery-proofs");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect("/field/deliveries?success=proof-help-requested");
}

export async function cancelManagerProofUploadRequestAction(
  formData: FormData,
) {
  const { currentUser, hasAccess } = await checkPermission(
    "upload_delivery_proof",
    "/field/deliveries",
  );

  if (!hasAccess) {
    redirect("/field/deliveries?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/field/deliveries?error=missing-order");
  }

  let orderNumber = orderId;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await getLockedDeliveryOrder(tx, orderId);

      if (!order) {
        throw new DeliveryProofActionError("order-not-found");
      }

      orderNumber = order.orderNumber;
      assertDriverOwnsDelivery(order, currentUser.id);
      assertProofEligibleStatus(order.status);

      if (
        order.signedInvoiceStatus === "UPLOADED" ||
        (await hasActiveSignedDeliveryProof(tx, order.id))
      ) {
        throw new DeliveryProofActionError("proof-already-uploaded");
      }

      if (
        order.deliveryProofAssistanceStatus !==
        DeliveryProofAssistanceStatus.REQUESTED
      ) {
        throw new DeliveryProofActionError("proof-help-not-requested");
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryProofAssistanceStatus:
            DeliveryProofAssistanceStatus.CANCELLED,
          deliveryProofCompletedById: null,
          deliveryProofCompletedByName: null,
          deliveryProofCompletedAt: null,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: order.id,
        fromStatus: order.status as OrderStatus,
        toStatus: order.status as OrderStatus,
        title: "Manager Proof Request Cancelled",
        description: `${currentUser.name} cancelled the manager proof-upload request.`,
        currentUser,
      });

      await setAutomatedTaskStatus({
        client: tx,
        automationKey: workflowTaskKeys.proofAssistance(order.id),
        status: "CANCELLED",
        actor: currentUser,
        message: `${currentUser.name} cancelled the manager proof-assistance request.`,
      });

      await createWorkflowNotification({
        client: tx,
        title: "Delivery proof request cancelled",
        message: `${currentUser.name} cancelled manager assistance for ${order.orderNumber}.`,
        module: "DELIVERY",
        href: "/internal/delivery-proofs",
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["owner", "manager"],
      });
    });
  } catch (error) {
    redirectFromProofError(error);
  }

  await createSecurityAuditLog({
    eventType: "DELIVERY_PROOF_ASSISTANCE_CANCELLED",
    user: currentUser,
    path: "/field/deliveries",
    description: `${currentUser.name} cancelled manager proof assistance for ${orderNumber}.`,
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/delivery-proofs");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect("/field/deliveries?success=proof-help-cancelled");
}

export async function uploadSignedInvoiceProofAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "upload_delivery_proof",
    "/field/deliveries",
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

  const validatedProof = await readAndValidateDeliveryProof(file, note);

  if ("error" in validatedProof) {
    redirect(`/field/deliveries?error=${validatedProof.error}`);
  }

  let orderNumber = orderId;
  let managerRequestClosedByDriver = false;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await getLockedDeliveryOrder(tx, orderId);

      if (!order) {
        throw new DeliveryProofActionError("order-not-found");
      }

      orderNumber = order.orderNumber;
      assertDriverOwnsDelivery(order, currentUser.id);
      assertProofEligibleStatus(order.status);

      if (
        order.signedInvoiceStatus === "UPLOADED" ||
        (await hasActiveSignedDeliveryProof(tx, order.id))
      ) {
        throw new DeliveryProofActionError("proof-already-uploaded");
      }

      const proofId = randomUUID();
      const insertedRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO public."DeliveryProof" (
          "id",
          "orderId",
          "uploadedById",
          "proofType",
          "uploadMode",
          "deliveredByName",
          "fileName",
          "mimeType",
          "fileDataUrl",
          "fileSizeBytes",
          "fileSha256",
          "note",
          "isActive",
          "uploadedAt"
        )
        VALUES (
          ${proofId},
          ${order.id},
          ${currentUser.id},
          'SIGNED_DUPLICATE_INVOICE',
          ${DeliveryProofUploadMode.DRIVER_SELF}::public."DeliveryProofUploadMode",
          ${order.deliveredByName || currentUser.name},
          ${validatedProof.fileName},
          ${validatedProof.mimeType},
          ${validatedProof.fileDataUrl},
          ${validatedProof.fileSizeBytes},
          ${validatedProof.fileSha256},
          ${note || null},
          TRUE,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT DO NOTHING
        RETURNING "id"
      `;

      if (insertedRows.length === 0) {
        throw new DeliveryProofActionError("proof-already-uploaded");
      }

      managerRequestClosedByDriver =
        order.deliveryProofAssistanceStatus ===
        DeliveryProofAssistanceStatus.REQUESTED;
      const nextStatus =
        order.status === OrderStatus.DELIVERED
          ? OrderStatus.INVOICE_UPLOADED
          : (order.status as OrderStatus);

      await tx.order.update({
        where: { id: order.id },
        data: {
          signedInvoiceStatus: "UPLOADED",
          signedInvoiceUploadedAt: new Date(),
          status: nextStatus,
          deliveryProofAssistanceStatus: managerRequestClosedByDriver
            ? DeliveryProofAssistanceStatus.CANCELLED
            : DeliveryProofAssistanceStatus.NOT_REQUESTED,
          deliveryProofCompletedById: null,
          deliveryProofCompletedByName: null,
          deliveryProofCompletedAt: null,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: order.id,
        fromStatus: order.status as OrderStatus,
        toStatus: nextStatus,
        title: "Signed Duplicate Invoice Uploaded",
        description: `${currentUser.name} uploaded signed duplicate invoice proof${
          note ? ` with note: ${note}` : ""
        }.${
          managerRequestClosedByDriver
            ? " The pending manager-assistance request was closed automatically."
            : ""
        }`,
        currentUser,
      });

      if (managerRequestClosedByDriver) {
        await setAutomatedTaskStatus({
          client: tx,
          automationKey: workflowTaskKeys.proofAssistance(order.id),
          status: "CANCELLED",
          actor: currentUser,
          message: `${currentUser.name} uploaded the proof directly, so manager assistance is no longer required.`,
        });
      }

      await createWorkflowNotification({
        client: tx,
        title: "Signed invoice uploaded",
        message: `${order.orderNumber} signed duplicate invoice proof was uploaded by ${currentUser.name}.`,
        module: "DELIVERY",
        href: "/internal/orders",
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["owner", "manager", "dispatch_team"],
        priority: "HIGH",
      });

      await createWorkflowNotification({
        client: tx,
        title: "Signed invoice available for reporting",
        message: `${order.orderNumber} signed duplicate invoice proof is available in the order report.`,
        module: "ACCOUNTS",
        href: `/internal/reports?report=orders&q=${encodeURIComponent(order.orderNumber)}`,
        orderId: order.id,
        actor: currentUser,
        recipientRoles: ["accountant"],
        priority: "HIGH",
      });

      await createWorkflowNotification({
        client: tx,
        title: "Delivery proof recorded",
        message: `${order.orderNumber} delivery proof has been recorded.`,
        module: "DELIVERY",
        href: "/dealer/orders",
        orderId: order.id,
        actor: currentUser,
        recipientUserIds: [order.dealerId],
      });
    });
  } catch (error) {
    redirectFromProofError(error);
  }

  await createSecurityAuditLog({
    eventType: "DELIVERY_PROOF_UPLOADED",
    user: currentUser,
    path: "/field/deliveries",
    description: `${currentUser.name} uploaded signed duplicate invoice for ${orderNumber}.${
      managerRequestClosedByDriver
        ? " Pending manager assistance was closed automatically."
        : ""
    }`,
  });

  revalidatePath("/field/deliveries");
  revalidatePath("/internal/delivery-proofs");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/orders");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
  revalidatePath("/internal/security");

  redirect("/field/deliveries?success=proof-uploaded");
}
