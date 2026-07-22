import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import { getDealerFriendlyStatus } from "@/lib/dealer-portal";
import { prisma } from "@/lib/db";
import { DealerOrdersClient } from "./dealer-orders-client";

function getMessage(error?: string, success?: string) {
  if (success === "order-cancelled") return { type: "success", text: "Order cancelled successfully." };
  if (success === "cancellation-requested") return { type: "success", text: "Cancellation request sent to the internal team." };
  if (error === "cancel-not-allowed") return { type: "error", text: "This order cannot be cancelled at the current stage." };
  if (error === "permission-denied") return { type: "error", text: "You do not have permission to change this order." };
  if (error === "order-not-found") return { type: "error", text: "Selected order was not found." };
  return null;
}

export default async function DealerOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; page?: string; selected?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("track_dealer_orders");

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    return (
      <AccessDeniedCard
        title="Orders Access Denied"
        description="Your current role does not have permission to track dealer orders."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const dealer = await prisma.user.findFirst({ where: { id: currentUser.id, status: "ACTIVE" }, select: { id: true } });

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

  const allStatuses = [
    "NEW_ORDER",
    "PHYSICAL_CHECK_IN_PROGRESS",
    "PENDING_QC",
    "READY_FOR_DISPATCH",
    "TRANSPORT_ASSIGNED",
    "ON_THE_WAY",
    "DELIVERED",
    "CANCELLATION_REQUESTED",
    "CANCELLED",
  ];
  const q = String(params?.q ?? "").trim();
  const requestedStatus = String(params?.status ?? "all");
  const status = allStatuses.includes(requestedStatus) ? requestedStatus : "all";
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 12;

  const where = {
    dealerId: dealer.id,
    ...(status !== "all" ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { items: { some: { product: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] } } } },
          ],
        }
      : {}),
  };

  const [total, pageOrders, selectedOrder] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
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
        assignedDriver: { select: { name: true } },
        statusHistory: { orderBy: { createdAt: "desc" }, take: 12 },
        deliveryProofs: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
    params?.selected
      ? prisma.order.findFirst({
          where: { id: params.selected, dealerId: dealer.id },
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
            assignedDriver: { select: { name: true } },
            statusHistory: { orderBy: { createdAt: "desc" }, take: 12 },
            deliveryProofs: { where: { isActive: true }, select: { id: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const rawOrders = selectedOrder && !pageOrders.some((order) => order.id === selectedOrder.id) ? [selectedOrder, ...pageOrders] : pageOrders;
  const orders = rawOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    transportLabel: order.transportLabel,
    assignedDriverName: order.assignedDriver?.name ?? null,
    deliveredByName: order.deliveredByName,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    proofCount: order.deliveryProofs.length,
    proofId: order.deliveryProofs[0]?.id ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      requestedQuantity: item.requestedQuantity,
      blockedQuantity: item.blockedQuantity,
      deliveredQuantity: item.deliveredQuantity,
      cancelledQuantity: item.cancelledQuantity,
      unitPrice: Number(item.unitPrice),
      gstRate: Number(item.gstRate),
      lineSubtotal: Number(item.lineSubtotal),
      taxAmount: Number(item.taxAmount),
      lineTotal: Number(item.lineTotal),
      priceSource: item.priceSource,
      product: {
        id: item.product.id,
        code: item.product.code,
        name: item.product.name,
        unit: item.product.unit,
      },
    })),
    history: order.statusHistory.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      toStatus: entry.toStatus,
      changedByName: entry.changedByName,
      createdAt: entry.createdAt.toISOString(),
    })),
  }));

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const message = getMessage(params?.error, params?.success);
  function pageHref(page: number) {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status !== "all") query.set("status", status);
    query.set("page", String(page));
    return `/dealer/orders?${query.toString()}`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6 xl:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-300">Live order tracking</span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Every order in one place</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">Search orders, review ordered quantities and open the tracking drawer for the complete journey.</p>
          </div>
          <Link href="/dealer/place-order" className="inline-flex h-11 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700">+ New Order</Link>
        </div>
        {message ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300"}`}>{message.text}</div> : null}
      </section>

      <form action="/dealer/orders" method="get" className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d182a]">
        <div className="grid gap-3 md:grid-cols-[1fr_250px_auto]">
          <input name="q" defaultValue={q} placeholder="Search order number, product or SKU" className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5" />
          <select name="status" defaultValue={status} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5"><option value="all">All order statuses</option>{allStatuses.map((item) => <option key={item} value={item}>{getDealerFriendlyStatus(item)}</option>)}</select>
          <button className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500">Apply Filters</button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4"><div><h3 className="text-lg font-black text-slate-950 dark:text-white">Order History</h3><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{total} order{total === 1 ? "" : "s"} found</p></div>{(q || status !== "all") ? <Link href="/dealer/orders" className="text-xs font-black text-blue-600 dark:text-blue-300">Clear filters</Link> : null}</div>

      <DealerOrdersClient orders={orders} selectedOrderId={params?.selected} />

      {pageCount > 1 ? <div className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0d182a]"><Link href={currentPage > 1 ? pageHref(currentPage - 1) : pageHref(1)} className={`rounded-xl border px-4 py-2 text-xs font-black ${currentPage <= 1 ? "pointer-events-none border-slate-200 text-slate-300 dark:border-white/10 dark:text-slate-600" : "border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-300"}`}>Previous</Link><p className="text-xs font-black text-slate-500 dark:text-slate-400">Page {currentPage} of {pageCount}</p><Link href={currentPage < pageCount ? pageHref(currentPage + 1) : pageHref(pageCount)} className={`rounded-xl border px-4 py-2 text-xs font-black ${currentPage >= pageCount ? "pointer-events-none border-slate-200 text-slate-300 dark:border-white/10 dark:text-slate-600" : "border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-300"}`}>Next</Link></div> : null}
    </div>
  );
}
