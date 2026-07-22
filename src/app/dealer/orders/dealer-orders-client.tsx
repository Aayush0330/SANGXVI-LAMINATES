"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  dealerOrderStages,
  formatDealerCurrency,
  formatDealerDate,
  formatDealerDateTime,
  getDealerFriendlyStatus,
  getDealerStageIndex,
  getDealerStatusTone,
} from "@/lib/dealer-portal";
import { cancelDealerOrderAction } from "./actions";

type OrderItem = {
  id: string;
  quantity: number;
  requestedQuantity: number;
  blockedQuantity: number;
  deliveredQuantity: number;
  cancelledQuantity: number;
  unitPrice: number;
  gstRate: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  priceSource: "DEALER_PRICE" | "SELLING_PRICE" | "MANUAL_PRICE" | "LEGACY_BACKFILL";
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
};

type OrderData = {
  id: string;
  orderNumber: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  transportLabel: string | null;
  assignedDriverName: string | null;
  deliveredByName: string | null;
  deliveredAt: string | null;
  proofCount: number;
  proofId: string | null;
  items: OrderItem[];
  history: Array<{
    id: string;
    title: string;
    description: string | null;
    toStatus: string;
    changedByName: string;
    createdAt: string;
  }>;
};

function Icon({ name }: { name: string }) {
  const common = { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "close") return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
  if (name === "truck") return <svg {...common}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
  if (name === "box") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "proof") return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6m-6 4h4"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function getTotals(order: OrderData) {
  return order.items.reduce(
    (summary, item) => {
      const requested = item.requestedQuantity || item.quantity;
      return {
        requested: summary.requested + requested,
        blocked: summary.blocked + item.blockedQuantity,
        delivered: summary.delivered + item.deliveredQuantity,
        cancelled: summary.cancelled + item.cancelledQuantity,
        subtotal: summary.subtotal + item.lineSubtotal,
        gst: summary.gst + item.taxAmount,
        total: summary.total + item.lineTotal,
      };
    },
    { requested: 0, blocked: 0, delivered: 0, cancelled: 0, subtotal: 0, gst: 0, total: 0 },
  );
}

function canCancelDirectly(status: string) {
  return ["NEW_ORDER", "PENDING_TEAM_ASSIGNMENT", "PENDING_STOCK_CHECK", "STOCK_CHECKED", "BACKORDERED"].includes(status);
}

function canRequestCancellation(status: string) {
  return ["PHYSICAL_CHECK_ASSIGNED", "PHYSICAL_CHECK_IN_PROGRESS", "PHYSICAL_CHECK_ISSUE", "QC_REWORK", "STOCK_BLOCKED", "PENDING_QC", "READY_FOR_DISPATCH", "QC_APPROVED", "TRANSPORT_ASSIGNED"].includes(status);
}

