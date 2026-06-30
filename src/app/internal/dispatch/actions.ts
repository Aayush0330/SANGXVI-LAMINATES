"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import {
  closeStockBlockTimeline,
  recordStockBlockTimeline,
} from "@/lib/stock-block-timeline";
import {
  OrderStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/client";
import { getCancellationClosureQuantities } from "@/lib/order-fulfillment";

const CANCELLATION_REQUESTED_STATUS = "CANCELLATION_REQUESTED" as OrderStatus;

const INVENTORY_WORKFLOW_ROLES = ["owner", "manager", "inventory_team"];
const DISPATCH_WORKFLOW_ROLES = ["owner", "manager", "dispatch_team"];
const CONTINUE_PARTIAL_ORDER_ROLES = [
  "owner",
  "manager",
  "inventory_team",
  "dispatch_team",
];

function canHandleInventoryWorkflow(role: string) {
  return INVENTORY_WORKFLOW_ROLES.includes(role);
}

function canHandleDispatchWorkflow(role: string) {
  return DISPATCH_WORKFLOW_ROLES.includes(role);
}

function canHandleContinuePartialWorkflow(role: string) {
  return CONTINUE_PARTIAL_ORDER_ROLES.includes(role);
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

function isStockBlockAllowed(status: OrderStatus) {
  const allowedStatuses: OrderStatus[] = [
    OrderStatus.NEW_ORDER,
    OrderStatus.STOCK_CHECKED,
    OrderStatus.BACKORDERED,
    OrderStatus.PARTIALLY_BLOCKED,
    OrderStatus.PARTIALLY_DELIVERED,
  ];

  return allowedStatuses.includes(status);
}

function isReadyForDispatchAllowed(status: OrderStatus) {
  const allowedStatuses: OrderStatus[] = [
    OrderStatus.STOCK_BLOCKED,
    OrderStatus.PARTIALLY_BLOCKED,
  ];

  return allowedStatuses.includes(status);
}

function isQuantityAdjustmentAllowed(status: OrderStatus) {
  const allowedStatuses: OrderStatus[] = [
    OrderStatus.NEW_ORDER,
    OrderStatus.STOCK_CHECKED,
    OrderStatus.BACKORDERED,
    OrderStatus.PARTIALLY_BLOCKED,
    OrderStatus.PARTIALLY_DELIVERED,
  ];

  return allowedStatuses.includes(status);
}

function calculateNextOpenOrderStatus({
  currentStatus,
  requested,
  blocked,
  delivered,
  cancelled,
}: {
  currentStatus: OrderStatus;
  requested: number;
  blocked: number;
  delivered: number;
  cancelled: number;
}) {
  const openQuantity = Math.max(0, requested - delivered - cancelled);
  const unblockedQuantity = Math.max(0, openQuantity - blocked);

  if (openQuantity <= 0) {
    if (delivered > 0) {
      return OrderStatus.DELIVERED;
    }

    return OrderStatus.CANCELLED;
  }

  if (blocked > 0 && unblockedQuantity === 0) {
    return OrderStatus.STOCK_BLOCKED;
  }

  if (blocked > 0 && unblockedQuantity > 0) {
    return OrderStatus.PARTIALLY_BLOCKED;
  }

  if (currentStatus === OrderStatus.NEW_ORDER) {
    return OrderStatus.NEW_ORDER;
  }

  return OrderStatus.BACKORDERED;
}

export async function markStockCheckedAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleInventoryWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/internal/dispatch?error=missing-order");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    redirect("/internal/dispatch?error=order-not-found");
  }

  if (order.status !== OrderStatus.NEW_ORDER) {
    redirect("/internal/dispatch?error=invalid-status");
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: OrderStatus.STOCK_CHECKED,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.STOCK_CHECKED,
      title: "Stock Checked",
      description: "Inventory availability checked for this order.",
      currentUser,
    });
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");

  redirect("/internal/dispatch?success=stock-checked");
}

export async function adjustOrderItemQuantityAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleInventoryWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderItemId = String(formData.get("orderItemId") ?? "");
  const newQuantity = Number(formData.get("newQuantity") ?? 0);

  if (!orderItemId) {
    redirect("/internal/dispatch?error=missing-order-item");
  }

  if (Number.isNaN(newQuantity) || newQuantity <= 0) {
    redirect("/internal/dispatch?error=invalid-adjust-quantity");
  }

  await prisma
    .$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findUnique({
        where: {
          id: orderItemId,
        },
        include: {
          order: true,
          product: true,
        },
      });

      if (!orderItem) {
        throw new Error("ORDER_ITEM_NOT_FOUND");
      }

      if (!isQuantityAdjustmentAllowed(orderItem.order.status)) {
        throw new Error("INVALID_STATUS");
      }

      const deliveredQuantity = orderItem.deliveredQuantity ?? 0;
      const cancelledQuantity = orderItem.cancelledQuantity ?? 0;
      const dealerRequestedQuantity =
        orderItem.requestedQuantity && orderItem.requestedQuantity > 0
          ? orderItem.requestedQuantity
          : orderItem.quantity;
      const minimumAllowedQuantity = deliveredQuantity + cancelledQuantity;

      if (newQuantity < minimumAllowedQuantity) {
        throw new Error("INVALID_ADJUST_QUANTITY");
      }

      if (newQuantity > dealerRequestedQuantity) {
        throw new Error("APPROVED_EXCEEDS_REQUESTED");
      }

      const maxBlockedNeeded = Math.max(
        0,
        newQuantity - deliveredQuantity - cancelledQuantity,
      );
      const quantityToRelease = Math.max(
        0,
        orderItem.blockedQuantity - maxBlockedNeeded,
      );
      const nextBlockedQuantity = orderItem.blockedQuantity - quantityToRelease;

      if (quantityToRelease > 0) {
        const nextAvailableQuantity =
          orderItem.product.quantity + quantityToRelease;
        const nextBlockedStock = Math.max(
          0,
          orderItem.product.blocked - quantityToRelease,
        );

        await tx.product.update({
          where: {
            id: orderItem.productId,
          },
          data: {
            quantity: nextAvailableQuantity,
            blocked: nextBlockedStock,
            status: getProductStatus(
              nextAvailableQuantity,
              orderItem.product.minimumStock,
            ),
          },
        });

        await closeStockBlockTimeline({
          client: tx,
          orderId: orderItem.orderId,
          orderItemId: orderItem.id,
          productId: orderItem.productId,
          quantity: quantityToRelease,
          currentUser,
          status: "RELEASED",
          releaseReason: "ORDER_QUANTITY_ADJUSTED",
          notes: `${quantityToRelease} quantity released because approved order quantity was adjusted.`,
        });
      }

      await tx.orderItem.update({
        where: {
          id: orderItem.id,
        },
        data: {
          requestedQuantity: dealerRequestedQuantity,
          quantity: newQuantity,
          blockedQuantity: nextBlockedQuantity,
        },
      });

      const orderItems = await tx.orderItem.findMany({
        where: {
          orderId: orderItem.orderId,
        },
      });

      const requestedTotal = orderItems.reduce(
        (total, item) => total + item.quantity,
        0,
      );
      const blockedTotal = orderItems.reduce(
        (total, item) => total + item.blockedQuantity,
        0,
      );
      const deliveredTotal = orderItems.reduce(
        (total, item) => total + (item.deliveredQuantity ?? 0),
        0,
      );
      const cancelledTotal = orderItems.reduce(
        (total, item) => total + (item.cancelledQuantity ?? 0),
        0,
      );

      const nextStatus = calculateNextOpenOrderStatus({
        currentStatus: orderItem.order.status,
        requested: requestedTotal,
        blocked: blockedTotal,
        delivered: deliveredTotal,
        cancelled: cancelledTotal,
      });

      await tx.order.update({
        where: {
          id: orderItem.orderId,
        },
        data: {
          status: nextStatus,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: orderItem.orderId,
        fromStatus: orderItem.order.status,
        toStatus: nextStatus,
        title: "Order Quantity Adjusted",
        description: `${orderItem.product.name} approved quantity changed from ${orderItem.quantity} to ${newQuantity}. Dealer requested quantity is ${dealerRequestedQuantity}.${
          quantityToRelease > 0
            ? ` ${quantityToRelease} blocked quantity released back to available stock.`
            : ""
        }`,
        currentUser,
      });
    })
    .catch((error) => {
      if (error instanceof Error) {
        if (error.message === "ORDER_ITEM_NOT_FOUND") {
          redirect("/internal/dispatch?error=order-item-not-found");
        }

        if (error.message === "INVALID_STATUS") {
          redirect("/internal/dispatch?error=invalid-status");
        }

        if (error.message === "INVALID_ADJUST_QUANTITY") {
          redirect("/internal/dispatch?error=invalid-adjust-quantity");
        }

        if (error.message === "APPROVED_EXCEEDS_REQUESTED") {
          redirect("/internal/dispatch?error=approved-exceeds-requested");
        }
      }

      throw error;
    });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/dealer/place-order");
  revalidatePath("/internal/dashboard");

  redirect("/internal/dispatch?success=quantity-adjusted");
}

