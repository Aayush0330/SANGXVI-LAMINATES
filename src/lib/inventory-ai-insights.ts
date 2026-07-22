import { prisma } from "@/lib/db";

export type InventoryAiProductSignal = {
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
  inventoryAgeDays: number;
  totalOrdered: number;
  deliveredQuantity: number;
  cancelledQuantity: number;
  activeBlockedQuantity: number;
  inquiryDemand: number;
  missedSalesDemand: number;
  inquiryCount: number;
  missedSalesInquiryCount: number;
  lastOrderAt: Date | string | null;
  lastInquiryAt: Date | string | null;
  productUpdatedAt: Date | string | null;
};

export type InventoryAiRecommendation = InventoryAiProductSignal & {
  availableStock: number;
  demandScore: number;
  riskScore: number;
  reorderQuantity: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  aiTag: "REORDER_NOW" | "WATCH" | "TOP_SELLER" | "LOW_SELLER" | "DEAD_STOCK" | "HEALTHY";
  aiTitle: string;
  aiReason: string;
  aiAction: string;
  evidence: string[];
};

export type InventoryAiStats = {
  productsAnalyzed: number;
  reorderNow: number;
  watchItems: number;
  topSelling: number;
  lowSelling: number;
  deadStock: number;
  totalMissedDemand: number;
  oldestInventoryDays: number;
};

export type InventoryAiDataSourceStats = {
  products: number;
  orders: number;
  orderItems: number;
  deliveredUnits: number;
  inquiries: number;
  missedSalesInquiries: number;
  missedDemandUnits: number;
  activeBlocks: number;
  activeBlockedUnits: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  lastProductUpdateAt: Date | string | null;
  lastOrderAt: Date | string | null;
  lastInquiryAt: Date | string | null;
  lastBlockAt: Date | string | null;
};

export type InventoryAiInsights = {
  generatedAt: Date;
  stats: InventoryAiStats;
  dataSources: InventoryAiDataSourceStats;
  recommendations: InventoryAiRecommendation[];
  reorderAlerts: InventoryAiRecommendation[];
  topSellers: InventoryAiRecommendation[];
  lowSellers: InventoryAiRecommendation[];
  agingInventory: InventoryAiRecommendation[];
};

export type InventoryAiChatAnswer = {
  title: string;
  answer: string;
  bullets: string[];
  sourceFacts: string[];
  followUpPrompts: string[];
};

type InventoryAiDataSourceRow = Record<keyof InventoryAiDataSourceStats, unknown>;

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function normalizeDate(value: unknown): Date | string | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function normalizeSignals(row: InventoryAiProductSignal): InventoryAiProductSignal {
  return {
    ...row,
    quantity: toNumber(row.quantity),
    blocked: toNumber(row.blocked),
    minimumStock: toNumber(row.minimumStock),
    maximumStock: toNumber(row.maximumStock),
    inventoryAgeDays: toNumber(row.inventoryAgeDays),
    totalOrdered: toNumber(row.totalOrdered),
    deliveredQuantity: toNumber(row.deliveredQuantity),
    cancelledQuantity: toNumber(row.cancelledQuantity),
    activeBlockedQuantity: toNumber(row.activeBlockedQuantity),
    inquiryDemand: toNumber(row.inquiryDemand),
    missedSalesDemand: toNumber(row.missedSalesDemand),
    inquiryCount: toNumber(row.inquiryCount),
    missedSalesInquiryCount: toNumber(row.missedSalesInquiryCount),
    lastOrderAt: normalizeDate(row.lastOrderAt),
    lastInquiryAt: normalizeDate(row.lastInquiryAt),
    productUpdatedAt: normalizeDate(row.productUpdatedAt),
  };
}

