"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  recordOrderStatusHistory,
  type HistoryClient,
} from "@/lib/order-status-history";
import { OrderStatus } from "@/generated/prisma/client";

export async function approveQcAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("manage_qc");

  if (!hasAccess) {
    redirect("/internal/qc?error=permission-denied");
  }

  const orderId = String(formData.get("orderId") ?? "");

  if (!orderId) {
    redirect("/internal/qc?error=missing-order");
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    redirect("/internal/qc?error=order-not-found");
  }

  if (order.status !== OrderStatus.READY_FOR_DISPATCH) {
    redirect("/internal/qc?error=invalid-status");
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: {
        id: order.id,
      },
      data: {
        status: OrderStatus.QC_APPROVED,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.QC_APPROVED,
      title: "QC Approved",
      description: "Order checked and approved by QC team.",
      currentUser,
    });
  });

  revalidatePath("/internal/qc");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");

  redirect("/internal/qc?success=qc-approved");
}
