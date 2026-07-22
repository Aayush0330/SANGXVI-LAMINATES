"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createMissedSaleInquiry } from "@/lib/missed-sales";
import { createWorkflowNotification } from "@/lib/notifications";
import { recordOrderStatusHistory, type HistoryClient } from "@/lib/order-status-history";
import { OrderStatus, Prisma } from "@/generated/prisma/client";
import { createOrderPriceSnapshot } from "@/lib/order-pricing";
import { ensureOrderReceivingTask } from "@/lib/workflow-tasks";
import { deleteDealerCart, getDealerCart } from "@/lib/dealer-cart-db";

function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const randomNumber = Math.floor(10000 + Math.random() * 90000);
  return `ORD-${year}-${randomNumber}`;
}

async function getUniqueOrderNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const existingOrder = await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } });
    if (!existingOrder) return orderNumber;
  }
  return `ORD-${new Date().getFullYear()}-${Date.now()}`;
}

function revalidateOrderPaths() {
  revalidatePath("/dealer/dashboard");
  revalidatePath("/dealer/place-order");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/orders");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
  revalidatePath("/internal/reports");
}

export async function createDealerOrderAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission("place_dealer_order");
  const placeOrderPath = "/dealer/place-order";

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    redirect(`${placeOrderPath}?error=permission-denied`);
  }

  const submittedVersion = Number(formData.get("cartVersion") ?? 0);
  if (!Number.isInteger(submittedVersion) || submittedVersion < 1) {
    redirect(`${placeOrderPath}?error=cart-not-saved`);
  }

  const dealer = await prisma.user.findFirst({
    where: { id: currentUser.id, status: "ACTIVE" },
  });

  if (!dealer) redirect(`${placeOrderPath}?error=dealer-not-found`);

  const cart = await getDealerCart(prisma, dealer.id);

  if (!cart || cart.items.length === 0) redirect(`${placeOrderPath}?error=empty-order`);
  if (cart.version !== submittedVersion) redirect(`${placeOrderPath}?error=cart-conflict`);

  const items = cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  const notes = cart.notes?.trim() ?? "";

  if (items.length > 50 || notes.length > 1000) redirect(`${placeOrderPath}?error=invalid-items`);

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
    include: { category: true, brand: true },
  });

  if (products.length !== items.length || products.some((product) => !product.isActive)) {
    redirect(`${placeOrderPath}?error=product-not-found`);
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const cartItemByProductId = new Map(cart.items.map((item) => [item.productId, item]));

  const currentSnapshots = items.map((item) => {
    const product = productById.get(item.productId);
    return {
      ...item,
      product,
      priceSnapshot: product ? createOrderPriceSnapshot(product, item.quantity) : null,
      unitSnapshot: product ? createOrderPriceSnapshot(product, 1) : null,
    };
  });

  if (currentSnapshots.some((item) => !item.product || !item.priceSnapshot || !item.unitSnapshot)) {
    redirect(`${placeOrderPath}?error=pricing-unavailable`);
  }

  const pricingChanged = currentSnapshots.some((item) => {
    if (!item.unitSnapshot) return true;
    const cartItem = cartItemByProductId.get(item.productId);
    if (!cartItem) return true;
    return (
      !cartItem.unitPriceSnapshot.equals(item.unitSnapshot.unitPrice)
      || !cartItem.gstRateSnapshot.equals(item.unitSnapshot.gstRate)
      || cartItem.priceSourceSnapshot !== item.unitSnapshot.priceSource
    );
  });

  if (pricingChanged) {
    const pricingRefresh = await prisma.$transaction(async (tx) => {
      const latestCart = await getDealerCart(tx, dealer.id, { lock: true });
      if (!latestCart || latestCart.version !== submittedVersion) {
        return { status: "conflict" as const };
      }

      for (const item of currentSnapshots) {
        if (!item.unitSnapshot) continue;
        await tx.$executeRaw(Prisma.sql`
          UPDATE public."DealerCartItem"
          SET
            "unitPriceSnapshot" = ${item.unitSnapshot.unitPrice},
            "gstRateSnapshot" = ${item.unitSnapshot.gstRate},
            "priceSourceSnapshot" = ${item.unitSnapshot.priceSource}::public."OrderItemPriceSource",
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "cartId" = ${latestCart.id} AND "productId" = ${item.productId}
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE public."DealerCart"
        SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${latestCart.id}
      `);
      return { status: "updated" as const };
    });

    revalidatePath(placeOrderPath);
    if (pricingRefresh.status === "conflict") {
      redirect(`${placeOrderPath}?error=cart-conflict`);
    }
    redirect(`${placeOrderPath}?error=cart-pricing-changed`);
  }

  const unavailable = items.filter((item) => {
    const product = productById.get(item.productId);
    return !product || product.quantity <= 0 || item.quantity > product.quantity;
  });

  if (unavailable.length > 0) {
    let firstInquiryNumber = "";
    const names: string[] = [];

    for (const item of unavailable) {
      const product = productById.get(item.productId);
      if (!product) continue;
      names.push(product.name);
      const result = await createMissedSaleInquiry({
        product,
        quantityAsked: item.quantity,
        dealerName: dealer.name,
        dealerPhone: dealer.phone,
        dealerEmail: dealer.email,
        note: notes,
        currentUser,
        path: placeOrderPath,
        status: "MISSED_SALE",
      });
      if (!firstInquiryNumber) firstInquiryNumber = result.inquiryNumber;
    }

    revalidateOrderPaths();
    revalidatePath("/dealer/products");
    revalidatePath("/internal/inquiries");

    redirect(`${placeOrderPath}?error=stock-issues&products=${encodeURIComponent(names.slice(0, 3).join(", "))}&inquiryNumber=${encodeURIComponent(firstInquiryNumber)}`);
  }

  const orderNumber = await getUniqueOrderNumber();
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const transactionResult = await prisma.$transaction(async (tx) => {
    const latestCart = await getDealerCart(tx, dealer.id, { lock: true });

    if (!latestCart || latestCart.version !== submittedVersion) {
      return { status: "conflict" as const };
    }

    const latestProducts = await tx.product.findMany({
      where: { id: { in: latestCart.items.map((item) => item.productId) } },
      select: {
        id: true,
        isActive: true,
        quantity: true,
        dealerPrice: true,
        sellingPrice: true,
        gstRate: true,
      },
    });

    if (latestProducts.length !== latestCart.items.length || latestProducts.some((product) => !product.isActive)) {
      return { status: "product-unavailable" as const };
    }

    const latestProductById = new Map(latestProducts.map((product) => [product.id, product]));
    const transactionItems = latestCart.items.map((cartItem) => {
      const product = latestProductById.get(cartItem.productId);
      return {
        cartItem,
        product,
        unitSnapshot: product ? createOrderPriceSnapshot(product, 1) : null,
        priceSnapshot: product ? createOrderPriceSnapshot(product, cartItem.quantity) : null,
      };
    });

    if (transactionItems.some((item) => !item.product || !item.unitSnapshot || !item.priceSnapshot)) {
      return { status: "pricing-unavailable" as const };
    }

    const transactionPriceChanged = transactionItems.some((item) => {
      if (!item.unitSnapshot) return true;
      return (
        !item.cartItem.unitPriceSnapshot.equals(item.unitSnapshot.unitPrice)
        || !item.cartItem.gstRateSnapshot.equals(item.unitSnapshot.gstRate)
        || item.cartItem.priceSourceSnapshot !== item.unitSnapshot.priceSource
      );
    });

    if (transactionPriceChanged) {
      for (const item of transactionItems) {
        if (!item.unitSnapshot) continue;
        await tx.$executeRaw(Prisma.sql`
          UPDATE public."DealerCartItem"
          SET
            "unitPriceSnapshot" = ${item.unitSnapshot.unitPrice},
            "gstRateSnapshot" = ${item.unitSnapshot.gstRate},
            "priceSourceSnapshot" = ${item.unitSnapshot.priceSource}::public."OrderItemPriceSource",
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${item.cartItem.id}
        `);
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE public."DealerCart"
        SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${latestCart.id}
      `);
      return { status: "pricing-changed" as const };
    }

    if (transactionItems.some((item) => !item.product || item.product.quantity <= 0 || item.cartItem.quantity > item.product.quantity)) {
      return { status: "stock-changed" as const };
    }

    const order = await tx.order.create({
      data: {
        orderNumber,
        dealerId: dealer.id,
        notes: notes || null,
        items: {
          create: transactionItems.map((item) => {
            if (!item.priceSnapshot) throw new Error("ORDER_PRICE_SNAPSHOT_MISSING");
            return {
              productId: item.cartItem.productId,
              requestedQuantity: item.cartItem.quantity,
              quantity: item.cartItem.quantity,
              blockedQuantity: 0,
              deliveredQuantity: 0,
              cancelledQuantity: 0,
              unitPrice: item.priceSnapshot.unitPrice,
              gstRate: item.priceSnapshot.gstRate,
              lineSubtotal: item.priceSnapshot.lineSubtotal,
              taxAmount: item.priceSnapshot.taxAmount,
              lineTotal: item.priceSnapshot.lineTotal,
              priceSource: item.priceSnapshot.priceSource,
            };
          }),
        },
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: null,
      toStatus: OrderStatus.NEW_ORDER,
      title: "Order Created",
      description: `${items.length} product${items.length === 1 ? "" : "s"} ordered with ${totalQuantity} total units from the saved dealer cart.`,
      currentUser,
    });

    await ensureOrderReceivingTask(tx, {
      orderId: order.id,
      orderNumber,
      actor: currentUser,
    });

    await createWorkflowNotification({
      client: tx,
      title: "New dealer order",
      message: `${dealer.name} placed ${orderNumber} with ${items.length} products. Review and confirm receiving.`,
      module: "ORDER_RECEIVING",
      href: "/internal/order-receiving",
      orderId: order.id,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "order_team"],
      priority: "HIGH",
    });

    await deleteDealerCart(tx, latestCart.id);

    return { status: "created" as const };
  });

  if (transactionResult.status === "conflict") {
    redirect(`${placeOrderPath}?error=cart-conflict`);
  }
  if (transactionResult.status === "product-unavailable") {
    redirect(`${placeOrderPath}?error=product-not-found`);
  }
  if (transactionResult.status === "pricing-unavailable") {
    redirect(`${placeOrderPath}?error=pricing-unavailable`);
  }
  if (transactionResult.status === "pricing-changed") {
    revalidatePath(placeOrderPath);
    redirect(`${placeOrderPath}?error=cart-pricing-changed`);
  }
  if (transactionResult.status === "stock-changed") {
    revalidatePath(placeOrderPath);
    redirect(`${placeOrderPath}?error=cart-stock-changed`);
  }

  revalidateOrderPaths();
  redirect(`${placeOrderPath}?success=order-created&orderNumber=${encodeURIComponent(orderNumber)}`);
}