function normalizeDataSources(row: InventoryAiDataSourceRow | undefined): InventoryAiDataSourceStats {
  return {
    products: toNumber(row?.products),
    orders: toNumber(row?.orders),
    orderItems: toNumber(row?.orderItems),
    deliveredUnits: toNumber(row?.deliveredUnits),
    inquiries: toNumber(row?.inquiries),
    missedSalesInquiries: toNumber(row?.missedSalesInquiries),
    missedDemandUnits: toNumber(row?.missedDemandUnits),
    activeBlocks: toNumber(row?.activeBlocks),
    activeBlockedUnits: toNumber(row?.activeBlockedUnits),
    lowStockProducts: toNumber(row?.lowStockProducts),
    outOfStockProducts: toNumber(row?.outOfStockProducts),
    lastProductUpdateAt: normalizeDate(row?.lastProductUpdateAt),
    lastOrderAt: normalizeDate(row?.lastOrderAt),
    lastInquiryAt: normalizeDate(row?.lastInquiryAt),
    lastBlockAt: normalizeDate(row?.lastBlockAt),
  };
}

function getConfidence(row: InventoryAiProductSignal): InventoryAiRecommendation["confidence"] {
  const liveSignalCount = [
    row.totalOrdered > 0,
    row.deliveredQuantity > 0,
    row.inquiryDemand > 0,
    row.missedSalesDemand > 0,
    row.activeBlockedQuantity > 0,
  ].filter(Boolean).length;

  if (liveSignalCount >= 3) return "HIGH";
  if (liveSignalCount >= 1) return "MEDIUM";
  return "LOW";
}

function getRecommendation(row: InventoryAiProductSignal): InventoryAiRecommendation {
  const availableStock = Math.max(row.quantity, 0);
  const demandScore =
    row.deliveredQuantity * 3 +
    row.totalOrdered * 2 +
    row.inquiryDemand * 2 +
    row.missedSalesDemand * 4 +
    row.activeBlockedQuantity;

  const belowMinimum = row.minimumStock > 0 && row.quantity <= row.minimumStock;
  const stockOut = row.quantity <= 0 || row.status === "OUT_OF_STOCK";
  const missedDemandPressure = row.missedSalesDemand > 0 && row.missedSalesDemand >= availableStock;
  const noSales = row.totalOrdered <= 0 && row.deliveredQuantity <= 0;
  const oldInventory = row.inventoryAgeDays >= 60 && row.quantity > 0;
  const deadStock = oldInventory && noSales && row.inquiryDemand <= 0;
  const lowSeller = row.inventoryAgeDays >= 30 && row.quantity > 0 && demandScore <= 2;
  const topSeller = demandScore >= 15 || row.deliveredQuantity >= 10;

  const stockTarget = Math.max(row.maximumStock, row.minimumStock, 1);
  const reorderQuantity = Math.max(
    stockOut || belowMinimum ? stockTarget - availableStock : 0,
    missedDemandPressure ? row.missedSalesDemand - availableStock : 0,
  );

  let aiTag: InventoryAiRecommendation["aiTag"] = "HEALTHY";
  let aiTitle = "Healthy Stock";
  let aiReason = "Stock, order, inquiry and block signals are balanced right now.";
  let aiAction = "Keep monitoring this product in the regular inventory cycle.";
  let riskScore = 20;

  if (stockOut || belowMinimum || missedDemandPressure) {
    aiTag = "REORDER_NOW";
    aiTitle = stockOut ? "Reorder Required" : "Minimum Stock Hit";
    aiReason = stockOut
      ? "Available stock is zero or marked out of stock, so incoming demand may turn into missed sales."
      : missedDemandPressure
        ? "Missed-sales demand is higher than usable stock. The recommendation is based on real inquiry and stock data."
        : "Current quantity has reached or dropped below the configured minimum stock level.";
    aiAction = `Plan reorder for ${Math.max(reorderQuantity, 1).toLocaleString("en-IN")} ${row.unit} to move stock toward the maximum target of ${stockTarget.toLocaleString("en-IN")}.`;
    riskScore = 92;
  } else if (deadStock) {
    aiTag = "DEAD_STOCK";
    aiTitle = "Dead Stock Risk";
    aiReason = "Inventory is old, stock is still available, and no order/inquiry demand is visible.";
    aiAction = "Review visibility, dealer push, or stock movement plan before adding more stock.";
    riskScore = 82;
  } else if (lowSeller) {
    aiTag = "LOW_SELLER";
    aiTitle = "Low Selling Inventory";
    aiReason = "This product has available stock but weak order and inquiry signals.";
    aiAction = "Avoid fresh reorder until demand improves; check if this product should be promoted or moved.";
    riskScore = 68;
  } else if (topSeller) {
    aiTag = "TOP_SELLER";
    aiTitle = "Top Selling Product";
    aiReason = "Order, delivery and inquiry signals show stronger demand than regular products.";
    aiAction = "Keep stock above minimum and watch future missed-sales inquiries.";
    riskScore = 38;
  } else if (row.inquiryDemand > 0 || row.activeBlockedQuantity > 0) {
    aiTag = "WATCH";
    aiTitle = "Watch Demand";
    aiReason = "There is inquiry or blocked-stock activity, but it is not yet a critical reorder case.";
    aiAction = "Monitor next orders and increase minimum stock if demand repeats.";
    riskScore = 52;
  }

  return {
    ...row,
    availableStock,
    demandScore,
    riskScore,
    reorderQuantity: Math.max(reorderQuantity, 0),
    confidence: getConfidence(row),
    aiTag,
    aiTitle,
    aiReason,
    aiAction,
    evidence: [
      `Product table: stock ${row.quantity.toLocaleString("en-IN")}, active blocked ${row.activeBlockedQuantity.toLocaleString("en-IN")}, usable stock ${availableStock.toLocaleString("en-IN")}.`,
      `OrderItem table: ordered ${row.totalOrdered.toLocaleString("en-IN")}, delivered ${row.deliveredQuantity.toLocaleString("en-IN")}, cancelled ${row.cancelledQuantity.toLocaleString("en-IN")}.`,
      `InventoryInquiry table: inquiries ${row.inquiryCount.toLocaleString("en-IN")}, missed-sale inquiries ${row.missedSalesInquiryCount.toLocaleString("en-IN")}, missed demand ${row.missedSalesDemand.toLocaleString("en-IN")}.`,
      `Formula: demand score = delivered×3 + ordered×2 + inquiry demand×2 + missed demand×4 + active blocks. Current score ${demandScore.toLocaleString("en-IN")}.`,
    ],
  };
}

