import type { Prisma } from "@/generated/prisma/client";

export const dealerOrderSourceOptions = [
  { value: "MANUAL_ENTRY", label: "Internal Manual" },
  { value: "PHONE", label: "Phone" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "WHATSAPP", label: "WhatsApp (source only)" },
  { value: "SALES_FIELD", label: "Sales / Field" },
] as const;

export type InternalDealerOrderSource =
  (typeof dealerOrderSourceOptions)[number]["value"];

const sourceLabels: Record<string, string> = {
  DEALER_PORTAL: "Dealer Portal",
  MANUAL_ENTRY: "Internal Manual",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  WHATSAPP: "WhatsApp (recorded source)",
  SALES_FIELD: "Sales / Field",
};

export function getOrderSourceLabel(source: string) {
  return (
    sourceLabels[source] ??
    source
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export function isInternalDealerOrderSource(
  value: string,
): value is InternalDealerOrderSource {
  return dealerOrderSourceOptions.some((option) => option.value === value);
}

export function formatDealerAccountCurrency(
  value: number | string | Prisma.Decimal,
) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDealerDirectoryDate(
  value: Date | string | null | undefined,
) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
