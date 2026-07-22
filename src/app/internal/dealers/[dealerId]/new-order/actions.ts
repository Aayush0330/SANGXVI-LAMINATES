"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getDealerProfile, isInternalDealerOrderSource } from "@/lib/dealer-directory";
import { createWorkflowNotification } from "@/lib/notifications";
import { createOrderPriceSnapshot } from "@/lib/order-pricing";
import { recordOrderStatusHistory, type HistoryClient } from "@/lib/order-status-history";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { ensureOrderReceivingTask } from "@/lib/workflow-tasks";
import { OrderSource, OrderStatus } from "@/generated/prisma/client";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function orderPath(dealerId: string) {
  return `/internal/dealers/${encodeURIComponent(dealerId)}/new-order`;
}

function fail(dealerId: string, error: string, extra?: Record<string, string>): never {
  const params = new URLSearchParams({ error, ...(extra ?? {}) });
  redirect(`${orderPath(dealerId)}?${params.toString()}`);
}

async function uniqueOrderNumber() {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `ORD-${year}-${Math.floor(10000 + Math.random() * 90000)}`;
    const exists = await prisma.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `ORD-${year}-${Date.now()}`;
}

type SubmittedItem = { productId?: unknown; quantity?: unknown };

export async function createInternalDealerOrderAction(dealerId: string, formData: FormData) {
  const path = orderPath(dealerId);
  const { currentUser, hasAccess } = await checkPermission("create_internal_dealer_orders", path);
  if (!hasAccess) fail(dealerId, "permission-denied");

  const [dealer, dealerProfile] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, include: { roleAssignments: true } }),
    getDealerProfile(dealerId),
  ]);
  if (!dealer || (dealer.role !== "DEALER" && !dealer.roleAssignments.some((assignment) => assignment.role === "DEALER"))) {
    fail(dealerId, "dealer-not-found");
  }
  if (dealer.status !== "ACTIVE") fail(dealerId, "dealer-inactive");

  const sourceValue = clean(formData.get("source"));
  if (!isInternalDealerOrderSource(sourceValue)) fail(dealerId, "invalid-source");

  const notes = clean(formData.get("notes"));
  const priorityValue = clean(formData.get("priority")).toUpperCase();
  const priority = ["NORMAL", "HIGH", "URGENT"].includes(priorityValue) ? priorityValue : "NORMAL";
  const requiredByValue = clean(formData.get("requiredBy"));
  const requiredBy = requiredByValue ? new Date(`${requiredByValue}T12:00:00+05:30`) : null;
  if (requiredBy && Number.isNaN(requiredBy.getTime())) fail(dealerId, "invalid-required-date");
  if (notes.length > 1000) fail(dealerId, "notes-too-long");

  let submitted: SubmittedItem[] = [];
  try {
    const parsed = JSON.parse(clean(formData.get("itemsJson")) || "[]");
    if (Array.isArray(parsed)) submitted = parsed;
  } catch {
    fail(dealerId, "invalid-items");
  }

  const quantities = new Map<string, number>();
  for (const row of submitted) {
    const productId = String(row.productId ?? "").trim();
    const quantity = Number(row.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100000) fail(dealerId, "invalid-items");
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  const items = Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
  if (!items.length || items.length > 50) fail(dealerId, "invalid-items");

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
    include: { category: true, brand: true },
  });
  if (products.length !== items.length || products.some((product) => !product.isActive)) fail(dealerId, "product-unavailable");

  const productById = new Map(products.map((product) => [product.id, product]));
  const snapshots = items.map((item) => {
    const product = productById.get(item.productId);
    return { ...item, product, snapshot: product ? createOrderPriceSnapshot(product, item.quantity) : null };
  });
  if (snapshots.some((item) => !item.product || !item.snapshot)) fail(dealerId, "pricing-unavailable");

  const stockIssues = snapshots.filter((item) => !item.product || item.product.quantity <= 0 || item.quantity > item.product.quantity);
  if (stockIssues.length) {
    fail(dealerId, "stock-insufficient", {
      products: stockIssues.slice(0, 3).map((item) => item.product?.name ?? "Product").join(", "),
    });
  }

  const orderNumber = await uniqueOrderNumber();
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const transactionResult = await prisma.$transaction(async (tx) => {
    const latestProducts = await tx.product.findMany({
      where: { id: { in: items.map((item) => item.productId) } },
      include: { category: true, brand: true },
    });

    if (latestProducts.length !== items.length || latestProducts.some((product) => !product.isActive)) {
      return { status: "product-unavailable" as const };
    }

    const latestProductById = new Map(latestProducts.map((product) => [product.id, product]));
    const latestSnapshots = items.map((item) => {
      const product = latestProductById.get(item.productId);
      return { ...item, product, snapshot: product ? createOrderPriceSnapshot(product, item.quantity) : null };
    });

    if (latestSnapshots.some((item) => !item.product || !item.snapshot)) {
      return { status: "pricing-unavailable" as const };
    }

    const latestStockIssues = latestSnapshots.filter(
      (item) => !item.product || item.product.quantity <= 0 || item.quantity > item.product.quantity,
    );
    if (latestStockIssues.length) {
      return {
        status: "stock-insufficient" as const,
        products: latestStockIssues
          .slice(0, 3)
          .map((item) => item.product?.name ?? "Product")
          .join(", "),
      };
    }

    const created = await tx.order.create({
      data: {
        orderNumber,
        dealerId,
        source: sourceValue as OrderSource,
        enteredById: currentUser.id,
        enteredByName: currentUser.name,
        enteredByRole: currentUser.role,
        priority,
        requiredBy,
        notes: notes || null,
        items: {
          create: latestSnapshots.map((item) => {
            if (!item.snapshot) throw new Error("ORDER_PRICE_SNAPSHOT_MISSING");
            return {
              productId: item.productId,
              requestedQuantity: item.quantity,
              quantity: item.quantity,
              unitPrice: item.snapshot.unitPrice,
              gstRate: item.snapshot.gstRate,
              lineSubtotal: item.snapshot.lineSubtotal,
              taxAmount: item.snapshot.taxAmount,
              lineTotal: item.snapshot.lineTotal,
              priceSource: item.snapshot.priceSource,
            };
          }),
        },
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: created.id,
      fromStatus: null,
      toStatus: OrderStatus.NEW_ORDER,
      title: "Internal Dealer Order Created",
      description: `${currentUser.name} recorded ${items.length} products and ${totalQuantity} total units from the ${sourceValue.replaceAll("_", " ").toLowerCase()} source.`,
      currentUser,
    });

    await ensureOrderReceivingTask(tx, { orderId: created.id, orderNumber, actor: currentUser });

    await createWorkflowNotification({
      client: tx,
      title: "Internal dealer order created",
      message: `${currentUser.name} created ${orderNumber} for ${dealerProfile?.businessName ?? dealer.name}.`,
      module: "ORDER_RECEIVING",
      href: "/internal/order-receiving",
      orderId: created.id,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "order_team"],
      priority: priority === "URGENT" ? "HIGH_ALERT" : "HIGH",
    });

    await createWorkflowNotification({
      client: tx,
      title: "Order recorded for your account",
      message: `${orderNumber} was recorded by ${currentUser.name}. You can track it in My Orders.`,
      module: "ORDERS",
      href: "/dealer/orders",
      orderId: created.id,
      actor: currentUser,
      recipientUserIds: [dealerId],
      priority: "NORMAL",
    });

    return { status: "created" as const, order: created };
  });

  if (transactionResult.status === "product-unavailable") fail(dealerId, "product-unavailable");
  if (transactionResult.status === "pricing-unavailable") fail(dealerId, "pricing-unavailable");
  if (transactionResult.status === "stock-insufficient") {
    fail(dealerId, "stock-insufficient", { products: transactionResult.products });
  }

  const order = transactionResult.order;

  await createSecurityAuditLog({
    eventType: "INTERNAL_DEALER_ORDER_CREATED",
    user: currentUser,
    path,
    description: `Created ${orderNumber} for dealer ${dealerProfile?.businessName ?? dealer.name}; source ${sourceValue}; order ID ${order.id}.`,
  });

  [
    "/internal/dealers",
    `/internal/dealers/${dealerId}`,
    "/internal/orders",
    "/internal/order-receiving",
    "/internal/dashboard",
    "/internal/reports",
    "/account/tasks",
    "/internal/tasks",
    "/dealer/dashboard",
    "/dealer/orders",
  ].forEach((target) => revalidatePath(target));

  redirect(`/internal/dealers/${dealerId}?success=order-created&orderNumber=${encodeURIComponent(orderNumber)}`);
}
