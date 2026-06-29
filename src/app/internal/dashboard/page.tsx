import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderDisplayName } from "@/lib/order-fulfillment";
import { getOrdersWithRelations, getOrderStatusRows } from "@/lib/order-queries";
import { roleLabels } from "@/lib/permissions";

function getOrderStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getStatusClass(status: string) {
  if (status === "DELIVERED") {
    return "bg-emerald-300/10 text-emerald-300 ring-1 ring-emerald-300/20";
  }

  if (status === "CANCELLED") {
    return "bg-red-300/10 text-red-300 ring-1 ring-red-300/20";
  }

  if (status === "LOW_STOCK" || status === "OUT_OF_STOCK") {
    return "bg-yellow-300/10 text-yellow-300 ring-1 ring-yellow-300/20";
  }

  return "bg-cyan-300/10 text-cyan-300 ring-1 ring-cyan-300/20";
}

function StatIcon({ type }: { type: "box" | "stock" | "blocked" | "alert" | "order" | "dealer" }) {
  if (type === "stock") {
    return (
      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7.5L12 3L20 7.5L12 12L4 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 12L12 16.5L20 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16.5L12 21L20 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "blocked") {
    return (
      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10V8C7 5.24 9.24 3 12 3C14.76 3 17 5.24 17 8V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5.5 10H18.5V20H5.5V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 14V16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "alert") {
    return (
      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4L21 20H3L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 9V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "order") {
    return (
      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 4.5H17V19.5H7V4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M10 8.5H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10 15.5H12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "dealer") {
    return (
      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 7H18L17 20H7L6 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 7C9 4.8 10.1 3.5 12 3.5C13.9 3.5 15 4.8 15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5L12 3L20 7.5L12 12L4 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4 7.5V16.5L12 21V12L4 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 7.5V16.5L12 21V12L20 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export default async function InternalDashboardPage() {
  const { hasAccess, currentUser } = await checkPermission(
    "view_internal_dashboard"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Dashboard Access Denied"
        description="Your current role does not have permission to access the Internal ERP dashboard."
        backHref="/login"
        backLabel="Switch User"
      />
    );
  }

  const [products, orders, activeDealers] = await Promise.all([
    prisma.product.findMany({
      orderBy: {
        createdAt: "asc",
      },
    }),
    getOrdersWithRelations({ limit: 6 }),
    prisma.user.count({
      where: {
        role: "DEALER",
        status: "ACTIVE",
      },
    }),
  ]);

  const allOrders = await getOrderStatusRows();

  const totalProducts = products.length;
  const availableStock = products.reduce(
    (total, product) => total + product.quantity,
    0
  );
  const blockedStock = products.reduce(
    (total, product) => total + product.blocked,
    0
  );
  const lowStockItems = products.filter(
    (product) =>
      product.status === "LOW_STOCK" ||
      product.status === "OUT_OF_STOCK" ||
      product.quantity <= product.minimumStock
  ).length;

  const totalOrders = allOrders.length;
  const deliveredOrders = allOrders.filter(
    (order) => order.status === "DELIVERED"
  ).length;
  const pendingOrders = allOrders.filter(
    (order) => order.status !== "DELIVERED" && order.status !== "CANCELLED"
  ).length;

  const dashboardStats = [
    {
      label: "Total Products",
      value: totalProducts.toLocaleString("en-IN"),
      helper: "Inventory items",
      icon: "box" as const,
    },
    {
      label: "Available Stock",
      value: availableStock.toLocaleString("en-IN"),
      helper: "Ready quantity",
      icon: "stock" as const,
    },
    {
      label: "Blocked Stock",
      value: blockedStock.toLocaleString("en-IN"),
      helper: "Reserved orders",
      icon: "blocked" as const,
    },
    {
      label: "Low Stock Items",
      value: String(lowStockItems).padStart(2, "0"),
      helper: "Needs attention",
      icon: "alert" as const,
    },
    {
      label: "Total Orders",
      value: totalOrders.toLocaleString("en-IN"),
      helper: "All dealer orders",
      icon: "order" as const,
    },
    {
      label: "Pending Orders",
      value: pendingOrders.toLocaleString("en-IN"),
      helper: "In workflow",
      icon: "order" as const,
    },
    {
      label: "Delivered",
      value: deliveredOrders.toLocaleString("en-IN"),
      helper: "Completed",
      icon: "stock" as const,
    },
    {
      label: "Active Dealers",
      value: activeDealers.toLocaleString("en-IN"),
      helper: "Dealer accounts",
      icon: "dealer" as const,
    },
  ];

  const stockAlerts = products
    .filter(
      (product) =>
        product.status === "LOW_STOCK" ||
        product.status === "OUT_OF_STOCK" ||
        product.quantity <= product.minimumStock
    )
    .slice(0, 5);

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300 sm:text-sm">
              Internal Dashboard
            </p>

            <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-4xl lg:text-5xl">
              {roleLabels[currentUser.role]}
            </h1>

            <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm sm:leading-6">
              Live overview of inventory, orders, blocked stock, deliveries, and
              dealer activity.
            </p>
          </div>

          <Link
            href="/internal/inventory"
            className="inline-flex w-fit rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300 hover:text-slate-950 sm:px-5 sm:py-3 sm:text-sm"
          >
            Open Inventory
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/10 sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs leading-4 text-slate-400 sm:text-sm">
                {stat.label}
              </p>

              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-300 sm:h-10 sm:w-10">
                <StatIcon type={stat.icon} />
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold leading-none sm:text-4xl">
              {stat.value}
            </h2>

            <p className="mt-3 text-[11px] leading-4 text-slate-500 sm:text-sm">
              {stat.helper}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-4 sm:p-6">
            <h2 className="text-lg font-bold sm:text-xl">Recent Orders</h2>
            <p className="mt-2 text-xs text-slate-400 sm:text-sm">
              Latest dealer orders and current workflow status.
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {orders.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">
                No orders found yet.
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 p-4 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      {getOrderDisplayName(order.items)}
                    </p>

                    <p className="mt-1 truncate text-xs text-slate-500">
                      {order.orderNumber} · {order.dealer.name}
                      {order.assignedDriver
                        ? ` · Driver: ${order.assignedDriver.name}`
                        : ""}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-[11px] font-bold sm:text-xs ${getStatusClass(
                      order.status
                    )}`}
                  >
                    {getOrderStatusLabel(order.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 p-4 sm:p-6">
            <h2 className="text-lg font-bold sm:text-xl">Stock Alerts</h2>
            <p className="mt-2 text-xs text-slate-400 sm:text-sm">
              Products that need inventory attention.
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {stockAlerts.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">
                No low stock alerts.
              </div>
            ) : (
              stockAlerts.map((product) => (
                <div key={product.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {product.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {product.code} · {product.stack}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${getStatusClass(
                        product.status
                      )}`}
                    >
                      {product.quantity}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Minimum stock: {product.minimumStock}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
