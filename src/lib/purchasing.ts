import { randomUUID } from "crypto";

export function cleanText(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function optionalText(value: unknown, max = 240) {
  return cleanText(value, max) || null;
}

export function parseWholeNumber(value: unknown, { min = 0, max = 1_000_000_000 } = {}) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function parseMoney(value: unknown, { allowEmpty = false } = {}) {
  const raw = String(value ?? "").trim().replaceAll(",", "");
  if (!raw && allowEmpty) return null;
  const parsed = Number(raw || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9_999_999_999.99) return undefined;
  return Number(parsed.toFixed(2));
}

export function normalizeSupplierCode(value: unknown) {
  return cleanText(value, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function normalizeGstNumber(value: unknown) {
  const normalized = cleanText(value, 20).toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  return /^[0-9A-Z]{8,20}$/.test(normalized) ? normalized : "INVALID";
}

export function normalizePostalCode(value: unknown) {
  const normalized = cleanText(value, 12).replace(/\D/g, "");
  if (!normalized) return null;
  return normalized.length === 6 ? normalized : "INVALID";
}

export function parseOptionalDate(value: unknown) {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return undefined;
  const normalized = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return normalized === raw ? date : undefined;
}

export function generatePurchaseRequestNumber() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  return `PR-${date}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export function generatePurchaseReceiptNumber() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  return `GRN-${date}-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export function formatIndianMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatBusinessDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function getProductStatusForQuantity(quantity: number, minimumStock: number) {
  if (quantity <= 0) return "OUT_OF_STOCK" as const;
  if (quantity <= minimumStock) return "LOW_STOCK" as const;
  return "AVAILABLE" as const;
}
