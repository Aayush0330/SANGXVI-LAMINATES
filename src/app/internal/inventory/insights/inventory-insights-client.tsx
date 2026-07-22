"use client";

import { useMemo, useState } from "react";
import type { InventoryInsight } from "./page";

type StockFilter =
  | "available"
  | "all"
  | "healthy"
  | "low"
  | "out"
  | "no-sale"
  | "top";

type SortOption =
  | "sold-desc"
  | "highest-sale-desc"
  | "last-sale-asc"
  | "stock-desc"
  | "age-desc"
  | "newest";

type HighlightTone = "green" | "red" | "orange" | "neutral";

function formatDate(date: string | null) {
  if (!date) return "No data";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatNumber(value: number) {
  return value.toLocaleString("en-IN");
}

function formatPercent(value: number) {
  return `${Math.round(value).toLocaleString("en-IN")}%`;
}

function getTagLabel(tag: InventoryInsight["tag"]) {
  if (tag === "OUT_OF_STOCK") return "Out of Stock";
  if (tag === "REORDER") return "Low Stock";
  if (tag === "TOP_SELLER") return "Top Seller";
  if (tag === "SELLING") return "Selling";
  if (tag === "SLOW_MOVING") return "Slow Moving";
  if (tag === "NO_SALE") return "No Sale";
  if (tag === "WATCH") return "Watch";
  return "Healthy";
}

function getTagClass(tag: InventoryInsight["tag"]) {
  if (tag === "OUT_OF_STOCK") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300";
  }

  if (tag === "REORDER") {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300";
  }

  if (tag === "TOP_SELLER" || tag === "SELLING" || tag === "HEALTHY") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (tag === "SLOW_MOVING" || tag === "NO_SALE") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300";
  }

  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300";
}

function getCardClass(tag: InventoryInsight["tag"]) {
  if (tag === "OUT_OF_STOCK") {
    return "border-red-200 bg-gradient-to-br from-white to-red-50/80 shadow-red-100/70 dark:border-red-400/20 dark:from-slate-950 dark:to-red-950/20";
  }

  if (tag === "REORDER") {
    return "border-orange-200 bg-gradient-to-br from-white to-orange-50/80 shadow-orange-100/70 dark:border-orange-400/20 dark:from-slate-950 dark:to-orange-950/20";
  }

  if (tag === "TOP_SELLER" || tag === "SELLING" || tag === "HEALTHY") {
    return "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/80 shadow-emerald-100/70 dark:border-emerald-400/20 dark:from-slate-950 dark:to-emerald-950/20";
  }

  if (tag === "SLOW_MOVING" || tag === "NO_SALE") {
    return "border-amber-200 bg-gradient-to-br from-white to-amber-50/80 shadow-amber-100/70 dark:border-amber-400/20 dark:from-slate-950 dark:to-amber-950/20";
  }

  return "border-blue-200 bg-gradient-to-br from-white to-blue-50/70 shadow-blue-100/70 dark:border-blue-400/20 dark:from-slate-950 dark:to-blue-950/20";
}

function getHighlightTone(daysWithoutSale: number): HighlightTone {
  if (daysWithoutSale >= 30) return "red";
  if (daysWithoutSale >= 15) return "orange";
  return "green";
}

function getPositiveMetricTone(value: number | null | undefined): HighlightTone {
  return (value ?? 0) > 0 ? "green" : "red";
}

function applyStockFilter(items: InventoryInsight[], filter: StockFilter) {
  if (filter === "all") return items;

  if (filter === "available") {
    return items.filter((item) => item.availableStock > 0);
  }

  if (filter === "healthy") {
    return items.filter(
      (item) =>
        item.availableStock > item.minimumStock &&
        ["HEALTHY", "SELLING", "TOP_SELLER"].includes(item.tag),
    );
  }

  if (filter === "low") {
    return items.filter(
      (item) => item.tag === "REORDER" && item.availableStock > 0,
    );
  }

  if (filter === "out") {
    return items.filter((item) => item.tag === "OUT_OF_STOCK");
  }

  if (filter === "no-sale") {
    return items.filter(
      (item) =>
        item.availableStock > 0 &&
        (item.tag === "NO_SALE" || item.tag === "SLOW_MOVING"),
    );
  }

  if (filter === "top") {
    return items.filter((item) => item.tag === "TOP_SELLER");
  }

  return items;
}

