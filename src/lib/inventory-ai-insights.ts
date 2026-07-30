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

export type InventoryQuestionIntent =
  | "REORDER"
  | "MISSED_DEMAND"
  | "SLOW_STOCK"
  | "TOP_SELLERS"
  | "AGING_STOCK"
  | "SUMMARY";

type InventoryResponseLanguage = "en" | "hi" | "hinglish";

function normalizeQuestion(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, phrases: string[]) {
  return phrases.some((phrase) => value.includes(normalizeQuestion(phrase)));
}

export function detectInventoryQuestionIntent(
  rawQuestion: string,
): InventoryQuestionIntent {
  const q = normalizeQuestion(rawQuestion);

  if (
    includesAny(q, [
      "reorder",
      "restock",
      "minimum stock",
      "low stock",
      "stock kam",
      "kam stock",
      "mangwa",
      "mangva",
      "mangana",
      "mangau",
      "kharid",
      "dobara stock",
      "रीऑर्डर",
      "मंगवा",
      "मंगाना",
      "खरीद",
      "कम स्टॉक",
      "स्टॉक कम",
      "न्यूनतम",
      "reordenar",
      "reapprovisionner",
      "إعادة الطلب",
      "ફરી ઓર્ડર",
    ])
  ) {
    return "REORDER";
  }

  if (
    includesAny(q, [
      "missed demand",
      "missed sale",
      "not available",
      "out of stock",
      "stock nahi",
      "available nahi",
      "nahi mila",
      "nahi mil",
      "customer demand",
      "grahak ki demand",
      "मांग",
      "नहीं मिला",
      "उपलब्ध नहीं",
      "स्टॉक नहीं",
      "demanda perdida",
      "demande manquee",
      "طلب مفقود",
      "માંગ",
    ])
  ) {
    return "MISSED_DEMAND";
  }

  if (
    includesAny(q, [
      "not selling",
      "slow stock",
      "slow selling",
      "low selling",
      "dead stock",
      "nahi bik",
      "kam bik",
      "nahi chal",
      "pada hua",
      "नहीं बिक",
      "कम बिक",
      "नहीं चल",
      "डेड स्टॉक",
      "धीमा स्टॉक",
      "sin vender",
      "stock dormant",
      "مخزون راكد",
      "નથી વેચાતો",
    ])
  ) {
    return "SLOW_STOCK";
  }

  if (
    includesAny(q, [
      "top seller",
      "top selling",
      "best seller",
      "fast selling",
      "fast moving",
      "most sold",
      "sabse zyada",
      "sabse jyada",
      "zyada bik",
      "jyada bik",
      "acha chal",
      "accha chal",
      "सबसे ज्यादा",
      "सबसे अधिक",
      "तेज बिक",
      "अच्छा चल",
      "mas vendido",
      "meilleure vente",
      "الأكثر مبيعا",
      "સૌથી વધુ",
    ])
  ) {
    return "TOP_SELLERS";
  }

  if (
    includesAny(q, [
      "oldest",
      "old stock",
      "inventory age",
      "stock age",
      "how many days",
      "purana",
      "kitne din",
      "kab se",
      "पुराना",
      "कितने दिन",
      "कब से",
      "स्टॉक की उम्र",
      "mas antiguo",
      "plus ancien",
      "الأقدم",
      "જૂનો",
    ])
  ) {
    return "AGING_STOCK";
  }

  return "SUMMARY";
}

function detectResponseLanguage(rawQuestion: string): InventoryResponseLanguage {
  if (/[\u0900-\u097f]/.test(rawQuestion)) return "hi";

  const q = ` ${normalizeQuestion(rawQuestion)} `;
  const hinglishWords = [
    " kya ",
    " kaunsa ",
    " kaun ",
    " kitna ",
    " kitne ",
    " sabse ",
    " zyada ",
    " jyada ",
    " nahi ",
    " wala ",
    " wali ",
    " maal ",
    " stock kam ",
    " mangwa",
    " bik ",
    " bikta ",
    " chal raha ",
    " batao ",
    " dikhao ",
  ];

  return hinglishWords.some((word) => q.includes(word)) ? "hinglish" : "en";
}

