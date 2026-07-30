import assert from "node:assert/strict";
import test from "node:test";
import {
  detectInventoryQuestionIntent,
  getInventoryAiChatAnswer,
  type InventoryAiInsights,
} from "../src/lib/inventory-ai-insights";

const emptyInsights: InventoryAiInsights = {
  generatedAt: new Date("2026-07-30T12:00:00.000Z"),
  stats: {
    productsAnalyzed: 12,
    reorderNow: 3,
    watchItems: 1,
    topSelling: 2,
    lowSelling: 2,
    deadStock: 1,
    totalMissedDemand: 8,
    oldestInventoryDays: 91,
  },
  dataSources: {
    products: 12,
    orders: 20,
    orderItems: 24,
    deliveredUnits: 42,
    inquiries: 6,
    missedSalesInquiries: 2,
    missedDemandUnits: 8,
    activeBlocks: 1,
    activeBlockedUnits: 2,
    lowStockProducts: 3,
    outOfStockProducts: 1,
    lastProductUpdateAt: null,
    lastOrderAt: null,
    lastInquiryAt: null,
    lastBlockAt: null,
  },
  recommendations: [],
  reorderAlerts: [],
  topSellers: [],
  lowSellers: [],
  agingInventory: [],
};

test("inventory questions understand English, Hindi and natural Hinglish", () => {
  assert.equal(
    detectInventoryQuestionIntent("What should I reorder first?"),
    "REORDER",
  );
  assert.equal(
    detectInventoryQuestionIntent("sabse pehle kaunsa maal mangwana chahiye"),
    "REORDER",
  );
  assert.equal(
    detectInventoryQuestionIntent("कौन सा स्टॉक सबसे पहले मंगवाना चाहिए?"),
    "REORDER",
  );
  assert.equal(
    detectInventoryQuestionIntent("kaunsa maal bilkul nahi bik raha hai"),
    "SLOW_STOCK",
  );
  assert.equal(
    detectInventoryQuestionIntent("सबसे ज्यादा बिकने वाला प्रोडक्ट बताओ"),
    "TOP_SELLERS",
  );
});

test("inventory intent matching also accepts common non-English wording", () => {
  assert.equal(
    detectInventoryQuestionIntent("productos más vendidos"),
    "TOP_SELLERS",
  );
  assert.equal(
    detectInventoryQuestionIntent("quel est le stock le plus ancien"),
    "AGING_STOCK",
  );
  assert.equal(
    detectInventoryQuestionIntent("ما هو المخزون الأكثر مبيعا"),
    "TOP_SELLERS",
  );
});

test("inventory answers follow Hindi and Hinglish input language", () => {
  const hindiAnswer = getInventoryAiChatAnswer(
    emptyInsights,
    "कौन सा स्टॉक मंगवाना चाहिए?",
  );
  const hinglishAnswer = getInventoryAiChatAnswer(
    emptyInsights,
    "bhai kaunsa stock mangwana chahiye",
  );

  assert.equal(hindiAnswer.title, "रीऑर्डर प्राथमिकता");
  assert.match(hindiAnswer.answer, /जरूरत/);
  assert.equal(hinglishAnswer.title, "Reorder priority");
  assert.match(hinglishAnswer.answer, /zarurat/);
});
