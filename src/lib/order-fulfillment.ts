export type FulfillmentItem = {
  requestedQuantity?: number | null;
  quantity: number;
  blockedQuantity: number;
  deliveredQuantity?: number | null;
  cancelledQuantity?: number | null;
};

export type OrderDisplayItem = {
  product: {
    name: string;
  };
};

export function getOrderDisplayName(items: OrderDisplayItem[]) {
  const firstProductName = items[0]?.product.name;

  if (!firstProductName) {
    return "Order";
  }

  if (items.length === 1) {
    return firstProductName;
  }

  return `${firstProductName} +${items.length - 1} more`;
}

export function getItemFulfillmentSummary(item: FulfillmentItem) {
  const requested =
    item.requestedQuantity && item.requestedQuantity > 0
      ? item.requestedQuantity
      : item.quantity;

  // quantity is now the internal approved / working quantity.
  // requestedQuantity is the original dealer requested quantity.
  const approved = item.quantity;
  const blocked = item.blockedQuantity;
  const delivered = item.deliveredQuantity ?? 0;
  const cancelled = item.cancelledQuantity ?? 0;

  // Pending is only from the internally approved quantity.
  // Example: dealer requested 150, approved 100, delivered 100 => pending 0 and short 50.
  const pending = Math.max(0, approved - delivered - cancelled);
  const unblockedPending = Math.max(
    0,
    approved - delivered - cancelled - blocked
  );
  const shortQuantity = Math.max(0, requested - approved);

  return {
    requested,
    approved,
    blocked,
    delivered,
    cancelled,
    pending,
    unblockedPending,
    shortQuantity,
  };
}

export function getOrderFulfillmentSummary(items: FulfillmentItem[]) {
  return items.reduce(
    (summary, item) => {
      const itemSummary = getItemFulfillmentSummary(item);

      return {
        requested: summary.requested + itemSummary.requested,
        approved: summary.approved + itemSummary.approved,
        blocked: summary.blocked + itemSummary.blocked,
        delivered: summary.delivered + itemSummary.delivered,
        cancelled: summary.cancelled + itemSummary.cancelled,
        pending: summary.pending + itemSummary.pending,
        unblockedPending:
          summary.unblockedPending + itemSummary.unblockedPending,
        shortQuantity: summary.shortQuantity + itemSummary.shortQuantity,
      };
    },
    {
      requested: 0,
      approved: 0,
      blocked: 0,
      delivered: 0,
      cancelled: 0,
      pending: 0,
      unblockedPending: 0,
      shortQuantity: 0,
    }
  );
}

export function getOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    NEW_ORDER: "New Order",
    STOCK_CHECKED: "Stock Checked",
    STOCK_BLOCKED: "Stock Blocked",
    PARTIALLY_BLOCKED: "Partially Blocked",
    BACKORDERED: "Backordered",
    READY_FOR_DISPATCH: "Ready for Dispatch",
    QC_APPROVED: "QC Approved",
    CANCELLATION_REQUESTED: "Cancellation Requested",
    TRANSPORT_ASSIGNED: "Transport Assigned",
    ON_THE_WAY: "On The Way",
    PARTIALLY_DELIVERED: "Partially Delivered",
    DELIVERED: "Delivered",
    INVOICE_UPLOADED: "Invoice Uploaded",
    PARTIALLY_CANCELLED: "Partially Cancelled",
    CANCELLED: "Cancelled",
  };

  return (
    labels[status] ??
    status
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function getDarkOrderStatusClass(status: string) {
  if (status === "DELIVERED") {
    return "bg-emerald-300/10 text-emerald-300";
  }

  if (status === "PARTIALLY_DELIVERED") {
    return "bg-teal-300/10 text-teal-300";
  }

  if (status === "CANCELLATION_REQUESTED") {
    return "bg-amber-300/10 text-amber-300";
  }

  if (status === "CANCELLED" || status === "PARTIALLY_CANCELLED") {
    return "bg-red-300/10 text-red-300";
  }

  if (status === "BACKORDERED") {
    return "bg-rose-300/10 text-rose-300";
  }

  if (status === "PARTIALLY_BLOCKED") {
    return "bg-fuchsia-300/10 text-fuchsia-300";
  }

  if (status === "STOCK_BLOCKED") {
    return "bg-purple-300/10 text-purple-300";
  }

  if (status === "READY_FOR_DISPATCH") {
    return "bg-blue-300/10 text-blue-300";
  }

  if (status === "QC_APPROVED") {
    return "bg-emerald-300/10 text-emerald-300";
  }

  if (status === "TRANSPORT_ASSIGNED") {
    return "bg-indigo-300/10 text-indigo-300";
  }

  if (status === "ON_THE_WAY") {
    return "bg-orange-300/10 text-orange-300";
  }

  if (status === "STOCK_CHECKED") {
    return "bg-cyan-300/10 text-cyan-300";
  }

  return "bg-yellow-300/10 text-yellow-300";
}

export function getLightOrderStatusClass(status: string) {
  if (status === "DELIVERED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "PARTIALLY_DELIVERED") {
    return "bg-teal-100 text-teal-700";
  }

  if (status === "CANCELLATION_REQUESTED") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "CANCELLED" || status === "PARTIALLY_CANCELLED") {
    return "bg-red-100 text-red-700";
  }

  if (status === "BACKORDERED") {
    return "bg-rose-100 text-rose-700";
  }

  if (status === "PARTIALLY_BLOCKED") {
    return "bg-fuchsia-100 text-fuchsia-700";
  }

  if (status === "ON_THE_WAY" || status === "TRANSPORT_ASSIGNED") {
    return "bg-blue-100 text-blue-700";
  }

  if (status === "QC_APPROVED" || status === "READY_FOR_DISPATCH") {
    return "bg-purple-100 text-purple-700";
  }

  if (status === "STOCK_BLOCKED") {
    return "bg-indigo-100 text-indigo-700";
  }

  return "bg-yellow-100 text-yellow-700";
}