export async function approveRemainingQuantityAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleContinuePartialWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/internal/dispatch?error=missing-order");
  }

  const allowedStatuses: OrderStatus[] = [
    OrderStatus.BACKORDERED,
    OrderStatus.PARTIALLY_DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.INVOICE_UPLOADED,
  ];

  await prisma
    .$transaction(async (tx) => {
      const order = await tx.order.findUnique({
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
        throw new Error("ORDER_NOT_FOUND");
      }

      if (!allowedStatuses.includes(order.status)) {
        throw new Error("INVALID_STATUS");
      }

      const existingApprovedTotal = order.items.reduce(
        (total, item) => total + item.quantity,
        0,
      );
      const existingBlockedTotal = order.items.reduce(
        (total, item) => total + item.blockedQuantity,
        0,
      );
      const existingDeliveredTotal = order.items.reduce(
        (total, item) => total + (item.deliveredQuantity ?? 0),
        0,
      );
      const existingCancelledTotal = order.items.reduce(
        (total, item) => total + (item.cancelledQuantity ?? 0),
        0,
      );
      const existingOpenApprovedQuantity = Math.max(
        0,
        existingApprovedTotal - existingDeliveredTotal - existingCancelledTotal,
      );

      if (existingOpenApprovedQuantity > 0 || existingBlockedTotal > 0) {
        throw new Error("APPROVED_WORK_NOT_FINISHED");
      }

      let approvedNow = 0;
      let approvedTotalAfter = 0;
      let blockedTotalAfter = 0;
      let deliveredTotalAfter = 0;
      let cancelledTotalAfter = 0;

      for (const item of order.items) {
        const dealerRequestedQuantity =
          item.requestedQuantity && item.requestedQuantity > 0
            ? item.requestedQuantity
            : item.quantity;

        const nextApprovedQuantity = Math.max(
          item.quantity,
          dealerRequestedQuantity,
        );

        const approvedDifference = nextApprovedQuantity - item.quantity;

        if (approvedDifference > 0) {
          await tx.orderItem.update({
            where: {
              id: item.id,
            },
            data: {
              requestedQuantity: dealerRequestedQuantity,
              quantity: nextApprovedQuantity,
            },
          });

          approvedNow += approvedDifference;
        }

        approvedTotalAfter += nextApprovedQuantity;
        blockedTotalAfter += item.blockedQuantity;
        deliveredTotalAfter += item.deliveredQuantity ?? 0;
        cancelledTotalAfter += item.cancelledQuantity ?? 0;
      }

      if (approvedNow <= 0) {
        throw new Error("NO_SHORT_QUANTITY");
      }

      const openApprovedQuantity = Math.max(
        0,
        approvedTotalAfter - deliveredTotalAfter - cancelledTotalAfter,
      );
      const unblockedApprovedQuantity = Math.max(
        0,
        openApprovedQuantity - blockedTotalAfter,
      );

      let nextStatus: OrderStatus = OrderStatus.BACKORDERED;

      if (deliveredTotalAfter > 0 && openApprovedQuantity > 0) {
        nextStatus = OrderStatus.PARTIALLY_DELIVERED;
      } else if (blockedTotalAfter > 0 && unblockedApprovedQuantity === 0) {
        nextStatus = OrderStatus.STOCK_BLOCKED;
      } else if (blockedTotalAfter > 0 && unblockedApprovedQuantity > 0) {
        nextStatus = OrderStatus.PARTIALLY_BLOCKED;
      } else if (order.status === OrderStatus.NEW_ORDER) {
        nextStatus = OrderStatus.STOCK_CHECKED;
      }

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: nextStatus,
          assignedDriverId: null,
        },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: order.id,
        fromStatus: order.status,
        toStatus: nextStatus,
        title: "Remaining Quantity Approved",
        description: `${approvedNow} short quantity moved into approved quantity. It can now be blocked and dispatched in the next cycle.`,
        currentUser,
      });
    })
    .catch((error) => {
      if (error instanceof Error) {
        if (error.message === "ORDER_NOT_FOUND") {
          redirect("/internal/dispatch?error=order-not-found");
        }

        if (error.message === "INVALID_STATUS") {
          redirect("/internal/dispatch?error=invalid-status");
        }

        if (error.message === "NO_SHORT_QUANTITY") {
          redirect("/internal/dispatch?error=no-short-quantity");
        }

        if (error.message === "APPROVED_WORK_NOT_FINISHED") {
          redirect("/internal/dispatch?error=approved-work-not-finished");
        }
      }

      throw error;
    });

  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");

  redirect("/internal/dispatch?success=remaining-approved");
}

