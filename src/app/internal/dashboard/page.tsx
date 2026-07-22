import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { AccountantFinanceDashboard } from "@/components/accountant-finance-dashboard";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
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
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300/20";
  }

  if (status === "CANCELLED") {
    return "bg-red-50 text-red-700 ring-1 ring-red-300/20";
  }

  if (status === "LOW_STOCK" || status === "OUT_OF_STOCK") {
    return "bg-amber-50 text-yellow-300 ring-1 ring-yellow-300/20";
  }

  return "bg-blue-50 text-blue-600 ring-1 ring-blue-100";
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
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const isAccountantFocused =
    currentUser.roles.includes("accountant") &&
    !currentUser.roles.some((role) =>
      ["owner", "manager", "dispatch_team", "order_team", "qc_team"].includes(role),
    );

  if (isAccountantFocused) {
    return <AccountantFinanceDashboard currentUser={currentUser} />;
  }

  const [products, orders, activeDealers, missedSalesRows] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
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
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS "count"
      FROM public."InventoryInquiry"
      WHERE "status" = 'MISSED_SALE'
    `,
  ]);

  const allOrders = await getOrderStatusRows();

  const totalProducts = products.length;
  const lowStockItems = products.filter(
    (product) =>
      product.status === "LOW_STOCK" ||
      product.status === "OUT_OF_STOCK" ||
      product.quantity <= product.minimumStock
  ).length;

  const totalOrders = allOrders.length;
  const missedSales = Number(missedSalesRows[0]?.count ?? 0);
  const deliveredOrders = allOrders.filter(
    (order) => order.status === "DELIVERED"
  ).length;
  const pendingOrders = allOrders.filter(
    (order) => order.status !== "DELIVERED" && order.status !== "CANCELLED"
  ).length;

  const stockAlerts = products
    .filter(
      (product) =>
        product.status === "LOW_STOCK" ||
        product.status === "OUT_OF_STOCK" ||
        product.quantity <= product.minimumStock
    )
    .slice(0, 5);

  const heroStats = [
    {
      label: "Products",
      value: totalProducts.toLocaleString("en-IN"),
      helper: `${lowStockItems} low-stock checks today`,
      icon: "box" as const,
      accent: "blue",
    },
    {
      label: "Orders",
      value: totalOrders.toLocaleString("en-IN"),
      helper: `${pendingOrders} pending workflow`,
      icon: "order" as const,
      accent: "cyan",
    },
    {
      label: "Dealers",
      value: activeDealers.toLocaleString("en-IN"),
      helper: "Active dealer accounts",
      icon: "dealer" as const,
      accent: "emerald",
    },
    {
      label: "Missed Sales",
      value: missedSales.toLocaleString("en-IN"),
      helper: "High priority follow-ups",
      icon: "alert" as const,
      accent: "orange",
    },
  ];

  const workflowOrders = orders.slice(0, 3);
  const liveActivities = [
    {
      title: deliveredOrders > 0 ? "Dispatch movement" : "Workflow ready",
      body: `${deliveredOrders.toLocaleString("en-IN")} delivered orders tracked`,
      tone: "emerald",
    },
    {
      title: "Stock alert",
      body: `${lowStockItems.toLocaleString("en-IN")} products need inventory attention`,
      tone: "orange",
    },
    {
      title: "Dealer activity",
      body: `${activeDealers.toLocaleString("en-IN")} active dealer accounts`,
      tone: "cyan",
    },
  ];

  return (
    <div className="relative -m-3 overflow-hidden rounded-[2rem] bg-[#f5f8fc] p-3 text-slate-950 sm:-m-6 sm:p-6 lg:-m-10 lg:p-8 dark:bg-slate-950 dark:text-white">
      <div className="pointer-events-none absolute -right-24 -top-40 h-[31rem] w-[31rem] rounded-full bg-cyan-200/70 blur-3xl dark:bg-cyan-500/10" />
      <div className="pointer-events-none absolute bottom-[-12rem] left-72 h-[28rem] w-[28rem] rounded-full bg-blue-200/70 blur-3xl dark:bg-blue-500/10" />

      <div className="relative space-y-5 sm:space-y-6">
        <section className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600 sm:text-xs dark:text-cyan-300">
              Operations Dashboard
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
              Sanghvi ERP
            </h1>

            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Live ERP view for inventory, orders, dispatch and task health.
              Current role: {roleLabels[currentUser.role]}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/internal/inventory"
              className="inline-flex w-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 sm:px-5 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              Open Inventory
            </Link>
            <Link
              href="/internal/inquiries"
              className="inline-flex w-fit rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white shadow-lg shadow-slate-900/10 transition hover:bg-blue-700 sm:px-5 dark:bg-cyan-300 dark:text-slate-950"
            >
              Add Inquiry
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {heroStats.map((stat) => (
          <div
            key={stat.label}
              className="rounded-[1.75rem] border border-white/80 bg-white p-5 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none"
          >
            <div className="flex items-start justify-between gap-3">
                <div
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                    stat.accent === "emerald"
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"
                      : stat.accent === "orange"
                        ? "bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300"
                        : stat.accent === "cyan"
                          ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"
                  }`}
                >
                  <StatIcon type={stat.icon} />
                </div>

                <p className="pt-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
            </div>

              <h2 className="mt-5 text-3xl font-black leading-none tracking-tight sm:text-4xl">
              {stat.value}
            </h2>
              <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {stat.helper}
              </p>
          </div>
        ))}
      </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_342px]">
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black tracking-tight">Today&apos;s Workflow</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Latest order movement across receiving, QC and dispatch.
                  </p>
                </div>

                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300">
                  {pendingOrders} active
                </span>
          </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {workflowOrders.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400 lg:col-span-3">
                    No active workflow orders found yet.
              </div>
            ) : (
                  workflowOrders.map((order, index) => (
                <div
                  key={order.id}
                      className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950"
                >
                      <p
                        className={`text-xs font-black uppercase tracking-[0.14em] ${
                          index === 2
                            ? "text-orange-600 dark:text-orange-300"
                            : index === 1
                              ? "text-violet-600 dark:text-violet-300"
                              : "text-blue-600 dark:text-blue-300"
                        }`}
                      >
                        {index === 0 ? "New Orders" : index === 1 ? "QC Review" : "Dispatch"}
                      </p>

                      <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                          {order.orderNumber}
                        </p>
                        <p className="mt-2 line-clamp-2 text-sm font-black text-slate-950 dark:text-white">
                      {getOrderDisplayName(order.items)}
                    </p>

                        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {order.dealer.name}
                        </p>

                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black tracking-tight">
                    Recent Orders
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Latest dealer orders and their current workflow status.
                  </p>
                </div>

              </div>

              <div className="mt-5 space-y-3">
                {orders.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400">
                    No orders found yet.
                  </div>
                ) : (
                  orders.map((order) => (
                      <div
                        key={order.id}
                        className="grid gap-3 rounded-[1.25rem] border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/10 dark:bg-slate-950 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/5 md:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {getOrderDisplayName(order.items)} · {order.dealer.name}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${getStatusClass(order.status)}`}>
                            {getOrderStatusLabel(order.status)}
                          </span>
                        </div>
                  </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[2rem] border border-white/80 bg-white p-5 text-slate-950 shadow-sm shadow-slate-200/70 dark:border-cyan-400/20 dark:bg-slate-950 dark:text-white dark:shadow-2xl dark:shadow-slate-900/10">
              <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Inventory Snapshot
              </h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Quick stock health summary. Use the floating AI bot for
                questions.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    Products
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">
                    {products.length.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-300/20 dark:bg-orange-400/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-700 dark:text-orange-200">
                    Low Stock
                  </p>
                  <p className="mt-2 text-3xl font-black text-orange-800 dark:text-orange-100">
                    {lowStockItems.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-300/20 dark:bg-cyan-400/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-200">
                    Missed Sales
                  </p>
                  <p className="mt-2 text-3xl font-black text-cyan-800 dark:text-cyan-100">
                    {missedSales.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              <h2 className="text-xl font-black tracking-tight">
                Live Activity
              </h2>

              <div className="mt-5 space-y-5">
                {liveActivities.map((activity) => (
                  <div key={activity.title} className="flex gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        activity.tone === "emerald"
                          ? "bg-emerald-500"
                          : activity.tone === "orange"
                            ? "bg-orange-500"
                            : activity.tone === "cyan"
                              ? "bg-cyan-600"
                              : "bg-blue-600"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">
                        {activity.title}
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                        {activity.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black tracking-tight">Stock Alerts</h2>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 dark:bg-orange-400/10 dark:text-orange-300">
                  {stockAlerts.length}
                </span>
          </div>

              <div className="mt-4 space-y-3">
                {stockAlerts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                    No low stock alerts.
              </div>
            ) : (
              stockAlerts.map((product) => (
                    <div key={product.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                        {product.name}
                      </p>

                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {product.code} · {product.stack}
                      </p>
                    </div>

                    <span
                            className={`rounded-full px-3 py-1 text-[11px] font-black ${getStatusClass(
                        product.status
                      )}`}
                    >
                      {product.quantity}
                    </span>
                  </div>

                        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Minimum stock: {product.minimumStock}
                  </p>
                </div>
              ))
            )}
              </div>
            </div>
          </div>
      </section>
      </div>
    </div>
  );
}
