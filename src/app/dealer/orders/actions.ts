"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import {
  cancelAutomatedTasksForOrder,
  pauseAutomatedTasksForOrder,
} from "@/lib/workflow-tasks";
import { closeStockBlockTimeline } from "@/lib/stock-block-timeline";
import { getCancellationClosureQuantities } from "@/lib/order-fulfillment";
import { createWorkflowNotification } from "@/lib/notifications";
import { OrderStatus, ProductStatus } from "@/generated/prisma/client";

const CANCELLATION_REQUESTED_STATUS = "CANCELLATION_REQUESTED" as OrderStatus;

const DIRECT_DEALER_CANCEL_STATUSES: OrderStatus[] = [
  OrderStatus.NEW_ORDER,
  OrderStatus.PENDING_TEAM_ASSIGNMENT,
  OrderStatus.PENDING_STOCK_CHECK,
  OrderStatus.STOCK_CHECKED,
  OrderStatus.BACKORDERED,
];

const DEALER_CANCEL_REQUEST_STATUSES: OrderStatus[] = [
  OrderStatus.PHYSICAL_CHECK_ASSIGNED,
  OrderStatus.PHYSICAL_CHECK_IN_PROGRESS,
  OrderStatus.PHYSICAL_CHECK_ISSUE,
  OrderStatus.QC_REWORK,
  OrderStatus.STOCK_BLOCKED,
  OrderStatus.PENDING_QC,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.QC_APPROVED,
  OrderStatus.TRANSPORT_ASSIGNED,
];

function getProductStatus(quantity: number, minimumStock: number) {
  if (quantity <= 0) {
    return ProductStatus.OUT_OF_STOCK;
  }

  if (quantity <= minimumStock) {
    return ProductStatus.LOW_STOCK;
  }

  return ProductStatus.AVAILABLE;
}

async function cancelOrderAndReleaseStock({
  tx,
  orderId,
  currentUser,
}: {
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
  orderId: string;
  currentUser: Awaited<ReturnType<typeof checkPermission>>["currentUser"];
}) {
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

  for (const item of order.items) {
    const closure = getCancellationClosureQuantities(item);
    const blockedQuantity = item.blockedQuantity;

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
        releaseReason: "DEALER_DIRECT_CANCELLED",
        notes: `${blockedQuantity} reserved quantity released after dealer cancellation.`,
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

  return OrderStatus.CANCELLED;
}

export async function cancelDealerOrderAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "track_dealer_orders",
  );

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    redirect("/dealer/orders?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!orderId) redirect("/dealer/orders?error=missing-order");

  const dealer = await prisma.user.findFirst({
    where: { id: currentUser.id, status: "ACTIVE" },
  });
  if (!dealer) redirect("/dealer/orders?error=dealer-not-found");

  const order = await prisma.order.findFirst({
    where: { id: orderId, dealerId: dealer.id },
  });
  if (!order) redirect("/dealer/orders?error=order-not-found");

  if (
    [
      OrderStatus.ON_THE_WAY,
      OrderStatus.DELIVERED,
      OrderStatus.INVOICE_UPLOADED,
      OrderStatus.CANCELLED,
      CANCELLATION_REQUESTED_STATUS,
    ].includes(order.status)
  ) {
    redirect("/dealer/orders?error=cancel-not-allowed");
  }

  if (DIRECT_DEALER_CANCEL_STATUSES.includes(order.status)) {
    try {
      await prisma.$transaction(async (tx) => {
        const transitioned = await tx.order.updateMany({
          where: { id: order.id, dealerId: dealer.id, status: order.status },
          data: { status: OrderStatus.CANCELLED, assignedDriverId: null },
        });
        if (transitioned.count !== 1) throw new Error("ORDER_STATUS_CHANGED");

        const nextStatus = await cancelOrderAndReleaseStock({
          tx,
          orderId: order.id,
          currentUser,
        });

        await recordOrderStatusHistory({
          client: tx as unknown as HistoryClient,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          title: "Order Cancelled by Dealer",
          description:
            reason || "Dealer cancelled the order before dispatch processing.",
          currentUser,
        });

        await cancelAutomatedTasksForOrder({
          client: tx,
          orderId: order.id,
          actor: currentUser,
          message: `${currentUser.name} cancelled the order before operational processing.`,
        });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ["ORDER_STATUS_CHANGED", "ORDER_NOT_FOUND"].includes(error.message)
      ) {
        redirect("/dealer/orders?error=cancel-not-allowed");
      }
      throw error;
    }

    revalidatePath("/dealer/orders");
    revalidatePath("/internal/dispatch");
    revalidatePath("/internal/inventory");
    revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
    redirect("/dealer/orders?success=order-cancelled");
  }

  if (DEALER_CANCEL_REQUEST_STATUSES.includes(order.status)) {
    try {
      await prisma.$transaction(async (tx) => {
        const transitioned = await tx.order.updateMany({
          where: { id: order.id, dealerId: dealer.id, status: order.status },
          data: {
            status: CANCELLATION_REQUESTED_STATUS,
            cancellationPreviousStatus: order.status,
            cancellationRequestedAt: new Date(),
            cancellationRequestedById: currentUser.id,
            cancellationRequestedByName: currentUser.name,
            cancellationRequestReason:
              reason || "Dealer requested cancellation.",
            cancellationDecidedAt: null,
            cancellationDecidedById: null,
            cancellationDecidedByName: null,
            cancellationDecisionReason: null,
          },
        });
        if (transitioned.count !== 1) throw new Error("ORDER_STATUS_CHANGED");

        await recordOrderStatusHistory({
          client: tx as unknown as HistoryClient,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: CANCELLATION_REQUESTED_STATUS,
          title: "Cancellation Requested by Dealer",
          description:
            reason ||
            "Dealer requested cancellation. Internal team must approve and release stock if required.",
          currentUser,
        });

        await pauseAutomatedTasksForOrder({
          client: tx,
          orderId: order.id,
          actor: currentUser,
          reason: `Dealer cancellation requested${reason ? `: ${reason}` : "."}`,
        });

        await createWorkflowNotification({
          client: tx,
          title: "Dealer cancellation request",
          message: `${order.orderNumber} cancellation requires management approval.${reason ? ` Reason: ${reason}` : ""}`,
          module: "ORDERS",
          href: "/internal/dispatch",
          orderId: order.id,
          actor: currentUser,
          recipientRoles: ["owner", "manager"],
          priority: "HIGH",
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_STATUS_CHANGED") {
        redirect("/dealer/orders?error=cancel-not-allowed");
      }
      throw error;
    }

    revalidatePath("/dealer/orders");
    revalidatePath("/internal/dispatch");
    revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
    redirect("/dealer/orders?success=cancellation-requested");
  }

  redirect("/dealer/orders?error=cancel-not-allowed");
}