export function getAiTagLabel(tag: InventoryAiRecommendation["aiTag"]) {
  if (tag === "REORDER_NOW") return "Reorder Now";
  if (tag === "WATCH") return "Watch";
  if (tag === "TOP_SELLER") return "Top Seller";
  if (tag === "LOW_SELLER") return "Low Seller";
  if (tag === "DEAD_STOCK") return "Dead Stock";
  return "Healthy";
}

export function getAiTagClass(tag: InventoryAiRecommendation["aiTag"]) {
  if (tag === "REORDER_NOW") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300";
  }

  if (tag === "DEAD_STOCK" || tag === "LOW_SELLER") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300";
  }

  if (tag === "TOP_SELLER") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (tag === "WATCH") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300";
  }

  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
}

function formatProductLine(item: InventoryAiRecommendation) {
  return `${item.name} (${item.code}) — usable stock ${item.availableStock.toLocaleString("en-IN")}, minimum ${item.minimumStock.toLocaleString("en-IN")}, delivered ${item.deliveredQuantity.toLocaleString("en-IN")}, missed demand ${item.missedSalesDemand.toLocaleString("en-IN")}.`;
}

function topLines(items: InventoryAiRecommendation[], fallback: string, limit = 3) {
  const lines = items.slice(0, limit).map(formatProductLine);
  return lines.length > 0 ? lines : [fallback];
}

function findProductFromQuestion(insights: InventoryAiInsights, rawQuestion: string) {
  const q = rawQuestion.toLowerCase();
  const words = q.split(/[^a-z0-9]+/).filter((word) => word.length >= 3);

  return insights.recommendations.find((item) => {
    const name = item.name.toLowerCase();
    const code = item.code.toLowerCase();
    const stack = item.stack.toLowerCase();
    const haystack = `${name} ${code} ${stack}`;

    if (q.includes(code) || q.includes(name) || haystack.includes(q)) return true;

    const matchingWords = words.filter((word) => haystack.includes(word)).length;
    return matchingWords >= Math.min(2, words.length);
  });
}

