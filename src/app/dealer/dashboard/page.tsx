import Image from "next/image";
import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import {
  formatDealerCurrency,
  formatDealerDate,
  getDealerFriendlyStatus,
  getDealerStageIndex,
  getDealerStatusTone,
  getProductAvailability,
} from "@/lib/dealer-portal";
import { prisma } from "@/lib/db";
import { getDealerCart } from "@/lib/dealer-cart-db";

function Icon({ name }: { name: string }) {
  const common = { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "orders") return <svg {...common}><path d="M6 4h12v16H6z"/><path d="M9 8h6m-6 4h6m-6 4h4"/></svg>;
  if (name === "box") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "truck") return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  if (name === "check") return <svg {...common}><path d="M20 6 9 17l-5-5"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "cart") return <svg {...common}><path d="M3 4h2l2 11h10l3-8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>;
}

export default async function DealerDashboardPage() {
  const { currentUser, hasAccess } = await checkPermission("track_dealer_orders");

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    return (
      <AccessDeniedCard
        title="Dealer Dashboard Access Denied"
        description="Your current role does not have permission to use the Dealer Dashboard."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const dealer = await prisma.user.findFirst({
    where: { id: currentUser.id, status: "ACTIVE" },
    select: { id: true, name: true, createdAt: true },
  });

  if (!dealer) {
    return (
      <AccessDeniedCard
        title="Dealer Account Not Found"
        description="Your active dealer account was not found."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const [orders, allOrderStatuses, orderableProducts, featuredProducts, savedCart] = await Promise.all([
    prisma.order.findMany({
      where: { dealerId: dealer.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.order.findMany({ where: { dealerId: dealer.id }, select: { status: true } }),
    prisma.product.count({ where: { isActive: true, quantity: { gt: 0 } } }),
    prisma.product.findMany({
      where: { isActive: true, quantity: { gt: 0 } },
      include: { category: true, brand: true },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 4,
    }),
    getDealerCart(prisma, dealer.id),
  ]);

  const activeOrders = allOrderStatuses.filter((order) => !["DELIVERED", "INVOICE_UPLOADED", "CANCELLED"].includes(order.status));
  const processingOrders = allOrderStatuses.filter((order) => getDealerStageIndex(order.status) >= 1 && getDealerStageIndex(order.status) <= 2);
  const deliveryOrders = allOrderStatuses.filter((order) => ["TRANSPORT_ASSIGNED", "ON_THE_WAY"].includes(order.status));
  const deliveredOrders = allOrderStatuses.filter((order) => ["DELIVERED", "INVOICE_UPLOADED"].includes(order.status));
  const recentOrders = orders.slice(0, 5);

  const stats = [
    { label: "Active Orders", value: activeOrders.length, note: "Currently in progress", icon: "orders", tone: "from-blue-500 to-indigo-600" },
    { label: "Processing", value: processingOrders.length, note: "Preparation and quality checks", icon: "box", tone: "from-violet-500 to-purple-600" },
    { label: "Out for Delivery", value: deliveryOrders.length, note: "Transport assigned or on the way", icon: "truck", tone: "from-sky-500 to-cyan-600" },
    { label: "Delivered", value: deliveredOrders.length, note: "Successfully completed orders", icon: "check", tone: "from-emerald-500 to-teal-600" },
  ];

  return (
    <div className="space-y-6 xl:space-y-8">
      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0d182a]">
        <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[1.25fr_0.75fr] xl:p-9">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-300">Welcome back</span>
            <h2 className="mt-4 max-w-3xl text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl xl:text-4xl">
              Good to see you, {dealer.name.split(" ")[0]}.
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
              Browse available products, create a multi-product order and track every order from confirmation to delivery.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/dealer/place-order" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700">
                <Icon name="cart" /> {savedCart?.items.length ? `Continue Saved Cart (${savedCart.items.length})` : "Create New Order"}
              </Link>
              <Link href="/dealer/products" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300">
                <Icon name="search" /> Browse Catalogue
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 text-white shadow-xl shadow-blue-950/20">
            <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-blue-400/20 blur-2xl" />
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Dealer account</p>
              <p className="mt-3 text-2xl font-black">{orderableProducts}</p>
              <p className="mt-1 text-sm font-bold text-blue-100">products currently available to order</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-200">Member since</p>
                  <p className="mt-2 text-sm font-black">{formatDealerDate(dealer.createdAt)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-200">Total orders</p>
                  <p className="mt-2 text-sm font-black">{allOrderStatuses.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.tone} text-white shadow-lg`}><Icon name={stat.icon} /></div>
            <p className="mt-4 text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">{stat.value}</p>
            <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{stat.label}</p>
            <p className="mt-1 hidden text-xs font-semibold text-slate-500 dark:text-slate-400 sm:block">{stat.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0d182a]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
            <div>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">Recent Orders</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Latest order progress and current stage</p>
            </div>
            <Link href="/dealer/orders" className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"><span>View all</span><Icon name="arrow" /></Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><Icon name="orders" /></div>
              <h4 className="mt-4 text-base font-black text-slate-900 dark:text-white">No orders yet</h4>
              <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Your first order will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {recentOrders.map((order) => {
                const primaryItem = order.items[0];
                const totalQuantity = order.items.reduce((sum, item) => sum + (item.requestedQuantity || item.quantity), 0);
                const estimatedValue = order.items.reduce(
                  (sum, item) => sum + Number(item.lineTotal),
                  0,
                );
                return (
                  <Link key={order.id} href={`/dealer/orders?selected=${order.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.03] sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-slate-950 dark:text-white">{order.orderNumber}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${getDealerStatusTone(order.status)}`}>{getDealerFriendlyStatus(order.status)}</span>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{primaryItem?.product.name ?? "Order"}{order.items.length > 1 ? ` +${order.items.length - 1} more` : ""} · {totalQuantity} units</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${Math.max(12, ((getDealerStageIndex(order.status) + 1) / 5) * 100)}%` }} /></div>
                    </div>
                    <div className="flex items-center justify-between gap-6 sm:block sm:text-right">
                      <p className="text-xs font-semibold text-slate-400">{formatDealerDate(order.createdAt)}</p>
                      <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{estimatedValue > 0 ? formatDealerCurrency(estimatedValue) : `${order.items.length} products`}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6">
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Quick Actions</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Fast access to common dealer tasks</p>
          <div className="mt-5 space-y-3">
            {[
              { href: "/dealer/products", title: "Find a Product", note: "Search by name, SKU, brand or category", icon: "search", tone: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300" },
              { href: "/dealer/place-order", title: savedCart?.items.length ? "Continue Saved Cart" : "Build an Order", note: savedCart?.items.length ? `${savedCart.items.length} saved products · resumes across devices` : "Add multiple products and review totals", icon: "cart", tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" },
              { href: "/dealer/orders", title: "Track Delivery", note: "View live stage, quantities and status", icon: "truck", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="group flex items-center gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-white/10 dark:hover:border-blue-400/25 dark:hover:bg-blue-500/5">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${action.tone}`}><Icon name={action.icon} /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-900 dark:text-white">{action.title}</p><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{action.note}</p></div>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h3 className="text-lg font-black text-slate-950 dark:text-white">Available Products</h3><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Recently updated products ready for your next order</p></div>
          <Link href="/dealer/products" className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-300">Open full catalogue →</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featuredProducts.map((product) => {
            const availability = getProductAvailability(product.quantity, product.minimumStock);
            const price = product.dealerPrice ?? product.sellingPrice;
            return (
              <article key={product.id} className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-blue-50 dark:from-white/5 dark:to-blue-500/10">
                  {product.imageMimeType ? <Image src={`/api/product-images/${product.id}`} alt={product.name} fill sizes="(max-width: 768px) 100vw, 25vw" className="object-cover" unoptimized /> : <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-300"><Icon name="box" /></div>}
                </div>
                <div className="p-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${availability.tone}`}>{availability.label}</span>
                  <h4 className="mt-3 truncate text-sm font-black text-slate-950 dark:text-white">{product.name}</h4>
                  <p className="mt-1 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{product.brand.name} · {product.category.name}</p>
                  <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Dealer price</p><p className="mt-1 text-base font-black text-slate-950 dark:text-white">{price ? formatDealerCurrency(price.toString()) : "Ask for price"}</p></div><Link href={`/dealer/place-order?product=${product.id}`} className="rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500">Add</Link></div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
