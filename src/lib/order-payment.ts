export const orderPaymentTags = [
  "NORMAL_PAYMENT",
  "CREDIT",
  "CASH_IN_CARRY",
] as const;

export type OrderPaymentTagValue = (typeof orderPaymentTags)[number];
export type OrderPaymentStatusValue =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED";

export const orderPaymentTagOptions: Array<{
  value: OrderPaymentTagValue;
  label: string;
}> = [
  { value: "NORMAL_PAYMENT", label: "Normal Payment" },
  { value: "CREDIT", label: "Credit" },
  { value: "CASH_IN_CARRY", label: "Cash-and-Carry" },
];

export function normalizeOrderPaymentTag(
  value: FormDataEntryValue | string | null | undefined,
): OrderPaymentTagValue {
  const normalized = String(value ?? "").trim().toUpperCase();
  return orderPaymentTags.includes(normalized as OrderPaymentTagValue)
    ? (normalized as OrderPaymentTagValue)
    : "NORMAL_PAYMENT";
}

export function deriveOrderPayment({
  orderAmount,
  amountReceived,
}: {
  orderAmount: number;
  amountReceived: number;
}) {
  const normalizedOrderAmount = Math.max(0, Math.round(orderAmount));
  const normalizedAmountReceived = Math.min(
    normalizedOrderAmount,
    Math.max(0, Math.round(amountReceived)),
  );
  const balanceAmount = Math.max(
    normalizedOrderAmount - normalizedAmountReceived,
    0,
  );
  const paymentStatus: OrderPaymentStatusValue =
    normalizedOrderAmount > 0 &&
    normalizedAmountReceived >= normalizedOrderAmount
      ? "COMPLETED"
      : normalizedAmountReceived > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  return {
    orderAmount: normalizedOrderAmount,
    amountReceived: normalizedAmountReceived,
    balanceAmount,
    paymentStatus,
  };
}

export function getOrderPaymentTagLabel(value: string) {
  return (
    orderPaymentTagOptions.find((option) => option.value === value)?.label ??
    "Normal Payment"
  );
}

export function getOrderPaymentStatusLabel(value: string) {
  if (value === "COMPLETED") return "Completed";
  if (value === "IN_PROGRESS") return "In Progress";
  return "Not Started";
}