export function getInventoryAiChatAnswer(
  insights: InventoryAiInsights,
  rawQuestion: string,
): InventoryAiChatAnswer {
  const question = rawQuestion.trim().slice(0, 180);
  const q = question.toLowerCase();
  const productMatch = question ? findProductFromQuestion(insights, question) : null;

  const defaultPrompts = [
    "What should I reorder first?",
    "Which stock is not selling?",
    "Show missed demand risk",
    "Which product is oldest?",
  ];

  const sourceFacts = [
    `${insights.dataSources.products.toLocaleString("en-IN")} products checked from Product table.`,
    `${insights.dataSources.orderItems.toLocaleString("en-IN")} order lines and ${insights.dataSources.deliveredUnits.toLocaleString("en-IN")} delivered units checked from OrderItem table.`,
    `${insights.dataSources.inquiries.toLocaleString("en-IN")} inventory inquiries checked, including ${insights.dataSources.missedSalesInquiries.toLocaleString("en-IN")} missed-sale inquiries.`,
    `${insights.dataSources.activeBlocks.toLocaleString("en-IN")} active stock block records checked from StockBlockTimeline table.`,
  ];

  if (productMatch) {
    return {
      title: `${productMatch.name} backend analysis`,
      answer: `${productMatch.aiTitle}. ${productMatch.aiReason}`,
      bullets: [
        `Usable stock is ${productMatch.availableStock.toLocaleString("en-IN")} units after active blocks. Minimum stock is ${productMatch.minimumStock.toLocaleString("en-IN")}.`,
        `Delivered units are ${productMatch.deliveredQuantity.toLocaleString("en-IN")}; missed demand is ${productMatch.missedSalesDemand.toLocaleString("en-IN")}.`,
        `Risk score is ${productMatch.riskScore.toLocaleString("en-IN")} and confidence is ${productMatch.confidence}.`,
        productMatch.aiAction,
      ],
      sourceFacts: productMatch.evidence,
      followUpPrompts: defaultPrompts,
    };
  }

  if (q.includes("reorder") || q.includes("minimum") || q.includes("low stock")) {
    return {
      title: "Reorder priority from database",
      answer: `${insights.reorderAlerts.length.toLocaleString("en-IN")} products need reorder or minimum-stock review. The ranking is generated from stock, active blocks, order items, and missed-sales inquiries.` ,
      bullets: topLines(
        insights.reorderAlerts,
        "No urgent reorder item right now. Keep watching missed sales and minimum stock.",
      ),
      sourceFacts,
      followUpPrompts: ["Show missed demand risk", "Which product is oldest?", "Which stock is not selling?"],
    };
  }

  if (q.includes("missed") || q.includes("demand") || q.includes("not available") || q.includes("stock not")) {
    const missedItems = insights.recommendations
      .filter((item) => item.missedSalesDemand > 0)
      .sort((a, b) => b.missedSalesDemand - a.missedSalesDemand);

    return {
      title: "Missed demand risk from inquiries",
      answer: `Total missed demand is ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} units. This value is calculated from InventoryInquiry records tagged as NOT_IN_STOCK or MISSED_SALE.`,
      bullets: topLines(missedItems, "No missed-sales demand is currently visible."),
      sourceFacts,
      followUpPrompts: ["What should I reorder first?", "Which product is oldest?", "Top selling products"],
    };
  }

  if (q.includes("low") || q.includes("slow") || q.includes("dead") || q.includes("not selling")) {
    return {
      title: "Low selling and dead stock from database",
      answer: "These products have weak order/inquiry signals or old inventory age. Review them before fresh purchasing.",
      bullets: topLines(insights.lowSellers, "No low-selling or dead-stock risk is visible right now."),
      sourceFacts,
      followUpPrompts: ["Which product is oldest?", "Top selling products", "What should I reorder first?"],
    };
  }

  if (q.includes("top") || q.includes("selling") || q.includes("best") || q.includes("fast")) {
    return {
      title: "Top selling products from order data",
      answer: "These products have the strongest delivered quantity, order quantity, inquiry and missed-demand signals in the current ERP database.",
      bullets: topLines(insights.topSellers, "No top-selling signal yet. Orders and deliveries will improve this analysis."),
      sourceFacts,
      followUpPrompts: ["What should I reorder first?", "Show missed demand risk", "Which stock is not selling?"],
    };
  }

  if (q.includes("old") || q.includes("age") || q.includes("days") || q.includes("oldest")) {
    return {
      title: "Oldest inventory from Product records",
      answer: `Oldest available inventory age is ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} days. The age is calculated from Product.createdAt for available stock.` ,
      bullets: topLines(insights.agingInventory, "No stock age signal available yet."),
      sourceFacts,
      followUpPrompts: ["Which stock is not selling?", "What should I reorder first?", "Show missed demand risk"],
    };
  }

  return {
    title: question ? "Live inventory database summary" : "Ask a backend inventory question",
    answer: `${insights.stats.productsAnalyzed.toLocaleString("en-IN")} products analyzed. ${insights.stats.reorderNow.toLocaleString("en-IN")} need reorder review, ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} units are missed demand, and oldest stock is ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} days old.` ,
    bullets: topLines(
      insights.recommendations,
      "Inventory data is not enough yet. Add products, orders and inquiries to get deeper insights.",
    ),
    sourceFacts,
    followUpPrompts: defaultPrompts,
  };
}

