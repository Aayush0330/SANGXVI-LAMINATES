import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  stack: string;
  quantity: number;
  blocked: number;
  minimumStock: number;
  maximumStock: number;
  unit: string;
  status: string;
  updatedAt: Date;
};

type CalendarPriority = "critical" | "high" | "medium" | "watch" | "healthy";

type CalendarItem = {
  product: ProductRow;
  availableStock: number;
  shortage: number;
  priority: CalendarPriority;
  reorderDate: Date;
  recommendedQuantity: number;
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isSameDate(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getAvailableStock(product: ProductRow) {
  return Math.max(product.quantity, 0);
}

function getPriority(
  product: ProductRow,
  availableStock: number,
): CalendarPriority {
  if (availableStock <= 0) return "critical";
  if (availableStock <= product.minimumStock) return "high";
  if (availableStock <= Math.ceil(product.minimumStock * 1.25)) return "medium";
  if (availableStock <= Math.ceil(product.minimumStock * 1.5)) return "watch";

  return "healthy";
}

function getPriorityLabel(priority: CalendarItem["priority"]) {
  if (priority === "critical") return "Critical";
  if (priority === "high") return "Reorder Now";
  if (priority === "medium") return "Reorder Soon";
  if (priority === "watch") return "Watch";
  return "Healthy";
}

function getPriorityClass(priority: CalendarItem["priority"]) {
  if (priority === "critical") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300";
  }

  if (priority === "high") {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300";
  }

  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300";
  }

  if (priority === "watch") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300";
}

function getReorderDate(priority: CalendarItem["priority"]) {
  const today = startOfToday();

  if (priority === "critical") return today;
  if (priority === "high") return today;
  if (priority === "medium") return addDays(today, 2);
  if (priority === "watch") return addDays(today, 5);

  return addDays(today, 7);
}

function getRecommendedQuantity(product: ProductRow, availableStock: number) {
  if (availableStock > product.minimumStock) return 0;
  return Math.max(product.maximumStock - availableStock, 0);
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

function ProductMiniCard({ item }: { item: CalendarItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">
            {item.product.name}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {item.product.code} · Stack {item.product.stack}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getPriorityClass(
            item.priority,
          )}`}
        >
          {getPriorityLabel(item.priority)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Available
          </p>
          <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
            {item.availableStock}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Min / Max
          </p>
          <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
            {item.product.minimumStock} / {item.product.maximumStock}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Reorder
          </p>
          <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
            {item.recommendedQuantity}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function InventoryCalendarPage() {
  const { hasAccess } = await checkPermission("manage_inventory");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Inventory Calendar Access Denied"
        description="Your current role does not have permission to access the Inventory Calendar module."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [
      {
        minimumStock: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
  });

  const calendarItems: CalendarItem[] = products
    .map((product) => {
      const availableStock = getAvailableStock(product);
      const priority = getPriority(product, availableStock);
      const shortage = Math.max(product.minimumStock - availableStock, 0);

      return {
        product,
        availableStock,
        shortage,
        priority,
        reorderDate: getReorderDate(priority),
        recommendedQuantity: getRecommendedQuantity(product, availableStock),
      };
    })
    .filter((item) => item.priority !== "healthy")
    .sort((firstItem, secondItem) => {
      const priorityOrder = {
        critical: 0,
        high: 1,
        medium: 2,
        watch: 3,
        healthy: 4,
      };

      return (
        priorityOrder[firstItem.priority] - priorityOrder[secondItem.priority] ||
        secondItem.shortage - firstItem.shortage
      );
    });

  const today = startOfToday();
  const calendarDays = Array.from({ length: 8 }, (_, index) =>
    addDays(today, index),
  );

  const criticalCount = calendarItems.filter(
    (item) => item.priority === "critical",
  ).length;
  const reorderNowCount = calendarItems.filter(
    (item) => item.priority === "critical" || item.priority === "high",
  ).length;
  const watchCount = calendarItems.filter(
    (item) => item.priority === "medium" || item.priority === "watch",
  ).length;
  const healthyCount = products.length - calendarItems.length;

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-200">
                Inventory Calendar
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Stock target reorder calendar
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                This calendar highlights products that have reached or are close
                to their minimum stock level and recommends the quantity needed
                to refill them toward their maximum stock target.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/internal/inventory"
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                Manage Inventory
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 lg:p-6">
          <MetricCard
            label="Reorder Now"
            value={reorderNowCount.toLocaleString("en-IN")}
            helper="Products at or below minimum stock."
          />
          <MetricCard
            label="Critical"
            value={criticalCount.toLocaleString("en-IN")}
            helper="Products with no available stock."
          />
          <MetricCard
            label="Watchlist"
            value={watchCount.toLocaleString("en-IN")}
            helper="Products close to the minimum stock level."
          />
          <MetricCard
            label="Healthy"
            value={healthyCount.toLocaleString("en-IN")}
            helper="Products currently above reorder risk."
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">
              8 Day Reorder View
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Calendar by suggested reorder date
            </h2>
          </div>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            Generated on {formatDate(new Date())}
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          {calendarDays.map((day) => {
            const dayItems = calendarItems.filter((item) =>
              isSameDate(item.reorderDate, day),
            );

            return (
              <div
                key={day.toISOString()}
                className="min-h-56 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      {formatDay(day)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                      {isSameDate(day, today) ? "Today" : "Planned reorder"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800">
                    {dayItems.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {dayItems.length > 0 ? (
                    dayItems.slice(0, 4).map((item) => (
                      <div
                        key={`${day.toISOString()}-${item.product.id}`}
                        className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-slate-950 dark:text-white">
                              {item.product.name}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                              {item.product.code}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-black ${getPriorityClass(
                              item.priority,
                            )}`}
                          >
                            {getPriorityLabel(item.priority)}
                          </span>
                        </div>
                        <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Available {item.availableStock} {item.product.unit} · Min / Max{" "}
                          {item.product.minimumStock} / {item.product.maximumStock} · Reorder{" "}
                          {item.recommendedQuantity} {item.product.unit}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center dark:border-slate-700">
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                        No reorder action planned.
                      </p>
                    </div>
                  )}

                  {dayItems.length > 4 ? (
                    <p className="text-center text-xs font-black text-slate-500 dark:text-slate-400">
                      +{dayItems.length - 4} more products
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600 dark:text-orange-300">
              Reorder Queue
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              Products needing inventory attention
            </h2>
          </div>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {calendarItems.length.toLocaleString("en-IN")} products listed
          </p>
        </div>

        {calendarItems.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {calendarItems.map((item) => (
              <ProductMiniCard key={item.product.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <p className="text-lg font-black text-slate-950 dark:text-white">
              All products are currently above reorder risk.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Products will appear here automatically when available stock gets
              close to the minimum stock level.
            </p>
          </div>
        )}
      </section>
    </main>
  );
} 
