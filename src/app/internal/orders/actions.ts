"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { syncOrderCalendarById } from "@/lib/google-calendar-sync";
import {
  deriveOrderPayment,
  normalizeOrderPaymentTag,
} from "@/lib/order-payment";
import { createSecurityAuditLog } from "@/lib/security-audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function ordersPath(orderId: string, state: "success" | "error", message: string) {
  const params = new URLSearchParams({
    order: orderId,
    [state]: message,
  });
  return `/internal/orders?${params.toString()}`;
}

export async function updateOrderPaymentAction(formData: FormData) {
  const orderId = clean(formData.get("orderId"));
  if (!orderId) redirect("/internal/orders?error=order-missing");

  const { currentUser, hasAccess } = await checkPermission(
    "manage_collections",
    "/internal/orders",
  );

  if (!hasAccess) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: "/internal/orders",
      description: `User attempted to update payment details for order ${orderId}.`,
    });
    redirect(ordersPath(orderId, "error", "payment-access-denied"));
  }

  const paymentTag = normalizeOrderPaymentTag(formData.get("paymentTag"));
  const amountReceivedValue = Number(clean(formData.get("amountReceived")));
  const timelineValue = clean(formData.get("paymentTimelineAt"));
  const paymentTimelineAt = timelineValue
    ? new Date(`${timelineValue}T12:00:00+05:30`)
    : null;

  if (
    !Number.isFinite(amountReceivedValue) ||
    amountReceivedValue < 0 ||
    (paymentTimelineAt && Number.isNaN(paymentTimelineAt.getTime()))
  ) {
    redirect(ordersPath(orderId, "error", "invalid-payment-details"));
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      items: {
        select: { lineTotal: true },
      },
    },
  });

  if (!order) {
    redirect("/internal/orders?error=order-not-found");
  }

  const payment = deriveOrderPayment({
    orderAmount: order.items.reduce(
      (sum, item) => sum + Number(item.lineTotal),
      0,
    ),
    amountReceived: amountReceivedValue,
  });

  if (Math.round(amountReceivedValue) > payment.orderAmount) {
    redirect(ordersPath(orderId, "error", "amount-exceeds-order-total"));
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentTag,
      ...payment,
      paymentTimelineAt,
      orderCalendarStatus: "READY_TO_SYNC",
      orderCalendarSyncError: null,
    },
  });

  await createSecurityAuditLog({
    eventType: "ORDER_PAYMENT_UPDATED",
    user: currentUser,
    path: "/internal/orders",
    description: `Updated ${order.orderNumber} payment to ${payment.paymentStatus}; received ₹${payment.amountReceived}; outstanding ₹${payment.balanceAmount}.`,
  });

  await syncOrderCalendarById(order.id);

  revalidatePath("/internal/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/internal/dealers");
  revalidatePath("/dealer/orders");
  redirect(ordersPath(order.id, "success", "payment-updated"));
}
