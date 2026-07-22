import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { InventoryInsightsClient } from "./inventory-insights-client";

export type InventoryInsightRow = {
  id: string;
  code: string;
  name: string;
  stack: string;
  quantity: number | bigint | string;
  blocked: number | bigint | string;
  minimumStock: number | bigint | string;
  maximumStock: number | bigint | string;
  unit: string;
  categoryName: string;
  brandName: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  activeBlockedQuantity: number | bigint | string | null;
  totalRequested: number | bigint | string | null;
  totalOrdered: number | bigint | string | null;
  totalSold: number | bigint | string | null;
  totalCancelled: number | bigint | string | null;
  orderLineCount: number | bigint | string | null;
  saleLineCount: number | bigint | string | null;
  lastOrderAt: Date | string | null;
  lastSaleAt: Date | string | null;
  lastSaleQuantity: number | bigint | string | null;
  lastSaleOrderNumber: string | null;
  highestSingleSale: number | bigint | string | null;
  highestSaleOrderNumber: string | null;
  highestSaleAt: Date | string | null;
  salesLast30Days: number | bigint | string | null;
  salesLast90Days: number | bigint | string | null;
  inquiryCount: number | bigint | string | null;
  inquiryDemand: number | bigint | string | null;
  missedSalesDemand: number | bigint | string | null;
  missedSalesInquiryCount: number | bigint | string | null;
};