function sortItems(items: InventoryInsight[], sort: SortOption) {
  const sorted = [...items];

  if (sort === "sold-desc") {
    return sorted.sort((a, b) => b.totalSold - a.totalSold);
  }

  if (sort === "highest-sale-desc") {
    return sorted.sort((a, b) => b.highestSingleSale - a.highestSingleSale);
  }

  if (sort === "last-sale-asc") {
    return sorted.sort((a, b) => b.daysWithoutSale - a.daysWithoutSale);
  }

  if (sort === "stock-desc") {
    return sorted.sort((a, b) => b.availableStock - a.availableStock);
  }

  if (sort === "age-desc") {
    return sorted.sort((a, b) => b.stockAgeDays - a.stockAgeDays);
  }

  return sorted.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function searchItems(items: InventoryInsight[], query: string) {
  const q = query.trim().toLowerCase();

  if (!q) return items;

  return items.filter((item) =>
    `${item.name} ${item.code} ${item.stack} ${item.status} ${item.categoryName} ${item.brandName} ${item.unit}`
      .toLowerCase()
      .includes(q),
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
        {helper}
      </p>
    </div>
  );
}

function HighlightCard({
  label,
  title,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  title: string;
  value: string;
  helper: string;
  tone?: HighlightTone;
}) {
  const toneClasses =
    tone === "green"
      ? {
          wrapper:
            "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/90 shadow-emerald-100/70 dark:border-emerald-400/20 dark:from-slate-950 dark:to-emerald-950/20",
          label: "text-emerald-700 dark:text-emerald-300",
          value: "text-emerald-700 dark:text-emerald-300",
          pill: "bg-emerald-500",
        }
      : tone === "red"
        ? {
            wrapper:
              "border-red-200 bg-gradient-to-br from-white to-red-50/90 shadow-red-100/70 dark:border-red-400/20 dark:from-slate-950 dark:to-red-950/20",
            label: "text-red-700 dark:text-red-300",
            value: "text-red-700 dark:text-red-300",
            pill: "bg-red-500",
          }
        : tone === "orange"
          ? {
              wrapper:
                "border-orange-200 bg-gradient-to-br from-white to-orange-50/90 shadow-orange-100/70 dark:border-orange-400/20 dark:from-slate-950 dark:to-orange-950/20",
              label: "text-orange-700 dark:text-orange-300",
              value: "text-orange-700 dark:text-orange-300",
              pill: "bg-orange-500",
            }
          : {
              wrapper:
                "border-slate-200 bg-white shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950",
              label: "text-blue-600 dark:text-blue-300",
              value: "text-slate-950 dark:text-white",
              pill: "bg-blue-500",
            };

  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border p-5 shadow-sm dark:shadow-none ${toneClasses.wrapper}`}
    >
      <div
        className={`absolute right-5 top-5 h-3 w-3 rounded-full ${toneClasses.pill}`}
      />

      <p
        className={`text-xs font-black uppercase tracking-[0.18em] ${toneClasses.label}`}
      >
        {label}
      </p>

      <h2 className="mt-3 text-xl font-black text-slate-950 dark:text-white">
        {title}
      </h2>

      <p className={`mt-2 text-3xl font-black ${toneClasses.value}`}>
        {value}
      </p>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
        {helper}
      </p>
    </div>
  );
}

function ProductInsightCard({ item }: { item: InventoryInsight }) {
  return (
    <article
      className={`rounded-[1.75rem] border p-5 shadow-sm dark:shadow-none ${getCardClass(
        item.tag,
      )}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-black text-slate-950 dark:text-white">
            {item.name}
          </h3>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
            {item.code} · {item.brandName} · {item.categoryName} · Stack {item.stack}
          </p>
        </div>

        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${getTagClass(
            item.tag,
          )}`}
        >
          {getTagLabel(item.tag)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/70 p-4 dark:bg-slate-900/70">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Added On
          </p>
          <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
            {formatDate(item.createdAt)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {formatNumber(item.stockAgeDays)} days old
          </p>
        </div>

        <div className="rounded-2xl bg-white/70 p-4 dark:bg-slate-900/70">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Current Stock
          </p>
          <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
            {formatNumber(item.quantity)} total ·{" "}
            {formatNumber(item.availableStock)} {item.unit} available
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {formatNumber(item.activeBlockedQuantity)} blocked · Min / Max{" "}
            {formatNumber(item.minimumStock)} / {formatNumber(item.maximumStock)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/70 p-4 dark:bg-slate-900/70">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Sales
          </p>
          <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
            {formatNumber(item.totalSold)} sold ·{" "}
            {formatNumber(item.totalOrdered)} ordered
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            Sell-through {formatPercent(item.sellThroughPercent)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/70 p-4 dark:bg-slate-900/70">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Last Sale
          </p>
          <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
            {item.lastSaleAt ? formatDate(item.lastSaleAt) : "No sale yet"}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {formatNumber(item.daysWithoutSale)} days without sale
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl border border-white/70 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/70 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Last Sale Quantity
          </p>
          <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
            {formatNumber(item.lastSaleQuantity)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {item.lastSaleOrderNumber ?? "No order yet"}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Highest Single Sale
          </p>
          <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
            {formatNumber(item.highestSingleSale)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {item.highestSaleOrderNumber ?? "No sale yet"}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Recent Sales
          </p>
          <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
            {formatNumber(item.salesLast30Days)} in 30 days
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {formatNumber(item.salesLast90Days)} in 90 days
          </p>
        </div>

        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            Demand Signals
          </p>
          <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">
            {formatNumber(item.inquiryDemand)} inquiry demand
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {formatNumber(item.missedSalesDemand)} missed demand
          </p>
        </div>
      </div>
    </article>
  );
}

export function InventoryInsightsClient({
  insights,
}: {
  insights: InventoryInsight[];
}) {
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("available");
  const [sort, setSort] = useState<SortOption>("sold-desc");

  const filteredInsights = useMemo(() => {
    const searched = searchItems(insights, query);
    const stockFiltered = applyStockFilter(searched, stockFilter);
    return sortItems(stockFiltered, sort);
  }, [insights, query, stockFilter, sort]);

  const availableInsights = insights.filter((item) => item.availableStock > 0);

  const totalProducts = insights.length;
  const totalStock = insights.reduce((total, item) => total + item.quantity, 0);
  const availableStock = insights.reduce(
    (total, item) => total + item.availableStock,
    0,
  );
  const totalSold = insights.reduce((total, item) => total + item.totalSold, 0);
  const totalBlocked = insights.reduce(
    (total, item) => total + item.activeBlockedQuantity,
    0,
  );
  const outOfStockProducts = insights.filter(
    (item) => item.tag === "OUT_OF_STOCK",
  ).length;
  const reorderProducts = insights.filter(
    (item) => item.tag === "REORDER",
  ).length;

  const topSeller = [...insights].sort((a, b) => b.totalSold - a.totalSold)[0];

  const highestSingleSale = [...insights].sort(
    (a, b) => b.highestSingleSale - a.highestSingleSale,
  )[0];

  const oldestWithoutSale = [...availableInsights].sort(
    (a, b) => b.daysWithoutSale - a.daysWithoutSale,
  )[0];

  const oldestWithoutSaleTone = getHighlightTone(
    oldestWithoutSale?.daysWithoutSale ?? 0,
  );
  const topSellerTone = getPositiveMetricTone(topSeller?.totalSold);
  const highestSingleSaleTone = getPositiveMetricTone(
    highestSingleSale?.highestSingleSale,
  );
  const oldestAvailableTone: HighlightTone = !oldestWithoutSale
    ? "neutral"
    : !oldestWithoutSale.lastSaleAt || oldestWithoutSale.daysWithoutSale <= 0
      ? "red"
      : oldestWithoutSaleTone;

  return (
    <div className="space-y-6 p-5 lg:p-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Products"
          value={formatNumber(totalProducts)}
          helper={`${formatNumber(totalStock)} total stock units in inventory.`}
        />
        <MetricCard
          label="Available Stock"
          value={formatNumber(availableStock)}
          helper={`${formatNumber(totalBlocked)} units currently blocked.`}
        />
        <MetricCard
          label="Total Sold"
          value={formatNumber(totalSold)}
          helper="Only delivered quantity is counted as sold."
        />
        <MetricCard
          label="Stock Risk"
          value={formatNumber(outOfStockProducts + reorderProducts)}
          helper={`${formatNumber(outOfStockProducts)} out of stock · ${formatNumber(
            reorderProducts,
          )} low stock.`}
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        <HighlightCard
          label="Top Seller"
          title={topSeller?.name ?? "No product found"}
          value={`${formatNumber(topSeller?.totalSold ?? 0)} sold`}
          helper={
            topSeller
              ? `${topSeller.code} · Last sale ${formatDate(topSeller.lastSaleAt)}`
              : "Delivered orders are required for this insight."
          }
          tone={topSellerTone}
        />

        <HighlightCard
          label="Highest Single Sale"
          title={highestSingleSale?.name ?? "No product found"}
          value={`${formatNumber(highestSingleSale?.highestSingleSale ?? 0)} units`}
          helper={
            highestSingleSale
              ? `${highestSingleSale.highestSaleOrderNumber ?? "No order"} · ${formatDate(
                  highestSingleSale.highestSaleAt,
                )}`
              : "No sale record available yet."
          }
          tone={highestSingleSaleTone}
        />

        <HighlightCard
          label="Oldest Available Without Sale"
          title={oldestWithoutSale?.name ?? "No available product found"}
          value={`${formatNumber(oldestWithoutSale?.daysWithoutSale ?? 0)} days`}
          helper={
            oldestWithoutSale
              ? `${oldestWithoutSale.code} · Available stock ${formatNumber(
                  oldestWithoutSale.availableStock,
                )}`
              : "Out-of-stock products are excluded from this card."
          }
          tone={oldestAvailableTone}
        />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">
              Product Ledger
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              All stock with sales history
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Showing {formatNumber(filteredInsights.length)} of{" "}
              {formatNumber(insights.length)} products. Filters apply instantly.
            </p>
          </div>

          <div className="grid w-full gap-3 xl:w-auto xl:min-w-[820px] xl:grid-cols-[1fr_220px_220px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, brand, category, code or stack"
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400/40 dark:focus:ring-blue-500/10"
            />

            <select
              value={stockFilter}
              onChange={(event) =>
                setStockFilter(event.target.value as StockFilter)
              }
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400/40 dark:focus:ring-blue-500/10"
            >
              <option value="available">Available Stock Only</option>
              <option value="all">All Products</option>
              <option value="healthy">Healthy Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
              <option value="no-sale">No Sale / Slow Moving</option>
              <option value="top">Top Sellers</option>
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400/40 dark:focus:ring-blue-500/10"
            >
              <option value="sold-desc">Most Sold</option>
              <option value="highest-sale-desc">Highest Single Sale</option>
              <option value="last-sale-asc">Longest Without Sale</option>
              <option value="stock-desc">Highest Available Stock</option>
              <option value="age-desc">Oldest Added Stock</option>
              <option value="newest">Newest Added</option>
            </select>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
          Calculation: available stock = current stock minus active blocked
          stock. Sold quantity is counted only from delivered quantity. Days
          without sale means days from the latest delivered sale; if no sale
          exists, it uses the product added date. Out-of-stock products are
          hidden by default and can be viewed from the Out of Stock filter.
        </div>

        <div className="mt-5 space-y-4">
          {filteredInsights.length > 0 ? (
            filteredInsights.map((item) => (
              <ProductInsightCard key={item.id} item={item} />
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <p className="text-lg font-black text-slate-950 dark:text-white">
                No products found.
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Try another search term or change the stock filter.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