export async function blockOrderStockAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleInventoryWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/internal/dispatch?error=missing-order");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    redirect("/internal/dispatch?error=order-not-found");
  }

  if (!isStockBlockAllowed(order.status)) {
    redirect("/internal/dispatch?error=invalid-status");
  }

  let redirectUrl = "/internal/dispatch?success=stock-blocked";

  await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUnique({
      where: {
        id: order.id,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!freshOrder) {
      throw new Error("ORDER_NOT_FOUND");
    }

    let totalBlockedNow = 0;
    let totalRequested = 0;
    let totalBlockedAfter = 0;
    let totalDelivered = 0;
    let totalCancelled = 0;

    for (const item of freshOrder.items) {
      const deliveredQuantity = item.deliveredQuantity ?? 0;
      const cancelledQuantity = item.cancelledQuantity ?? 0;
      const requiredQuantity =
        item.quantity -
        deliveredQuantity -
        cancelledQuantity -
        item.blockedQuantity;
      const blockQuantity = Math.min(
        Math.max(0, requiredQuantity),
        item.product.quantity,
      );

      totalRequested += item.quantity;
      totalDelivered += deliveredQuantity;
      totalCancelled += cancelledQuantity;

      if (blockQuantity <= 0) {
        totalBlockedAfter += item.blockedQuantity;
        continue;
      }

      const nextQuantity = item.product.quantity - blockQuantity;
      const nextBlocked = item.product.blocked + blockQuantity;

      await tx.product.update({
        where: {
          id: item.product.id,
        },
        data: {
          quantity: nextQuantity,
          blocked: nextBlocked,
          status: getProductStatus(nextQuantity, item.product.minimumStock),
        },
      });

      await tx.orderItem.update({
        where: {
          id: item.id,
        },
        data: {
          blockedQuantity: item.blockedQuantity + blockQuantity,
        },
      });

      await recordStockBlockTimeline({
        client: tx,
        order: freshOrder,
        item,
        quantity: blockQuantity,
        currentUser,
        blockReason: "ORDER_STOCK_BLOCKED",
        notes: `${blockQuantity} quantity of ${item.product.name} blocked for ${freshOrder.orderNumber}.`,
      });

      totalBlockedNow += blockQuantity;
      totalBlockedAfter += item.blockedQuantity + blockQuantity;
    }

    const openQuantity = Math.max(
      0,
      totalRequested - totalDelivered - totalCancelled,
    );
    const remainingUnblocked = Math.max(0, openQuantity - totalBlockedAfter);

    let nextStatus: OrderStatus = OrderStatus.STOCK_BLOCKED;
    let historyTitle = "Stock Blocked";
    let successKey = "stock-blocked";

    if (totalBlockedAfter <= 0) {
      nextStatus = OrderStatus.BACKORDERED;
      historyTitle = "Order Backordered";
      successKey = "backordered";
    } else if (remainingUnblocked > 0) {
      nextStatus = OrderStatus.PARTIALLY_BLOCKED;
      historyTitle = "Stock Partially Blocked";
      successKey = "partial-stock-blocked";
    }

    await tx.order.update({
      where: {
        id: freshOrder.id,
      },
      data: {
        status: nextStatus,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: freshOrder.id,
      fromStatus: freshOrder.status,
      toStatus: nextStatus,
      title: historyTitle,
      description:
        totalBlockedNow > 0
          ? `${totalBlockedNow} quantity blocked now. ${remainingUnblocked} quantity still pending.`
          : `No stock was available to block. ${remainingUnblocked} quantity is pending/backordered.`,
      currentUser,
    });

    redirectUrl = `/internal/dispatch?success=${successKey}`;
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/dealer/place-order");
  revalidatePath("/internal/dashboard");

  redirect(redirectUrl);
}

export async function markReadyForDispatchAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleDispatchWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/internal/dispatch?error=missing-order");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
    include: {
      items: true,
    },
  });

  if (!order) {
    redirect("/internal/dispatch?error=order-not-found");
  }

  if (!isReadyForDispatchAllowed(order.status)) {
    redirect("/internal/dispatch?error=invalid-status");
  }

  const blockedQuantity = order.items.reduce(
    (total, item) => total + item.blockedQuantity,
    0,
  );

  if (blockedQuantity <= 0) {
    redirect("/internal/dispatch?error=nothing-to-dispatch");
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: OrderStatus.READY_FOR_DISPATCH,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.READY_FOR_DISPATCH,
      title: "Ready for Dispatch",
      description: `${blockedQuantity} blocked quantity is ready for QC approval and dispatch.`,
      currentUser,
    });
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/qc");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");

  redirect("/internal/dispatch?success=ready-for-dispatch");
}

