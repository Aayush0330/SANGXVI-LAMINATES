import { OrderItemPriceSource, Prisma } from "@/generated/prisma/client";

type PriceableProduct = {
  dealerPrice: Prisma.Decimal | null;
  sellingPrice: Prisma.Decimal | null;
  gstRate: Prisma.Decimal;
};

export type OrderPriceSnapshot = {
  unitPrice: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  priceSource: OrderItemPriceSource;
};

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function createOrderPriceSnapshot(
  product: PriceableProduct,
  quantity: number,
): OrderPriceSnapshot | null {
  const hasDealerPrice = product.dealerPrice !== null;
  const selectedPrice = product.dealerPrice ?? product.sellingPrice;
  if (selectedPrice === null) return null;

  const unitPrice = money(selectedPrice);
  const gstRate = money(product.gstRate);
  const lineSubtotal = money(unitPrice.mul(quantity));
  const taxAmount = money(lineSubtotal.mul(gstRate).div(100));
  const lineTotal = money(lineSubtotal.add(taxAmount));

  return {
    unitPrice,
    gstRate,
    lineSubtotal,
    taxAmount,
    lineTotal,
    priceSource: hasDealerPrice
      ? OrderItemPriceSource.DEALER_PRICE
      : OrderItemPriceSource.SELLING_PRICE,
  };
}
