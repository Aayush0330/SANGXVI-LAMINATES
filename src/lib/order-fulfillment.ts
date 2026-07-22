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

function getOrderedQuantity(
  item: Pick<FulfillmentItem, "requestedQuantity" | "quantity">,
) {
  return item.requestedQuantity && item.requestedQuantity > 0
    ? item.requestedQuantity
    : item.quantity;
}

export function getCancellationClosureQuantities(
  item: Pick<
    FulfillmentItem,
    "requestedQuantity" | "quantity" | "deliveredQuantity"
  >,
) {
  const requested = getOrderedQuantity(item);
  const delivered = Math.min(
    requested,
    Math.max(0, item.deliveredQuantity ?? 0),
  );

  return {
    requested,
    delivered,
    cancelled: Math.max(0, requested - delivered),
    workingQuantity: requested,
  };
}

export function getOrderDisplayName(items: OrderDisplayItem[]) {
  const firstProductName = items[0]?.product.name;

  if (!firstProductName) return "Order";
  if (items.length === 1) return firstProductName;
  return `${firstProductName} +${items.length - 1} more`;
}

export function getItemFulfillmentSummary(item: FulfillmentItem) {
  const requested = getOrderedQuantity(item);
  const blocked = Math.min(requested, Math.max(0, item.blockedQuantity));
  const delivered = Math.min(
    requested,
    Math.max(0, item.deliveredQuantity ?? 0),
  );
  const cancelled = Math.min(
    requested,
    Math.max(0, item.cancelledQuantity ?? 0),
  );

  return {
    requested,
    blocked,
    delivered,
    cancelled,
    isFullyReserved: requested > 0 && blocked === requested,
    isFullyDelivered: requested > 0 && delivered === requested,
  };
}

export function getOrderFulfillmentSummary(items: FulfillmentItem[]) {
  return items.reduce(
    (summary, item) => {
      const itemSummary = getItemFulfillmentSummary(item);
      return {
        requested: summary.requested + itemSummary.requested,
        blocked: summary.blocked + itemSummary.blocked,
        delivered: summary.delivered + itemSummary.delivered,
        cancelled: summary.cancelled + itemSummary.cancelled,
      };
    },
    { requested: 0, blocked: 0, delivered: 0, cancelled: 0 },
  );
}

export function getOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    NEW_ORDER: "New Order",
    PENDING_TEAM_ASSIGNMENT: "Pending Team Assignment",
    PHYSICAL_CHECK_ASSIGNED: "Physical Team Assigned",
    PHYSICAL_CHECK_IN_PROGRESS: "Physical Check in Progress",
    PHYSICAL_CHECK_ISSUE: "Physical Check Blocked",
    QC_REWORK: "QC Rework",
    PENDING_STOCK_CHECK: "Legacy: Pending Stock Check",
    STOCK_CHECKED: "Stock Checked",
    STOCK_BLOCKED: "Stock Blocked",
    BACKORDERED: "Backordered",
    PENDING_QC: "Pending QC",
    READY_FOR_DISPATCH: "Ready for Dispatch",
    QC_APPROVED: "QC Approved",
    CANCELLATION_REQUESTED: "Cancellation Requested",
    TRANSPORT_ASSIGNED: "Transport Assigned",
    ON_THE_WAY: "On The Way",
    DELIVERED: "Delivered",
    INVOICE_UPLOADED: "Invoice Uploaded",
    CANCELLED: "Cancelled",
  };

  return labels[status] ?? status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getDarkOrderStatusClass(status: string) {
  if (status === "DELIVERED" || status === "INVOICE_UPLOADED") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "CANCELLATION_REQUESTED") {
    return "bg-amber-300/10 text-amber-300";
  }
  if (status === "CANCELLED") return "bg-red-50 text-red-700";
  if (status === "PHYSICAL_CHECK_ISSUE" || status === "QC_REWORK") {
    return "bg-rose-50 text-rose-700";
  }
  if (status === "PHYSICAL_CHECK_IN_PROGRESS") {
    return "bg-blue-50 text-blue-700";
  }
  if (status === "PHYSICAL_CHECK_ASSIGNED" || status === "PENDING_TEAM_ASSIGNMENT") {
    return "bg-cyan-50 text-cyan-700";
  }
  if (status === "BACKORDERED") return "bg-rose-50 text-rose-700";
  if (status === "STOCK_BLOCKED") return "bg-purple-50 text-purple-700";
  if (status === "READY_FOR_DISPATCH") return "bg-blue-300/10 text-blue-300";
  if (status === "QC_APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "TRANSPORT_ASSIGNED") return "bg-indigo-300/10 text-indigo-300";
  if (status === "ON_THE_WAY") return "bg-orange-50 text-orange-600";
  if (status === "STOCK_CHECKED") return "bg-blue-50 text-blue-600";
  if (status === "PENDING_STOCK_CHECK") return "bg-cyan-50 text-cyan-700";
  if (status === "PENDING_QC") return "bg-violet-50 text-violet-700";
  return "bg-amber-50 text-yellow-700";
}

export function getLightOrderStatusClass(status: string) {
  if (status === "DELIVERED" || status === "INVOICE_UPLOADED") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "CANCELLATION_REQUESTED") {
    return "bg-amber-100 text-amber-700";
  }
  if (status === "CANCELLED") return "bg-red-100 text-red-700";
  if (status === "PHYSICAL_CHECK_ISSUE" || status === "QC_REWORK") {
    return "bg-rose-100 text-rose-700";
  }
  if (status === "PHYSICAL_CHECK_IN_PROGRESS") {
    return "bg-blue-100 text-blue-700";
  }
  if (status === "PHYSICAL_CHECK_ASSIGNED" || status === "PENDING_TEAM_ASSIGNMENT") {
    return "bg-cyan-100 text-cyan-700";
  }
  if (status === "BACKORDERED") return "bg-rose-100 text-rose-700";
  if (status === "ON_THE_WAY" || status === "TRANSPORT_ASSIGNED") {
    return "bg-blue-100 text-blue-700";
  }
  if (status === "QC_APPROVED" || status === "READY_FOR_DISPATCH" || status === "PENDING_QC") {
    return "bg-purple-100 text-purple-700";
  }
  if (status === "STOCK_BLOCKED") return "bg-indigo-100 text-indigo-700";
  if (status === "PENDING_STOCK_CHECK") return "bg-cyan-100 text-cyan-700";
  return "bg-yellow-100 text-yellow-700";
}
