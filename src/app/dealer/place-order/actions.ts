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

function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const randomNumber = Math.floor(10000 + Math.random() * 90000);

  return `ORD-${year}-${randomNumber}`;
}

async function getUniqueOrderNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const orderNumber = generateOrderNumber();

    const existingOrder = await prisma.order.findUnique({
      where: {
        orderNumber,
      },
      select: {
        id: true,
      },
    });

    if (!existingOrder) {
      return orderNumber;
    }
  }

  return `ORD-${new Date().getFullYear()}-${Date.now()}`;
}

export async function createDealerOrderAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("place_dealer_order");

  if (!hasAccess) {
    redirect("/dealer/place-order?error=permission-denied");
  }

  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  if (!productId) {
    redirect("/dealer/place-order?error=missing-product");
  }

  if (Number.isNaN(quantity) || quantity <= 0) {
    redirect("/dealer/place-order?error=invalid-quantity");
  }

  const dealer = await prisma.user.findUnique({
    where: {
      email: currentUser.email,
    },
  });

  if (!dealer) {
    redirect("/dealer/place-order?error=dealer-not-found");
  }

  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (!product) {
    redirect("/dealer/place-order?error=product-not-found");
  }

  if (product.quantity <= 0) {
    redirect("/dealer/place-order?error=out-of-stock");
  }

  const orderNumber = await getUniqueOrderNumber();

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber,
        dealerId: dealer.id,
        notes: notes || null,
        items: {
          create: [
            {
              productId: product.id,
              requestedQuantity: quantity,
              quantity,
              blockedQuantity: 0,
              deliveredQuantity: 0,
              cancelledQuantity: 0,
            },
          ],
        },
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: null,
      toStatus: OrderStatus.NEW_ORDER,
      title: "Order Created",
      description: `${product.name} order created with requested quantity ${quantity}.`,
      currentUser,
    });
  });

  revalidatePath("/dealer/place-order");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/dashboard");

  redirect(
    `/dealer/place-order?success=order-created&orderNumber=${encodeURIComponent(
      orderNumber
    )}`
  );
}