export async function getInventoryAiInsights(): Promise<InventoryAiInsights> {
  const [sourceRows, rows] = await Promise.all([
    prisma.$queryRawUnsafe<InventoryAiDataSourceRow[]>(`
      SELECT
        (SELECT COUNT(*) FROM public."Product" WHERE "isActive" = TRUE)::int AS "products",
        (SELECT COUNT(*) FROM public."Order")::int AS "orders",
        (SELECT COUNT(*) FROM public."OrderItem")::int AS "orderItems",
        (SELECT COALESCE(SUM("deliveredQuantity"), 0) FROM public."OrderItem")::int AS "deliveredUnits",
        (SELECT COUNT(*) FROM public."InventoryInquiry")::int AS "inquiries",
        (SELECT COUNT(*) FROM public."InventoryInquiry" WHERE "status" IN ('NOT_IN_STOCK', 'MISSED_SALE'))::int AS "missedSalesInquiries",
        (SELECT COALESCE(SUM("quantityAsked"), 0) FROM public."InventoryInquiry" WHERE "status" IN ('NOT_IN_STOCK', 'MISSED_SALE'))::int AS "missedDemandUnits",
        (SELECT COUNT(*) FROM public."StockBlockTimeline" WHERE "status" = 'ACTIVE')::int AS "activeBlocks",
        (SELECT COALESCE(SUM("quantity"), 0) FROM public."StockBlockTimeline" WHERE "status" = 'ACTIVE')::int AS "activeBlockedUnits",
        (SELECT COUNT(*) FROM public."Product" WHERE "isActive" = TRUE AND "minimumStock" > 0 AND "quantity" <= "minimumStock")::int AS "lowStockProducts",
        (SELECT COUNT(*) FROM public."Product" WHERE "isActive" = TRUE AND ("status" = 'OUT_OF_STOCK' OR "quantity" <= 0))::int AS "outOfStockProducts",
        (SELECT MAX("updatedAt") FROM public."Product" WHERE "isActive" = TRUE) AS "lastProductUpdateAt",
        (SELECT MAX("createdAt") FROM public."Order") AS "lastOrderAt",
        (SELECT MAX("createdAt") FROM public."InventoryInquiry") AS "lastInquiryAt",
        (SELECT MAX("updatedAt") FROM public."StockBlockTimeline") AS "lastBlockAt"
    `),
    prisma.$queryRawUnsafe<InventoryAiProductSignal[]>(`
      WITH sales AS (
        SELECT
          oi."productId",
          COALESCE(SUM(oi."quantity"), 0)::int AS "totalOrdered",
          COALESCE(SUM(oi."deliveredQuantity"), 0)::int AS "deliveredQuantity",
          COALESCE(SUM(oi."cancelledQuantity"), 0)::int AS "cancelledQuantity",
          MAX(o."createdAt") AS "lastOrderAt"
        FROM public."OrderItem" oi
        INNER JOIN public."Order" o ON o."id" = oi."orderId"
        GROUP BY oi."productId"
      ),
      blocks AS (
        SELECT
          "productId",
          COALESCE(SUM("quantity"), 0)::int AS "activeBlockedQuantity"
        FROM public."StockBlockTimeline"
        WHERE "status" = 'ACTIVE'
        GROUP BY "productId"
      ),
      inquiries AS (
        SELECT
          "productId",
          COALESCE(SUM("quantityAsked"), 0)::int AS "inquiryDemand",
          COALESCE(SUM(CASE WHEN "status" IN ('NOT_IN_STOCK', 'MISSED_SALE') THEN "quantityAsked" ELSE 0 END), 0)::int AS "missedSalesDemand",
          COUNT(*)::int AS "inquiryCount",
          COUNT(*) FILTER (WHERE "status" IN ('NOT_IN_STOCK', 'MISSED_SALE'))::int AS "missedSalesInquiryCount",
          MAX("createdAt") AS "lastInquiryAt"
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
        GREATEST(FLOOR(EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400), 0)::int AS "inventoryAgeDays",
        COALESCE(s."totalOrdered", 0)::int AS "totalOrdered",
        COALESCE(s."deliveredQuantity", 0)::int AS "deliveredQuantity",
        COALESCE(s."cancelledQuantity", 0)::int AS "cancelledQuantity",
        COALESCE(b."activeBlockedQuantity", 0)::int AS "activeBlockedQuantity",
        COALESCE(i."inquiryDemand", 0)::int AS "inquiryDemand",
        COALESCE(i."missedSalesDemand", 0)::int AS "missedSalesDemand",
        COALESCE(i."inquiryCount", 0)::int AS "inquiryCount",
        COALESCE(i."missedSalesInquiryCount", 0)::int AS "missedSalesInquiryCount",
        s."lastOrderAt",
        i."lastInquiryAt",
        p."updatedAt" AS "productUpdatedAt"
      FROM public."Product" p
      INNER JOIN public."ProductCategory" category ON category."id" = p."categoryId"
      INNER JOIN public."ProductBrand" brand ON brand."id" = p."brandId"
      LEFT JOIN sales s ON s."productId" = p."id"
      LEFT JOIN blocks b ON b."productId" = p."id"
      LEFT JOIN inquiries i ON i."productId" = p."id"
      WHERE p."isActive" = TRUE
      ORDER BY p."createdAt" ASC
    `),
  ]);

  const dataSources = normalizeDataSources(sourceRows[0]);

  const recommendations = rows
    .map(normalizeSignals)
    .map(getRecommendation)
    .sort((a, b) => b.riskScore - a.riskScore || b.demandScore - a.demandScore);

  const reorderAlerts = recommendations
    .filter((item) => item.aiTag === "REORDER_NOW")
    .slice(0, 8);

  const topSellers = [...recommendations]
    .filter((item) => item.demandScore > 0)
    .sort((a, b) => b.demandScore - a.demandScore || b.deliveredQuantity - a.deliveredQuantity)
    .slice(0, 8);

  const lowSellers = recommendations
    .filter((item) => item.aiTag === "LOW_SELLER" || item.aiTag === "DEAD_STOCK")
    .slice(0, 8);

  const agingInventory = [...recommendations]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => b.inventoryAgeDays - a.inventoryAgeDays)
    .slice(0, 8);

  const stats: InventoryAiStats = {
    productsAnalyzed: recommendations.length,
    reorderNow: recommendations.filter((item) => item.aiTag === "REORDER_NOW").length,
    watchItems: recommendations.filter((item) => item.aiTag === "WATCH").length,
    topSelling: recommendations.filter((item) => item.aiTag === "TOP_SELLER").length,
    lowSelling: recommendations.filter((item) => item.aiTag === "LOW_SELLER").length,
    deadStock: recommendations.filter((item) => item.aiTag === "DEAD_STOCK").length,
    totalMissedDemand: recommendations.reduce((total, item) => total + item.missedSalesDemand, 0),
    oldestInventoryDays: recommendations.reduce(
      (max, item) => Math.max(max, item.inventoryAgeDays),
      0,
    ),
  };

  return {
    generatedAt: new Date(),
    stats,
    dataSources,
    recommendations,
    reorderAlerts,
    topSellers,
    lowSellers,
    agingInventory,
  };
}
