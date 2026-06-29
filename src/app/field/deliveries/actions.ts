"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import { OrderStatus, ProductStatus } from "@/generated/prisma/client";

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
        assignedDriverId:
          nextStatus === OrderStatus.PARTIALLY_DELIVERED
            ? null
            : order.assignedDriverId,
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
