import type {
  CollectionPaymentMode,
  CollectionStatus,
} from "@/generated/prisma/client";

export const collectionStatuses = [
  "ASSIGNED",
  "ON_THE_WAY",
  "REACHED",
  "PARTIALLY_COLLECTED",
  "COLLECTED",
  "FAILED",
  "RESCHEDULED",
  "VERIFIED",
  "CANCELLED",
] as const satisfies readonly CollectionStatus[];

export const collectionStatusLabels: Record<CollectionStatus, string> = {
  ASSIGNED: "Assigned",
  ON_THE_WAY: "On The Way",
  REACHED: "Reached",
  PARTIALLY_COLLECTED: "Partially Collected",
  COLLECTED: "Collected",
  FAILED: "Failed",
  RESCHEDULED: "Rescheduled",
  VERIFIED: "Verified",
  CANCELLED: "Cancelled",
};

export const collectionPaymentModes = [
  "CASH",
  "CHEQUE",
  "UPI",
  "BANK_TRANSFER",
  "OWNER_COLLECTED",
  "OTHER",
] as const satisfies readonly CollectionPaymentMode[];

export const collectionPaymentModeLabels: Record<
  CollectionPaymentMode,
  string
> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  OWNER_COLLECTED: "Collected By Owner",
  OTHER: "Other",
};

export function formatCurrency(amount: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function formatCollectionDate(
  date: Date | string | null | undefined
) {
  if (!date) return "Not set";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function getPendingCollectionAmount(
  amountToCollect: number,
  amountCollected: number
) {
  return Math.max(0, amountToCollect - amountCollected);
}

export function isCollectionOverdue(
  dueAt: Date | string | null | undefined,
  status: CollectionStatus
) {
  if (!dueAt || ["COLLECTED", "VERIFIED", "CANCELLED"].includes(status)) {
    return false;
  }

  return new Date(dueAt).getTime() < Date.now();
}

export function getCollectionStatusClass(status: CollectionStatus) {
  if (status === "VERIFIED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "COLLECTED" || status === "PARTIALLY_COLLECTED") {
    return "border-blue-100 bg-blue-50 text-blue-600";
  }
  if (status === "ON_THE_WAY" || status === "REACHED") {
    return "border-blue-300/20 bg-blue-300/10 text-blue-300";
  }
  if (status === "FAILED" || status === "CANCELLED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "RESCHEDULED") {
    return "border-amber-200 bg-amber-50 text-yellow-300";
  }
  return "border-slate-300/20 bg-slate-300/10 text-slate-600";
}
