export type DealerStage = {
  key: string;
  label: string;
  description: string;
};

export const dealerOrderStages: DealerStage[] = [
  {
    key: "placed",
    label: "Order Placed",
    description: "Your order has been submitted.",
  },
  {
    key: "processing",
    label: "Processing",
    description: "Products are being checked and prepared.",
  },
  {
    key: "quality",
    label: "Quality Check",
    description: "The complete ordered quantity is under final review.",
  },
  {
    key: "delivery",
    label: "Ready for Delivery",
    description: "Transport and driver are being prepared.",
  },
  {
    key: "completed",
    label: "Delivered",
    description: "Delivery has been completed.",
  },
];

const statusStageMap: Record<string, number> = {
  NEW_ORDER: 0,
  PENDING_TEAM_ASSIGNMENT: 1,
  PHYSICAL_CHECK_ASSIGNED: 1,
  PHYSICAL_CHECK_IN_PROGRESS: 1,
  PHYSICAL_CHECK_ISSUE: 1,
  QC_REWORK: 1,
  PENDING_STOCK_CHECK: 1,
  STOCK_CHECKED: 1,
  STOCK_BLOCKED: 1,
  BACKORDERED: 1,
  PENDING_QC: 2,
  READY_FOR_DISPATCH: 3,
  QC_APPROVED: 3,
  CANCELLATION_REQUESTED: 1,
  TRANSPORT_ASSIGNED: 3,
  ON_THE_WAY: 3,
  DELIVERED: 4,
  INVOICE_UPLOADED: 4,
  CANCELLED: 4,
};

export function getDealerStageIndex(status: string) {
  return statusStageMap[status] ?? 0;
}

export function getDealerFriendlyStatus(status: string) {
  const labels: Record<string, string> = {
    NEW_ORDER: "Awaiting Confirmation",
    PENDING_TEAM_ASSIGNMENT: "Preparing Order",
    PHYSICAL_CHECK_ASSIGNED: "Preparing Order",
    PHYSICAL_CHECK_IN_PROGRESS: "Processing",
    PHYSICAL_CHECK_ISSUE: "Action Required",
    QC_REWORK: "Processing Update",
    PENDING_STOCK_CHECK: "Stock Review",
    STOCK_CHECKED: "Stock Confirmed",
    STOCK_BLOCKED: "Stock Reserved",
    BACKORDERED: "Backordered",
    PENDING_QC: "Quality Check",
    READY_FOR_DISPATCH: "Ready for Delivery",
    QC_APPROVED: "Ready for Delivery",
    CANCELLATION_REQUESTED: "Cancellation Requested",
    TRANSPORT_ASSIGNED: "Transport Assigned",
    ON_THE_WAY: "Out for Delivery",
    DELIVERED: "Delivered",
    INVOICE_UPLOADED: "Delivered",
    CANCELLED: "Cancelled",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

export function getDealerStatusTone(status: string) {
  if (["DELIVERED", "INVOICE_UPLOADED"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (["ON_THE_WAY", "TRANSPORT_ASSIGNED"].includes(status)) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-300";
  }

  if (["CANCELLED"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300";
  }

  if (["PHYSICAL_CHECK_ISSUE", "QC_REWORK", "CANCELLATION_REQUESTED"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-300";
  }

  if (["PENDING_QC", "QC_APPROVED", "READY_FOR_DISPATCH"].includes(status)) {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-300";
  }

  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-300";
}

export function formatDealerCurrency(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatDealerDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDealerDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getProductAvailability(quantity: number, minimumStock: number) {
  if (quantity <= 0) {
    return {
      label: "Currently Unavailable",
      tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300",
    };
  }

  if (quantity <= minimumStock) {
    return {
      label: "Limited Availability",
      tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-300",
    };
  }

  return {
    label: "Available",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300",
  };
}