export async function assignDriverAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleDispatchWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");
  const driverId = String(formData.get("driverId") ?? "");
  const transportOptionId = String(formData.get("transportOptionId") ?? "");

  if (!orderId) {
    redirect("/internal/dispatch?error=missing-order");
  }

  if (!driverId) {
    redirect("/internal/dispatch?error=missing-driver");
  }

  if (!transportOptionId) {
    redirect("/internal/dispatch?error=missing-transport");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    redirect("/internal/dispatch?error=order-not-found");
  }

  if (order.status !== OrderStatus.QC_APPROVED) {
    redirect("/internal/dispatch?error=invalid-status");
  }

  const driver = await prisma.user.findFirst({
    where: {
      id: driverId,
      role: UserRole.DRIVER_TRANSPORT,
      status: UserStatus.ACTIVE,
    },
  });

  if (!driver) {
    redirect("/internal/dispatch?error=driver-not-found");
  }

  const transportOptions = await prisma.$queryRaw<
    { id: string; name: string; isActive: boolean }[]
  >`
    SELECT "id", "name", "isActive"
    FROM "TransportOption"
    WHERE "id" = ${transportOptionId}
    LIMIT 1
  `;

  const transportOption = transportOptions[0];

  if (!transportOption || !transportOption.isActive) {
    redirect("/internal/dispatch?error=transport-not-found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Order"
      SET
        "assignedDriverId" = ${driver.id},
        "transportOptionId" = ${transportOption.id},
        "transportLabel" = ${transportOption.name},
        "signedInvoiceStatus" = 'NOT_UPLOADED',
        "signedInvoiceUploadedAt" = NULL,
        "status" = ${OrderStatus.TRANSPORT_ASSIGNED}::"OrderStatus",
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${order.id}
    `;

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.TRANSPORT_ASSIGNED,
      title: "Transport Assigned",
      description: `${driver.name} assigned for delivery via ${transportOption.name}.`,
      currentUser,
    });
  });

  await createSecurityAuditLog({
    eventType: "TRANSPORT_ASSIGNED",
    user: currentUser,
    path: "/internal/dispatch",
    description: `${order.orderNumber} assigned to ${driver.name} via ${transportOption.name}.`,
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dashboard");

  redirect("/internal/dispatch?success=driver-assigned");
}

export async function approveCancellationRequestAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess || !canHandleDispatchWorkflow(currentUser.role)) {
    redirect("/internal/dispatch?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/internal/dispatch?error=missing-order");
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
    redirect("/internal/dispatch?error=order-not-found");
  }

  if (order.status !== CANCELLATION_REQUESTED_STATUS) {
    redirect("/internal/dispatch?error=invalid-status");
  }

  let nextStatus: OrderStatus = OrderStatus.CANCELLED;
  let releasedQuantity = 0;
  let deliveredTotal = 0;
  let cancelledRemainingQuantity = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const closure = getCancellationClosureQuantities(item);
      const blockedQuantity = item.blockedQuantity;

      // Important: delivered/consumed quantity must never be cancelled or released.
      // Cancellation after partial delivery only closes the remaining dealer-requested quantity.
      deliveredTotal += closure.delivered;
      cancelledRemainingQuantity += closure.cancelled;
      releasedQuantity += blockedQuantity;

      if (blockedQuantity > 0) {
        const nextAvailableQuantity = item.product.quantity + blockedQuantity;
        const nextBlockedStock = Math.max(
          0,
          item.product.blocked - blockedQuantity,
        );

        await tx.product.update({
          where: {
            id: item.productId,
          },
          data: {
            quantity: nextAvailableQuantity,
            blocked: nextBlockedStock,
            status: getProductStatus(
              nextAvailableQuantity,
              item.product.minimumStock,
            ),
          },
        });

        await closeStockBlockTimeline({
          client: tx,
          orderId: order.id,
          orderItemId: item.id,
          productId: item.productId,
          quantity: blockedQuantity,
          currentUser,
          status: "RELEASED",
          releaseReason: "CANCELLATION_APPROVED",
          notes: `${blockedQuantity} blocked quantity released after cancellation approval. Delivered quantity, if any, stays consumed.`,
        });
      }

      await tx.orderItem.update({
        where: {
          id: item.id,
        },
        data: {
          requestedQuantity: closure.requested,
          quantity: closure.workingQuantity,
          blockedQuantity: 0,
          cancelledQuantity: closure.cancelled,
        },
      });
    }

    nextStatus =
      deliveredTotal > 0
        ? OrderStatus.PARTIALLY_CANCELLED
        : OrderStatus.CANCELLED;

    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: nextStatus,
        assignedDriverId: null,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: nextStatus,
      title:
        nextStatus === OrderStatus.PARTIALLY_CANCELLED
          ? "Remaining Quantity Cancelled"
          : "Cancellation Approved",
      description:
        nextStatus === OrderStatus.PARTIALLY_CANCELLED
          ? `${deliveredTotal} quantity was already delivered and stays consumed. ${cancelledRemainingQuantity} remaining quantity was cancelled/closed. ${releasedQuantity} blocked quantity released back to inventory.`
          : `${cancelledRemainingQuantity} quantity cancelled. ${releasedQuantity} blocked quantity released back to inventory.`,
      currentUser,
    });
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dashboard");

  redirect("/internal/dispatch?success=cancellation-approved");
}
