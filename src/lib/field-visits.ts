import type { FieldVisitStatus } from "@/generated/prisma/client";

export const fieldVisitStatuses = [
  "VISIT_REPORTED",
  "GOAL_ACHIEVED",
  "GOAL_PENDING",
  "FOLLOW_UP_REQUIRED",
  "CLOSED",
] as const satisfies readonly FieldVisitStatus[];

export const fieldVisitStatusLabels: Record<FieldVisitStatus, string> = {
  VISIT_REPORTED: "Visit Reported",
  GOAL_ACHIEVED: "Goal Achieved",
  GOAL_PENDING: "Goal Pending",
  FOLLOW_UP_REQUIRED: "Follow Up Required",
  CLOSED: "Closed",
};

export const fieldVisitTypeLabels: Record<string, string> = {
  DEALER_VISIT: "Dealer Visit",
  NEW_DEALER_PROSPECT: "New Dealer Prospect",
  FOLLOW_UP: "Follow Up",
  COLLECTION_SUPPORT: "Collection Support",
  MARKET_SURVEY: "Market Survey",
  OTHER: "Other",
};

export function formatFieldVisitDate(date: Date | string | null | undefined) {
  if (!date) {
    return "Not set";
  }

  const parsed = typeof date === "string" ? new Date(date) : date;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

export function getFieldVisitStatusClass(status: FieldVisitStatus) {
  if (status === "GOAL_ACHIEVED") {
    return "border-emerald-300/25 bg-emerald-50 text-emerald-700";
  }

  if (status === "GOAL_PENDING") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "FOLLOW_UP_REQUIRED") {
    return "border-blue-100 bg-blue-50 text-blue-700";
  }

  if (status === "CLOSED") {
    return "border-slate-300/20 bg-slate-300/10 text-slate-900";
  }

  return "border-purple-200 bg-purple-50 text-purple-700";
}