function OrderDrawer({ order, onClose }: { order: OrderData; onClose: () => void }) {
  const stageIndex = getDealerStageIndex(order.status);
  const totals = getTotals(order);
  const total = totals.total;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <button type="button" aria-label="Close order details" onClick={onClose} className="pointer-events-auto absolute inset-0 bg-slate-950/30 backdrop-blur-[1px] lg:bg-transparent lg:backdrop-blur-none" />
      <aside style={{ width: "min(460px, 100vw)", top: "76px", height: "calc(100vh - 76px)" }} className="pointer-events-auto absolute bottom-0 right-0 overflow-hidden border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-white/10 dark:bg-[#0b1526]">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Order details</p><h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{order.orderNumber}</h2><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Placed {formatDealerDateTime(order.createdAt)}</p></div>
              <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"><Icon name="close" /></button>
            </div>
            <span className={`mt-4 inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ${getDealerStatusTone(order.status)}`}>{getDealerFriendlyStatus(order.status)}</span>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <section>
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Order journey</h3>
              <div className="mt-4 space-y-0">
                {dealerOrderStages.map((stage, index) => {
                  const completed = index <= stageIndex;
                  const active = index === stageIndex;
                  return (
                    <div key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
                      {index < dealerOrderStages.length - 1 ? <span className={`absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px ${index < stageIndex ? "bg-blue-500" : "bg-slate-200 dark:bg-white/10"}`} /> : null}
                      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${completed ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-[#0d182a]"}`}>{completed ? "✓" : index + 1}</span>
                      <div className="min-w-0 pt-0.5"><p className={`text-sm font-black ${active ? "text-blue-700 dark:text-blue-300" : completed ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{stage.label}</p><p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{stage.description}</p></div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2"><span className="text-blue-600 dark:text-blue-300"><Icon name="box" /></span><h3 className="text-sm font-black text-slate-950 dark:text-white">Products</h3></div>
              <div className="mt-4 space-y-3">
                {order.items.map((item) => {
                  const requested = item.requestedQuantity || item.quantity;
                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0d182a]">
                      <div className="flex justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-950 dark:text-white">{item.product.name}</p><p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{item.product.code} · {item.product.unit} · {formatDealerCurrency(item.unitPrice)} each</p></div><p className="text-xs font-black text-slate-950 dark:text-white">{formatDealerCurrency(item.lineTotal)}</p></div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><p className="text-[9px] font-bold uppercase text-slate-400">Ordered</p><p className="mt-1 text-xs font-black">{requested}</p></div><div className="rounded-xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><p className="text-[9px] font-bold uppercase">Reserved</p><p className="mt-1 text-xs font-black">{item.blockedQuantity}</p></div><div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><p className="text-[9px] font-bold uppercase">Delivered</p><p className="mt-1 text-xs font-black">{item.deliveredQuantity}</p></div></div>
                    </div>
                  );
                })}
              </div>
              {total > 0 ? <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs font-semibold dark:border-white/10"><div className="flex justify-between text-slate-500 dark:text-slate-400"><span>Order subtotal</span><span>{formatDealerCurrency(totals.subtotal)}</span></div><div className="flex justify-between text-slate-500 dark:text-slate-400"><span>GST</span><span>{formatDealerCurrency(totals.gst)}</span></div><div className="flex justify-between text-sm font-black text-slate-950 dark:text-white"><span>Order total</span><span>{formatDealerCurrency(total)}</span></div></div> : null}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-center gap-2 text-sky-600 dark:text-sky-300"><Icon name="truck"/><p className="text-[10px] font-black uppercase tracking-[0.1em]">Delivery</p></div><p className="mt-3 text-xs font-black text-slate-950 dark:text-white">{order.transportLabel ?? "Not assigned"}</p><p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{order.assignedDriverName ?? order.deliveredByName ?? "Driver pending"}</p></div>
              <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-center gap-2 text-violet-600 dark:text-violet-300"><Icon name="proof"/><p className="text-[10px] font-black uppercase tracking-[0.1em]">Proof</p></div><p className="mt-3 text-xs font-black text-slate-950 dark:text-white">{order.proofCount > 0 ? "Delivery proof uploaded" : "Proof pending"}</p><p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{order.deliveredAt ? `Delivered ${formatDealerDate(order.deliveredAt)}` : "Available after delivery"}</p>{order.proofId ? <a href={`/field/deliveries/proof/${order.proofId}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 items-center justify-center rounded-xl border border-violet-200 px-3 text-[10px] font-black text-violet-700 transition hover:bg-violet-600 hover:text-white dark:border-violet-400/25 dark:text-violet-300">View Proof</a> : null}</div>
            </section>

            {order.notes ? <section className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"><h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Order note</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{order.notes}</p></section> : null}

            <section>
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Recent updates</h3>
              <div className="mt-3 space-y-3">
                {order.history.slice(0, 6).map((entry) => <div key={entry.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"/><div><p className="text-xs font-black text-slate-900 dark:text-white">{entry.title}</p><p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{entry.description || getDealerFriendlyStatus(entry.toStatus)}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{formatDealerDateTime(entry.createdAt)}</p></div></div>)}
              </div>
            </section>

            {(canCancelDirectly(order.status) || canRequestCancellation(order.status)) ? (
              <details className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-400/25 dark:bg-rose-500/10">
                <summary className="cursor-pointer text-xs font-black text-rose-700 dark:text-rose-300">{canCancelDirectly(order.status) ? "Cancel this order" : "Request cancellation"}</summary>
                <form action={cancelDealerOrderAction} className="mt-3 space-y-3"><input type="hidden" name="orderId" value={order.id}/><textarea name="reason" rows={3} maxLength={500} placeholder="Tell us the reason" className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold outline-none dark:border-rose-400/25 dark:bg-slate-950"/><button className="h-10 w-full rounded-xl bg-rose-600 text-xs font-black text-white hover:bg-rose-700">{canCancelDirectly(order.status) ? "Confirm Cancellation" : "Send Cancellation Request"}</button></form>
              </details>
            ) : null}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function DealerOrdersClient({ orders, selectedOrderId }: { orders: OrderData[]; selectedOrderId?: string }) {
  const [selectedId, setSelectedId] = useState(selectedOrderId ?? "");
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedId) ?? null, [orders, selectedId]);

  function setSelected(orderId: string) {
    setSelectedId(orderId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("selected", orderId);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  function closeSelected() {
    setSelectedId("");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("selected");
    const query = next.toString();
    router.replace(query ? `?${query}` : "/dealer/orders", { scroll: false });
  }

  if (orders.length === 0) {
    return <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-[#0d182a]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><Icon name="box"/></div><h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">No orders found</h3><p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Create a new order or change the filters.</p></div>;
  }

  return (
    <>
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0d182a]">
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 dark:bg-white/[0.03]"><tr className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"><th className="px-5 py-4">Order</th><th className="px-4 py-4">Products</th><th className="px-4 py-4">Quantity</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Placed</th><th className="px-5 py-4 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {orders.map((order) => {
                const totals = getTotals(order);
                const first = order.items[0];
                return <tr key={order.id} onClick={() => setSelected(order.id)} className="cursor-pointer transition hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.04]"><td className="px-5 py-4"><p className="text-sm font-black text-slate-950 dark:text-white">{order.orderNumber}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">Updated {formatDealerDate(order.updatedAt)}</p></td><td className="max-w-[260px] px-4 py-4"><p className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{first?.product.name ?? "Order"}{order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{order.items.length} product{order.items.length === 1 ? "" : "s"}</p></td><td className="px-4 py-4"><p className="text-xs font-black text-slate-900 dark:text-white">{totals.requested} requested</p><p className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">{totals.delivered} delivered</p></td><td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${getDealerStatusTone(order.status)}`}>{getDealerFriendlyStatus(order.status)}</span></td><td className="px-4 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">{formatDealerDate(order.createdAt)}</td><td className="px-5 py-4 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); setSelected(order.id); }} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-300 dark:hover:border-blue-400/25 dark:hover:text-blue-300">Track <Icon name="arrow"/></button></td></tr>;
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/10 lg:hidden">
          {orders.map((order) => {
            const totals = getTotals(order);
            const first = order.items[0];
            return <button key={order.id} type="button" onClick={() => setSelected(order.id)} className="w-full p-4 text-left transition hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.04]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-950 dark:text-white">{order.orderNumber}</p><p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{first?.product.name ?? "Order"}{order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.06em] ${getDealerStatusTone(order.status)}`}>{getDealerFriendlyStatus(order.status)}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><p className="text-[9px] font-bold uppercase text-slate-400">Requested</p><p className="mt-1 text-xs font-black">{totals.requested}</p></div><div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><p className="text-[9px] font-bold uppercase">Delivered</p><p className="mt-1 text-xs font-black">{totals.delivered}</p></div><div className="rounded-xl bg-blue-50 p-2 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><p className="text-[9px] font-bold uppercase">Placed</p><p className="mt-1 text-[10px] font-black">{formatDealerDate(order.createdAt)}</p></div></div></button>;
          })}
        </div>
      </div>
      {selectedOrder ? <OrderDrawer order={selectedOrder} onClose={closeSelected} /> : null}
    </>
  );
}