export type InventoryInsight = {
  id: string;
  code: string;
  name: string;
  stack: string;
  quantity: number;
  blocked: number;
  minimumStock: number;
  maximumStock: number;
  unit: string;
  categoryName: string;
  brandName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  activeBlockedQuantity: number;
  availableStock: number;
  totalRequested: number;
  totalOrdered: number;
  totalSold: number;
  totalCancelled: number;
  orderLineCount: number;
  saleLineCount: number;
  lastOrderAt: string | null;
  lastSaleAt: string | null;
  lastSaleQuantity: number;
  lastSaleOrderNumber: string | null;
  highestSingleSale: number;
  highestSaleOrderNumber: string | null;
  highestSaleAt: string | null;
  salesLast30Days: number;
  salesLast90Days: number;
  inquiryCount: number;
  inquiryDemand: number;
  missedSalesDemand: number;
  missedSalesInquiryCount: number;
  stockAgeDays: number;
  daysWithoutSale: number;
  sellThroughPercent: number;
  tag:
    | "OUT_OF_STOCK"
    | "REORDER"
    | "TOP_SELLER"
    | "SELLING"
    | "SLOW_MOVING"
    | "NO_SALE"
    | "WATCH"
    | "HEALTHY";
};

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function toIsoString(value: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getAgeDays(date: Date | string | null) {
  if (!date) return 0;

  const dateValue = new Date(date).getTime();

  if (Number.isNaN(dateValue)) return 0;

  const diff = Date.now() - dateValue;
  return Math.max(Math.floor(diff / (1000 * 60 * 60 * 24)), 0);
}

function getTag(item: Omit<InventoryInsight, "tag">): InventoryInsight["tag"] {
  if (item.availableStock <= 0 || item.status === "OUT_OF_STOCK") {
    return "OUT_OF_STOCK";
  }

  if (item.minimumStock > 0 && item.availableStock <= item.minimumStock) {
    return "REORDER";
  }

  if (
    item.totalSold >= 20 ||
    item.salesLast90Days >= 15 ||
    item.highestSingleSale >= 10
  ) {
    return "TOP_SELLER";
  }

  if (item.totalSold > 0 && item.daysWithoutSale <= 30) {
    return "SELLING";
  }

  if (item.totalSold <= 0 && item.stockAgeDays >= 15) {
    return "NO_SALE";
  }

  if (item.totalSold > 0 && item.daysWithoutSale >= 45) {
    return "SLOW_MOVING";
  }

  if (item.inquiryDemand > 0 || item.activeBlockedQuantity > 0) {
    return "WATCH";
  }

  return "HEALTHY";
}

function normalizeRow(row: InventoryInsightRow): InventoryInsight {
  const quantity = toNumber(row.quantity);
  const activeBlockedQuantity = toNumber(row.activeBlockedQuantity);
  const availableStock = Math.max(quantity, 0);
  const totalSold = toNumber(row.totalSold);
  const stockAgeDays = getAgeDays(row.createdAt);
  const daysWithoutSale = row.lastSaleAt
    ? getAgeDays(row.lastSaleAt)
    : stockAgeDays;

  const sellThroughBase = quantity + totalSold;
  const sellThroughPercent =
    sellThroughBase > 0 ? (totalSold / sellThroughBase) * 100 : 0;

  const itemWithoutTag = {
    id: row.id,
    code: row.code,
    name: row.name,
    stack: row.stack,
    quantity,
    blocked: toNumber(row.blocked),
    minimumStock: toNumber(row.minimumStock),
    maximumStock: toNumber(row.maximumStock),
    unit: row.unit,
    categoryName: row.categoryName,
    brandName: row.brandName,
    status: row.status,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
    activeBlockedQuantity,
    availableStock,
    totalRequested: toNumber(row.totalRequested),
    totalOrdered: toNumber(row.totalOrdered),
    totalSold,
    totalCancelled: toNumber(row.totalCancelled),
    orderLineCount: toNumber(row.orderLineCount),
    saleLineCount: toNumber(row.saleLineCount),
    lastOrderAt: toIsoString(row.lastOrderAt),
    lastSaleAt: toIsoString(row.lastSaleAt),
    lastSaleQuantity: toNumber(row.lastSaleQuantity),
    lastSaleOrderNumber: row.lastSaleOrderNumber,
    highestSingleSale: toNumber(row.highestSingleSale),
    highestSaleOrderNumber: row.highestSaleOrderNumber,
    highestSaleAt: toIsoString(row.highestSaleAt),
    salesLast30Days: toNumber(row.salesLast30Days),
    salesLast90Days: toNumber(row.salesLast90Days),
    inquiryCount: toNumber(row.inquiryCount),
    inquiryDemand: toNumber(row.inquiryDemand),
    missedSalesDemand: toNumber(row.missedSalesDemand),
    missedSalesInquiryCount: toNumber(row.missedSalesInquiryCount),
    stockAgeDays,
    daysWithoutSale,
    sellThroughPercent,
  };

  return {
    ...itemWithoutTag,
    tag: getTag(itemWithoutTag),
  };
}

async function getInventoryInsights() {
  const rows = await prisma.$queryRawUnsafe<InventoryInsightRow[]>(`
    WITH delivered_events AS (
      SELECT
        "orderId",
        MAX("createdAt") AS "deliveredAt"
      FROM public."OrderStatusHistory"
      WHERE "toStatus" IN ('DELIVERED', 'INVOICE_UPLOADED')
      GROUP BY "orderId"
    ),
    order_activity AS (
      SELECT
        oi."productId",
        COALESCE(SUM(oi."requestedQuantity"), 0)::int AS "totalRequested",
        COALESCE(SUM(oi."quantity"), 0)::int AS "totalOrdered",
        COALESCE(SUM(oi."cancelledQuantity"), 0)::int AS "totalCancelled",
        COUNT(*)::int AS "orderLineCount",
        MAX(o."createdAt") AS "lastOrderAt"
      FROM public."OrderItem" oi
      INNER JOIN public."Order" o ON o."id" = oi."orderId"
      GROUP BY oi."productId"
    ),
    sale_lines AS (
      SELECT
        oi."productId",
        o."orderNumber",
        oi."deliveredQuantity"::int AS "soldQuantity",
        COALESCE(de."deliveredAt", o."updatedAt", o."createdAt") AS "saleAt"
      FROM public."OrderItem" oi
      INNER JOIN public."Order" o ON o."id" = oi."orderId"
      LEFT JOIN delivered_events de ON de."orderId" = o."id"
      WHERE oi."deliveredQuantity" > 0
    ),
    sale_summary AS (
      SELECT
        "productId",
        COALESCE(SUM("soldQuantity"), 0)::int AS "totalSold",
        COUNT(*)::int AS "saleLineCount",
        MAX("saleAt") AS "lastSaleAt",
        COALESCE(MAX("soldQuantity"), 0)::int AS "highestSingleSale",
        COALESCE(
          SUM(
            CASE
              WHEN "saleAt" >= NOW() - INTERVAL '30 days' THEN "soldQuantity"
              ELSE 0
            END
          ),
          0
        )::int AS "salesLast30Days",
        COALESCE(
          SUM(
            CASE
              WHEN "saleAt" >= NOW() - INTERVAL '90 days' THEN "soldQuantity"
              ELSE 0
            END
          ),
          0
        )::int AS "salesLast90Days"
      FROM sale_lines
      GROUP BY "productId"
    ),
    last_sale AS (
      SELECT DISTINCT ON ("productId")
        "productId",
        "saleAt" AS "lastSaleAt",
        "soldQuantity"::int AS "lastSaleQuantity",
        "orderNumber" AS "lastSaleOrderNumber"
      FROM sale_lines
      ORDER BY "productId", "saleAt" DESC, "soldQuantity" DESC
    ),
    highest_sale AS (
      SELECT DISTINCT ON ("productId")
        "productId",
        "soldQuantity"::int AS "highestSingleSale",
        "orderNumber" AS "highestSaleOrderNumber",
        "saleAt" AS "highestSaleAt"
      FROM sale_lines
      ORDER BY "productId", "soldQuantity" DESC, "saleAt" DESC
    ),
    active_blocks AS (
      SELECT
        "productId",
        COALESCE(SUM("quantity"), 0)::int AS "activeBlockedQuantity"
      FROM public."StockBlockTimeline"
      WHERE "status" = 'ACTIVE'
      GROUP BY "productId"
    ),
    inquiry_summary AS (
      SELECT
        "productId",
        COUNT(*)::int AS "inquiryCount",
        COALESCE(SUM("quantityAsked"), 0)::int AS "inquiryDemand",
        COUNT(*) FILTER (
          WHERE "status" IN ('NOT_IN_STOCK', 'MISSED_SALE')
        )::int AS "missedSalesInquiryCount",
        COALESCE(
          SUM(
            CASE
              WHEN "status" IN ('NOT_IN_STOCK', 'MISSED_SALE') THEN "quantityAsked"
              ELSE 0
            END
          ),
          0
        )::int AS "missedSalesDemand"
      FROM public."InventoryInquiry"
      WHERE "productId" IS NOT NULL
      GROUP BY "productId"
    )
    SELECT
      p."id",
      p."code",
      p."name",
      p."stack",
      p."quantity",
      p."blocked",
      p."minimumStock",
      p."maximumStock",
      p."unit",
      category."name" AS "categoryName",
      brand."name" AS "brandName",
      p."status"::text AS "status",
      p."createdAt",
      p."updatedAt",
      COALESCE(ab."activeBlockedQuantity", p."blocked", 0)::int AS "activeBlockedQuantity",
      COALESCE(oa."totalRequested", 0)::int AS "totalRequested",
      COALESCE(oa."totalOrdered", 0)::int AS "totalOrdered",
      COALESCE(ss."totalSold", 0)::int AS "totalSold",
      COALESCE(oa."totalCancelled", 0)::int AS "totalCancelled",
      COALESCE(oa."orderLineCount", 0)::int AS "orderLineCount",
      COALESCE(ss."saleLineCount", 0)::int AS "saleLineCount",
      oa."lastOrderAt",
      ls."lastSaleAt",
      COALESCE(ls."lastSaleQuantity", 0)::int AS "lastSaleQuantity",
      ls."lastSaleOrderNumber",
      COALESCE(hs."highestSingleSale", ss."highestSingleSale", 0)::int AS "highestSingleSale",
      hs."highestSaleOrderNumber",
      hs."highestSaleAt",
      COALESCE(ss."salesLast30Days", 0)::int AS "salesLast30Days",
      COALESCE(ss."salesLast90Days", 0)::int AS "salesLast90Days",
      COALESCE(iq."inquiryCount", 0)::int AS "inquiryCount",
      COALESCE(iq."inquiryDemand", 0)::int AS "inquiryDemand",
      COALESCE(iq."missedSalesDemand", 0)::int AS "missedSalesDemand",
      COALESCE(iq."missedSalesInquiryCount", 0)::int AS "missedSalesInquiryCount"
    FROM public."Product" p
    INNER JOIN public."ProductCategory" category ON category."id" = p."categoryId"
    INNER JOIN public."ProductBrand" brand ON brand."id" = p."brandId"
    LEFT JOIN order_activity oa ON oa."productId" = p."id"
    LEFT JOIN sale_summary ss ON ss."productId" = p."id"
    LEFT JOIN last_sale ls ON ls."productId" = p."id"
    LEFT JOIN highest_sale hs ON hs."productId" = p."id"
    LEFT JOIN active_blocks ab ON ab."productId" = p."id"
    LEFT JOIN inquiry_summary iq ON iq."productId" = p."id"
    WHERE p."isActive" = TRUE
    ORDER BY p."createdAt" DESC
  `);

  return rows.map(normalizeRow);
}

export default async function InventoryInsightsPage() {
  const { hasAccess } = await checkPermission("manage_inventory");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Inventory Insights Access Denied"
        description="Your current role does not have permission to view inventory insights."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const insights = await getInventoryInsights();

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-200">
                Inventory Insights
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Stock, sales and aging analysis
              </h1>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-300">
                Live product-wise inventory view showing current stock, available
                stock, stock aging, total sold quantity, last sale, highest sale
                and reorder risk from ERP data.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/internal/inventory"
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                Manage Inventory
              </Link>
              <Link
                href="/internal/inventory/calendar"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-blue-50"
              >
                Stock Calendar
              </Link>
            </div>
          </div>
        </div>

        <InventoryInsightsClient insights={insights} />
      </section>
    </main>
  );
}