function localized(
  language: InventoryResponseLanguage,
  copy: Record<InventoryResponseLanguage, string>,
) {
  return copy[language];
}

function formatProductLine(
  item: InventoryAiRecommendation,
  language: InventoryResponseLanguage,
) {
  const stock = item.availableStock.toLocaleString("en-IN");
  const minimum = item.minimumStock.toLocaleString("en-IN");
  const delivered = item.deliveredQuantity.toLocaleString("en-IN");
  const missed = item.missedSalesDemand.toLocaleString("en-IN");

  return localized(language, {
    en: `${item.name} (${item.code}) — usable stock ${stock}, minimum ${minimum}, delivered ${delivered}, missed demand ${missed}.`,
    hi: `${item.name} (${item.code}) — उपयोग योग्य स्टॉक ${stock}, न्यूनतम ${minimum}, डिलीवर ${delivered}, छूटी हुई मांग ${missed}।`,
    hinglish: `${item.name} (${item.code}) — usable stock ${stock}, minimum ${minimum}, delivered ${delivered}, missed demand ${missed}.`,
  });
}

function topLines(
  items: InventoryAiRecommendation[],
  fallback: string,
  language: InventoryResponseLanguage,
  limit = 3,
) {
  const lines = items
    .slice(0, limit)
    .map((item) => formatProductLine(item, language));
  return lines.length > 0 ? lines : [fallback];
}

function findProductFromQuestion(insights: InventoryAiInsights, rawQuestion: string) {
  const q = normalizeQuestion(rawQuestion);
  const words = q.split(/[^a-z0-9]+/).filter((word) => word.length >= 3);

  return insights.recommendations.find((item) => {
    const name = item.name.toLowerCase();
    const code = item.code.toLowerCase();
    const stack = item.stack.toLowerCase();
    const haystack = `${name} ${code} ${stack}`;

    if (q.includes(code) || q.includes(name) || haystack.includes(q)) return true;

    const matchingWords = words.filter((word) => haystack.includes(word)).length;
    return words.length > 0 && matchingWords >= Math.min(2, words.length);
  });
}

