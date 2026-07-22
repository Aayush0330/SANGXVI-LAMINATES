import { prisma } from "./db";
import { createWorkflowNotification } from "./notifications";

export async function syncLowStockReorderAlerts() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      isActive: true,
      quantity: true,
      blocked: true,
      minimumStock: true,
      maximumStock: true,
      purchaseRequestItems: {
        where: {
          purchaseRequest: {
            status: { in: ["APPROVED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] },
          },
        },
        select: {
          requestedQuantity: true,
          approvedQuantity: true,
          orderedQuantity: true,
          receivedQuantity: true,
          damagedQuantity: true,
          rejectedQuantity: true,
        },
      },
    },
  });

  let opened = 0;
  let resolved = 0;

  for (const product of products) {
    const available = Math.max(0, product.quantity - product.blocked);
    const dedupeKey = `low-stock:${product.id}`;
    if (product.isActive && product.minimumStock > 0 && available <= product.minimumStock) {
      const onOrder = product.purchaseRequestItems.reduce((sum, item) => {
        const target = item.orderedQuantity || item.approvedQuantity || item.requestedQuantity;
        return sum + Math.max(0, target - item.receivedQuantity - item.damagedQuantity - item.rejectedQuantity);
      }, 0);
      const suggested = Math.max(0, product.maximumStock - available - onOrder);
      await createWorkflowNotification({
        title: available <= 0 ? "Product out of stock" : "Low stock requires reorder",
        message: `${product.name} (${product.code}) has ${available} ${product.unit} available against minimum ${product.minimumStock}. ${onOrder} already on order; suggested additional reorder: ${suggested}.`,
        module: "PURCHASING",
        href: "/internal/reorder",
        recipientRoles: ["owner", "manager"],
        priority: available <= 0 ? "BLOCKER" : "HIGH_ALERT",
        dedupeKey,
      });
      opened += 1;
    } else {
      const result = await prisma.notification.updateMany({
        where: { dedupeKey, status: { not: "RESOLVED" } },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNote: "Stock is now above the configured minimum level.",
        },
      });
      resolved += result.count;
    }
  }

  return { scanned: products.length, opened, resolved };
}