export function getInventoryAiChatAnswer(
  insights: InventoryAiInsights,
  rawQuestion: string,
): InventoryAiChatAnswer {
  const question = rawQuestion.trim().slice(0, 180);
  const language = detectResponseLanguage(question);
  const intent = detectInventoryQuestionIntent(question);
  const productMatch = question ? findProductFromQuestion(insights, question) : null;

  const sourceFacts = [
    localized(language, {
      en: `${insights.dataSources.products.toLocaleString("en-IN")} products checked from Product records.`,
      hi: `Product रिकॉर्ड से ${insights.dataSources.products.toLocaleString("en-IN")} प्रोडक्ट जाँचे गए।`,
      hinglish: `Product records se ${insights.dataSources.products.toLocaleString("en-IN")} products check kiye gaye.`,
    }),
    localized(language, {
      en: `${insights.dataSources.orderItems.toLocaleString("en-IN")} order lines and ${insights.dataSources.deliveredUnits.toLocaleString("en-IN")} delivered units checked.`,
      hi: `${insights.dataSources.orderItems.toLocaleString("en-IN")} ऑर्डर लाइन और ${insights.dataSources.deliveredUnits.toLocaleString("en-IN")} डिलीवर यूनिट जाँची गईं।`,
      hinglish: `${insights.dataSources.orderItems.toLocaleString("en-IN")} order lines aur ${insights.dataSources.deliveredUnits.toLocaleString("en-IN")} delivered units check kiye gaye.`,
    }),
    localized(language, {
      en: `${insights.dataSources.inquiries.toLocaleString("en-IN")} inventory inquiries checked, including ${insights.dataSources.missedSalesInquiries.toLocaleString("en-IN")} missed-sale inquiries.`,
      hi: `${insights.dataSources.inquiries.toLocaleString("en-IN")} इन्वेंटरी इन्क्वायरी जाँची गईं, जिनमें ${insights.dataSources.missedSalesInquiries.toLocaleString("en-IN")} missed-sale इन्क्वायरी हैं।`,
      hinglish: `${insights.dataSources.inquiries.toLocaleString("en-IN")} inventory inquiries check hui, jisme ${insights.dataSources.missedSalesInquiries.toLocaleString("en-IN")} missed-sale inquiries hain.`,
    }),
  ];

  if (productMatch) {
    const stock = productMatch.availableStock.toLocaleString("en-IN");
    const minimum = productMatch.minimumStock.toLocaleString("en-IN");
    const delivered = productMatch.deliveredQuantity.toLocaleString("en-IN");
    const missed = productMatch.missedSalesDemand.toLocaleString("en-IN");

    return {
      title: localized(language, {
        en: `${productMatch.name} analysis`,
        hi: `${productMatch.name} का विश्लेषण`,
        hinglish: `${productMatch.name} ka analysis`,
      }),
      answer: localized(language, {
        en: `${productMatch.aiTitle}. The result is based on live stock, order and inquiry records.`,
        hi: `${productMatch.aiTitle}। यह नतीजा लाइव स्टॉक, ऑर्डर और इन्क्वायरी रिकॉर्ड पर आधारित है।`,
        hinglish: `${productMatch.aiTitle}. Ye result live stock, order aur inquiry records par based hai.`,
      }),
      bullets: [
        localized(language, {
          en: `Usable stock is ${stock}; minimum stock is ${minimum}.`,
          hi: `उपयोग योग्य स्टॉक ${stock} है; न्यूनतम स्टॉक ${minimum} है।`,
          hinglish: `Usable stock ${stock} hai; minimum stock ${minimum} hai.`,
        }),
        localized(language, {
          en: `Delivered units are ${delivered}; missed demand is ${missed}.`,
          hi: `डिलीवर यूनिट ${delivered} हैं; छूटी हुई मांग ${missed} है।`,
          hinglish: `Delivered units ${delivered} hain; missed demand ${missed} hai.`,
        }),
      ],
      sourceFacts: productMatch.evidence,
    };
  }

  if (intent === "REORDER") {
    return {
      title: localized(language, {
        en: "Reorder priority",
        hi: "रीऑर्डर प्राथमिकता",
        hinglish: "Reorder priority",
      }),
      answer: localized(language, {
        en: `${insights.reorderAlerts.length.toLocaleString("en-IN")} products need reorder or minimum-stock review.`,
        hi: `${insights.reorderAlerts.length.toLocaleString("en-IN")} प्रोडक्ट को रीऑर्डर या न्यूनतम स्टॉक समीक्षा की जरूरत है।`,
        hinglish: `${insights.reorderAlerts.length.toLocaleString("en-IN")} products ko reorder ya minimum-stock review ki zarurat hai.`,
      }),
      bullets: topLines(
        insights.reorderAlerts,
        localized(language, {
          en: "No urgent reorder item right now.",
          hi: "अभी कोई जरूरी रीऑर्डर आइटम नहीं है।",
          hinglish: "Abhi koi urgent reorder item nahi hai.",
        }),
        language,
      ),
      sourceFacts,
    };
  }

  if (intent === "MISSED_DEMAND") {
    const missedItems = insights.recommendations
      .filter((item) => item.missedSalesDemand > 0)
      .sort((a, b) => b.missedSalesDemand - a.missedSalesDemand);

    return {
      title: localized(language, {
        en: "Missed demand risk",
        hi: "छूटी हुई मांग का जोखिम",
        hinglish: "Missed demand risk",
      }),
      answer: localized(language, {
        en: `Total missed demand is ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} units.`,
        hi: `कुल छूटी हुई मांग ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} यूनिट है।`,
        hinglish: `Total missed demand ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} units hai.`,
      }),
      bullets: topLines(
        missedItems,
        localized(language, {
          en: "No missed-sales demand is currently visible.",
          hi: "अभी कोई छूटी हुई बिक्री की मांग नहीं दिख रही है।",
          hinglish: "Abhi koi missed-sales demand nahi dikh rahi hai.",
        }),
        language,
      ),
      sourceFacts,
    };
  }

  if (intent === "SLOW_STOCK") {
    return {
      title: localized(language, {
        en: "Slow and dead stock",
        hi: "धीमा और डेड स्टॉक",
        hinglish: "Slow aur dead stock",
      }),
      answer: localized(language, {
        en: "These products have weak sales signals or old inventory. Review them before fresh purchasing.",
        hi: "इन प्रोडक्ट में बिक्री संकेत कमजोर हैं या स्टॉक पुराना है। नई खरीद से पहले समीक्षा करें।",
        hinglish: "In products ke sales signals weak hain ya stock purana hai. Fresh purchase se pehle review karein.",
      }),
      bullets: topLines(
        insights.lowSellers,
        localized(language, {
          en: "No slow-selling or dead-stock risk is visible right now.",
          hi: "अभी धीमे या डेड स्टॉक का जोखिम नहीं दिख रहा है।",
          hinglish: "Abhi slow-selling ya dead-stock risk nahi dikh raha hai.",
        }),
        language,
      ),
      sourceFacts,
    };
  }

  if (intent === "TOP_SELLERS") {
    return {
      title: localized(language, {
        en: "Top-selling products",
        hi: "सबसे ज्यादा बिकने वाले प्रोडक्ट",
        hinglish: "Sabse zyada bikne wale products",
      }),
      answer: localized(language, {
        en: "These products have the strongest order, delivery and inquiry signals.",
        hi: "इन प्रोडक्ट के ऑर्डर, डिलीवरी और इन्क्वायरी संकेत सबसे मजबूत हैं।",
        hinglish: "In products ke order, delivery aur inquiry signals sabse strong hain.",
      }),
      bullets: topLines(
        insights.topSellers,
        localized(language, {
          en: "There is not enough sales data yet.",
          hi: "अभी पर्याप्त बिक्री डेटा नहीं है।",
          hinglish: "Abhi enough sales data nahi hai.",
        }),
        language,
      ),
      sourceFacts,
    };
  }

  if (intent === "AGING_STOCK") {
    return {
      title: localized(language, {
        en: "Oldest inventory",
        hi: "सबसे पुराना स्टॉक",
        hinglish: "Sabse purana stock",
      }),
      answer: localized(language, {
        en: `The oldest available inventory is ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} days old.`,
        hi: `सबसे पुराना उपलब्ध स्टॉक ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} दिन पुराना है।`,
        hinglish: `Sabse purana available stock ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} din purana hai.`,
      }),
      bullets: topLines(
        insights.agingInventory,
        localized(language, {
          en: "No stock-age signal is available yet.",
          hi: "अभी स्टॉक की उम्र का डेटा उपलब्ध नहीं है।",
          hinglish: "Abhi stock-age data available nahi hai.",
        }),
        language,
      ),
      sourceFacts,
    };
  }

  return {
    title: localized(language, {
      en: "Live inventory summary",
      hi: "लाइव इन्वेंटरी सारांश",
      hinglish: "Live inventory summary",
    }),
    answer: localized(language, {
      en: `${insights.stats.productsAnalyzed.toLocaleString("en-IN")} products analyzed. ${insights.stats.reorderNow.toLocaleString("en-IN")} need reorder review, missed demand is ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} units, and the oldest stock is ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} days old.`,
      hi: `${insights.stats.productsAnalyzed.toLocaleString("en-IN")} प्रोडक्ट का विश्लेषण हुआ। ${insights.stats.reorderNow.toLocaleString("en-IN")} को रीऑर्डर समीक्षा चाहिए, छूटी हुई मांग ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} यूनिट है और सबसे पुराना स्टॉक ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} दिन पुराना है।`,
      hinglish: `${insights.stats.productsAnalyzed.toLocaleString("en-IN")} products analyze hue. ${insights.stats.reorderNow.toLocaleString("en-IN")} ko reorder review chahiye, missed demand ${insights.stats.totalMissedDemand.toLocaleString("en-IN")} units hai aur sabse purana stock ${insights.stats.oldestInventoryDays.toLocaleString("en-IN")} din purana hai.`,
    }),
    bullets: topLines(
      insights.recommendations,
      localized(language, {
        en: "There is not enough inventory data yet.",
        hi: "अभी पर्याप्त इन्वेंटरी डेटा नहीं है।",
        hinglish: "Abhi enough inventory data nahi hai.",
      }),
      language,
    ),
    sourceFacts,
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
