import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { formatBusinessDate, formatIndianMoney } from "@/lib/purchasing";
import {
  approvePurchaseRequestAction,
  cancelPurchaseRequestAction,
  markPurchaseInTransitAction,
  markPurchaseOrderedAction,
  receivePurchaseStockAction,
  rejectPurchaseRequestAction,
} from "./actions";
import { PurchaseRequestBuilder } from "./purchase-request-builder";

const ACTIVE_PURCHASE_STATUSES = ["APPROVED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] as const;

function getMessage(error?: string, success?: string) {
  const successes: Record<string, string> = {
    "purchase-request-created": "Purchase request submitted for owner approval.",
    "purchase-approved": "Purchase request approved.",
    "purchase-rejected": "Purchase request rejected with audit reason.",
    "purchase-ordered": "Purchase order reference saved.",
    "purchase-in-transit": "Purchase marked in transit.",
    "purchase-cancelled": "Purchase request cancelled.",
    "purchase-stock-received": "Goods receipt posted and accepted quantity added to stock.",
  };
  const errors: Record<string, string> = {
    "permission-denied": "You do not have permission to manage purchase requests.",
    "approval-permission-denied": "Only the Owner can approve or reject purchase requests.",
    "receiving-permission-denied": "You do not have permission to receive supplier stock.",
    "invalid-request-items": "Select a supplier and add valid product quantities.",
    "invalid-priority": "Select a valid priority.",
    "invalid-expected-date": "Enter a valid expected delivery date.",
    "supplier-not-active": "Select an active supplier.",
    "product-not-linked": "Every requested product must be mapped to the selected supplier.",
    "below-minimum-order-quantity": "A quantity is below the supplier minimum order quantity.",
    "product-not-found": "One or more products are archived or unavailable.",
    "request-not-found": "Purchase request was not found.",
    "invalid-approval-state": "Only submitted requests can be approved or rejected.",
    "invalid-approved-quantity": "Approved quantities must be valid whole numbers.",
    "approval-exceeds-requested": "Approved quantity cannot exceed the requested quantity.",
    "approval-needs-quantity": "Approve at least one product quantity.",
    "purchase-total-too-large": "Purchase value exceeds the supported accounting limit.",
    "rejection-reason-required": "A rejection reason is required.",
    "po-number-required": "Purchase order number is required.",
    "duplicate-po-number": "This purchase order number already exists.",
    "invalid-order-state": "Only approved requests can be marked ordered.",
    "invalid-transit-state": "Only ordered purchases can be marked in transit.",
    "cancel-reason-required": "A cancellation reason is required.",
    "invalid-cancel-state": "This purchase can no longer be cancelled.",
    "cannot-cancel-received-purchase": "A purchase with received stock cannot be cancelled.",
    "invalid-receiving-state": "Stock can be received only after the purchase is ordered.",
    "invalid-receipt-values": "Receipt quantities and costs must be valid.",
    "receipt-breakdown-invalid": "Damaged and rejected quantities cannot exceed total received.",
    "receipt-exceeds-remaining": "Received quantity exceeds the remaining ordered quantity.",
    "receipt-needs-quantity": "Enter at least one received quantity.",
  };
  if (success && successes[success]) return { tone: "success" as const, text: successes[success] };
  if (error && errors[error]) return { tone: "error" as const, text: errors[error] };
  return null;
}

function statusTone(status: string) {
  if (["RECEIVED", "CLOSED"].includes(status)) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (["REJECTED", "CANCELLED"].includes(status)) return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  if (["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(status)) return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  if (status === "APPROVED") return "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
}

function priorityTone(priority: string) {
  if (priority === "URGENT") return "bg-rose-600 text-white";
  if (priority === "HIGH") return "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300";
  return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300";
}

export default async function ReorderPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; supplierId?: string; requestId?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("view_suppliers", "/internal/reorder");
  if (!hasAccess) {
    return <AccessDeniedCard title="Purchasing Access Denied" description="Your role cannot view reorder and supplier purchase records." backHref="/internal/dashboard" backLabel="Go to Dashboard" />;
  }

  const canManage = hasPermission(currentUser.roles, "manage_purchase_requests");
  const canApprove = hasPermission(currentUser.roles, "approve_purchase_requests");
  const canReceive = hasPermission(currentUser.roles, "receive_purchase_stock");
  const selectedStatus = params?.status && params.status !== "ALL" ? params.status : "ALL";

  const [products, suppliers, purchaseRequests, activePurchaseItems] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, maximumStock: { gt: 0 } },
      include: {
        category: true,
        brand: true,
        supplierLinks: {
          where: { isActive: true, supplier: { isActive: true } },
          include: { supplier: true },
          orderBy: [{ isPreferred: "desc" }, { supplier: { companyName: "asc" } }],
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      include: {
        productLinks: {
          where: { isActive: true, product: { isActive: true } },
          include: { product: true },
          orderBy: [{ isPreferred: "desc" }, { product: { name: "asc" } }],
        },
      },
      orderBy: { companyName: "asc" },
    }),
    prisma.purchaseRequest.findMany({
      where: selectedStatus === "ALL" ? {} : { status: selectedStatus as never },
      include: {
        supplier: true,
        items: { include: { product: true }, orderBy: { product: { name: "asc" } } },
        receipts: { include: { items: true }, orderBy: { receivedAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.purchaseRequestItem.findMany({
      where: { purchaseRequest: { status: { in: [...ACTIVE_PURCHASE_STATUSES] } } },
      select: { productId: true, orderedQuantity: true, approvedQuantity: true, requestedQuantity: true, receivedQuantity: true, damagedQuantity: true, rejectedQuantity: true },
    }),
  ]);

  const onOrderByProduct = new Map<string, number>();
  for (const item of activePurchaseItems) {
    const target = item.orderedQuantity || item.approvedQuantity || item.requestedQuantity;
    const pending = Math.max(0, target - item.receivedQuantity - item.damagedQuantity - item.rejectedQuantity);
    onOrderByProduct.set(item.productId, (onOrderByProduct.get(item.productId) ?? 0) + pending);
  }

  const suggestions = products.map((product) => {
    const available = Math.max(0, product.quantity - product.blocked);
    const onOrder = onOrderByProduct.get(product.id) ?? 0;
    const suggested = Math.max(0, product.maximumStock - available - onOrder);
    return { product, available, onOrder, suggested, low: available <= product.minimumStock };
  }).filter((item) => item.low).sort((a, b) => (a.available - a.product.minimumStock) - (b.available - b.product.minimumStock));

  const suggestedByProduct = new Map(suggestions.map((item) => [item.product.id, item.suggested]));
  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.id,
    code: supplier.code,
    companyName: supplier.companyName,
    products: supplier.productLinks.map((link) => ({
      id: link.product.id,
      code: link.product.code,
      name: link.product.name,
      unit: link.product.unit,
      minimumOrderQuantity: link.minimumOrderQuantity,
      suggestedQuantity: Math.max(link.minimumOrderQuantity, suggestedByProduct.get(link.product.id) ?? 0),
      unitPrice: Number(link.lastPurchasePrice ?? link.product.purchasePrice ?? 0),
    })),
  }));

  const metrics = {
    lowStock: suggestions.filter((item) => item.low).length,
    submitted: purchaseRequests.filter((request) => request.status === "SUBMITTED").length,
    inTransit: purchaseRequests.filter((request) => ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(request.status)).length,
    overdue: purchaseRequests.filter((request) => request.expectedDeliveryDate && new Date(request.expectedDeliveryDate) < new Date() && !["RECEIVED", "CLOSED", "REJECTED", "CANCELLED"].includes(request.status)).length,
  };
  const message = getMessage(params?.error, params?.success);

  return (
    <main className="space-y-7">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-600 dark:text-cyan-300">Phase 6 · Reorder & Suppliers</p><h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">Procurement Control</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">Low-stock suggestions, owner approvals, purchase tracking and partial supplier receiving. Dealer delivery remains full-quantity-only.</p></div>
          <Link href="/internal/suppliers" className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">Supplier Directory</Link>
        </div>
      </section>

      {message ? <div className={`rounded-2xl border p-4 text-sm font-bold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>{message.text}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Low-stock products", metrics.lowStock], ["Waiting approval", metrics.submitted], ["Ordered / transit", metrics.inTransit], ["Overdue", metrics.overdue]].map(([label, value]) => <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p><p className="mt-3 text-4xl font-black text-slate-950 dark:text-white">{value}</p></div>)}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black text-slate-950 dark:text-white">Low-stock & reorder suggestions</h2><p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Suggested quantity = maximum stock − available stock − open supplier quantity.</p></div><span className="text-xs font-bold text-slate-400">{suggestions.length} products need review</span></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {suggestions.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-emerald-600 dark:border-slate-700 dark:text-emerald-300 lg:col-span-2">All configured products are within reorder levels.</div> : suggestions.map(({ product, available, onOrder, suggested, low }) => {
            const preferred = product.supplierLinks.find((link) => link.isPreferred) ?? product.supplierLinks[0];
            return <article key={product.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${low ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>{low ? "Low stock" : "Reorder planning"}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">{product.code}</span></div><h3 className="mt-3 font-black text-slate-950 dark:text-white">{product.name}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{product.brand.name} · {product.category.name}</p></div><p className="text-right text-2xl font-black text-cyan-600 dark:text-cyan-300">{suggested}<span className="ml-1 text-xs text-slate-400">{product.unit}</span></p></div><div className="mt-4 grid grid-cols-4 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">Available</p><p className="mt-1 font-black text-slate-950 dark:text-white">{available}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">Minimum</p><p className="mt-1 font-black text-slate-950 dark:text-white">{product.minimumStock}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">Maximum</p><p className="mt-1 font-black text-slate-950 dark:text-white">{product.maximumStock}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">On order</p><p className="mt-1 font-black text-slate-950 dark:text-white">{onOrder}</p></div></div><p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">Preferred supplier: {preferred?.supplier.companyName ?? "Not mapped"}</p></article>;
          })}
        </div>
      </section>

      {canManage ? <details open={Boolean(params?.supplierId)} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"><summary className="cursor-pointer list-none text-xl font-black text-slate-950 dark:text-white">+ Create purchase request</summary><div className="mt-6"><PurchaseRequestBuilder suppliers={supplierOptions} initialSupplierId={params?.supplierId} /></div></details> : null}

      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_160px]"><select name="status" defaultValue={selectedStatus} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All purchase statuses</option>{["SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><button className="h-12 rounded-xl bg-slate-950 px-5 text-sm font-black text-white dark:bg-white dark:text-slate-950">Filter</button></form>

      <section className="space-y-4">
        {purchaseRequests.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">No purchase requests found.</div> : purchaseRequests.map((request) => {
          const targetUnits = request.items.reduce((sum, item) => sum + (item.orderedQuantity || item.approvedQuantity || item.requestedQuantity), 0);
          const acceptedUnits = request.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
          const issueUnits = request.items.reduce((sum, item) => sum + item.damagedQuantity + item.rejectedQuantity, 0);
          return <details key={request.id} open={params?.requestId === request.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><summary className="cursor-pointer list-none"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(request.status)}`}>{request.status.replaceAll("_", " ")}</span><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${priorityTone(request.priority)}`}>{request.priority}</span></div><h2 className="mt-3 text-xl font-black text-slate-950 dark:text-white">{request.requestNumber} · {request.supplier.companyName}</h2><p className="mt-1 text-xs font-semibold text-slate-400">Requested by {request.requestedByName ?? "System"} · {formatBusinessDate(request.createdAt)}</p></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">Target</p><p className="mt-1 font-black text-slate-950 dark:text-white">{targetUnits}</p></div><div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">Accepted</p><p className="mt-1 font-black text-emerald-600">{acceptedUnits}</p></div><div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950"><p className="text-[9px] font-black uppercase text-slate-400">Issues</p><p className="mt-1 font-black text-rose-600">{issueUnits}</p></div></div></div></summary>
            <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
              <div className="grid gap-3 lg:grid-cols-2">{request.items.map((item) => <div key={item.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><p className="font-black text-slate-950 dark:text-white">{item.product.name}</p><p className="mt-1 text-xs font-semibold text-slate-400">Requested {item.requestedQuantity} · Approved {item.approvedQuantity} · Ordered {item.orderedQuantity}</p><p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">Accepted {item.receivedQuantity} · Damaged {item.damagedQuantity} · Rejected {item.rejectedQuantity}</p><p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">{formatIndianMoney(Number(item.lineTotal))}</p></div>)}</div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-[10px] font-black uppercase text-slate-400">Estimated total</p><p className="mt-2 font-black text-slate-950 dark:text-white">{formatIndianMoney(Number(request.estimatedTotal))}</p></div><div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-[10px] font-black uppercase text-slate-400">PO number</p><p className="mt-2 font-black text-slate-950 dark:text-white">{request.purchaseOrderNumber ?? "—"}</p></div><div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-[10px] font-black uppercase text-slate-400">Expected</p><p className="mt-2 font-black text-slate-950 dark:text-white">{formatBusinessDate(request.expectedDeliveryDate)}</p></div><div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-[10px] font-black uppercase text-slate-400">Receipts</p><p className="mt-2 font-black text-slate-950 dark:text-white">{request.receipts.length}</p></div></div>
              {request.rejectionReason ? <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Rejection reason: {request.rejectionReason}</div> : null}
              {request.cancellationReason ? <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Cancellation reason: {request.cancellationReason}{request.cancelledByName ? ` · by ${request.cancelledByName}` : ""}</div> : null}
              <div className="mt-5 space-y-4">
                {canApprove && request.status === "SUBMITTED" ? <div className="grid gap-4 lg:grid-cols-2"><form action={approvePurchaseRequestAction} className="rounded-2xl border border-emerald-200 p-4 dark:border-emerald-500/30"><input type="hidden" name="requestId" value={request.id} /><p className="text-sm font-black text-emerald-700 dark:text-emerald-300">Owner approval quantities</p><div className="mt-3 space-y-2">{request.items.map((item) => <label key={item.id} className="grid grid-cols-[1fr_110px] items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300"><span>{item.product.name}</span><input type="number" min="0" max={item.requestedQuantity} name={`approved_${item.id}`} defaultValue={item.requestedQuantity} className="h-10 rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>)}</div><button className="mt-4 h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white">Approve request</button></form><form action={rejectPurchaseRequestAction} className="rounded-2xl border border-rose-200 p-4 dark:border-rose-500/30"><input type="hidden" name="requestId" value={request.id} /><p className="text-sm font-black text-rose-700 dark:text-rose-300">Reject purchase request</p><textarea name="reason" required rows={4} placeholder="Mandatory rejection reason" className="mt-3 w-full rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="mt-3 h-11 w-full rounded-xl bg-rose-600 text-sm font-black text-white">Reject request</button></form></div> : null}
                {canManage && request.status === "APPROVED" ? <form action={markPurchaseOrderedAction} className="grid gap-3 rounded-2xl border border-cyan-200 p-4 dark:border-cyan-500/30 md:grid-cols-[1fr_180px_160px]"><input type="hidden" name="requestId" value={request.id} /><input name="purchaseOrderNumber" required placeholder="Purchase order number" className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><input type="date" name="expectedDeliveryDate" defaultValue={request.expectedDeliveryDate ? new Date(request.expectedDeliveryDate).toISOString().slice(0, 10) : ""} className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="h-11 rounded-xl bg-cyan-600 text-sm font-black text-white">Mark ordered</button></form> : null}
                {canManage && request.status === "ORDERED" ? <form action={markPurchaseInTransitAction} className="grid gap-3 rounded-2xl border border-amber-200 p-4 dark:border-amber-500/30 md:grid-cols-[1fr_180px]"><input type="hidden" name="requestId" value={request.id} /><input name="supplierInvoiceNumber" placeholder="Supplier invoice (optional)" className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="h-11 rounded-xl bg-amber-500 text-sm font-black text-white">Mark in transit</button></form> : null}
                {canReceive && ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(request.status) ? <form action={receivePurchaseStockAction} className="rounded-2xl border border-emerald-200 p-4 dark:border-emerald-500/30"><input type="hidden" name="requestId" value={request.id} /><p className="text-sm font-black text-emerald-700 dark:text-emerald-300">Post goods receipt</p><p className="mt-1 text-xs font-semibold text-slate-400">Supplier receiving may be partial. Only accepted quantity increases Product Master stock.</p><div className="mt-4 space-y-3">{request.items.map((item) => { const target = item.orderedQuantity || item.approvedQuantity || item.requestedQuantity; const remaining = Math.max(0, target - item.receivedQuantity - item.damagedQuantity - item.rejectedQuantity); return <div key={item.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950 md:grid-cols-[1fr_repeat(4,110px)] md:items-end"><div><p className="text-sm font-black text-slate-950 dark:text-white">{item.product.name}</p><p className="text-[10px] font-bold text-slate-400">Remaining {remaining}</p></div><label className="text-[9px] font-black uppercase text-slate-400">Total received<input type="number" min="0" max={remaining} name={`received_${item.id}`} defaultValue="0" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label><label className="text-[9px] font-black uppercase text-slate-400">Damaged<input type="number" min="0" name={`damaged_${item.id}`} defaultValue="0" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label><label className="text-[9px] font-black uppercase text-slate-400">Rejected<input type="number" min="0" name={`rejected_${item.id}`} defaultValue="0" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label><label className="text-[9px] font-black uppercase text-slate-400">Unit cost<input type="number" min="0" step="0.01" name={`unitCost_${item.id}`} defaultValue={Number(item.estimatedUnitPrice)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label></div>; })}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><input name="supplierInvoiceReference" placeholder="Supplier invoice reference" className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><input name="challanReference" placeholder="Challan reference" className="h-11 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></div><textarea name="notes" rows={2} placeholder="Receiving notes" className="mt-3 w-full rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="mt-3 h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white">Post receipt & update stock</button></form> : null}
                {canManage && ["SUBMITTED", "APPROVED", "ORDERED", "IN_TRANSIT"].includes(request.status) ? <form action={cancelPurchaseRequestAction} className="flex flex-col gap-3 rounded-2xl border border-rose-100 p-4 dark:border-rose-500/20 sm:flex-row"><input type="hidden" name="requestId" value={request.id} /><input name="reason" required placeholder="Cancellation reason" className="h-11 flex-1 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="h-11 rounded-xl border border-rose-200 px-5 text-sm font-black text-rose-600 dark:border-rose-500/30 dark:text-rose-300">Cancel purchase</button></form> : null}
              </div>
              {request.receipts.length > 0 ? <div className="mt-6"><h3 className="text-sm font-black text-slate-950 dark:text-white">Goods receipts</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{request.receipts.map((receipt) => <div key={receipt.id} className="rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300"><p className="font-black text-slate-950 dark:text-white">{receipt.receiptNumber}</p><p className="mt-1">{formatBusinessDate(receipt.receivedAt)} · {receipt.items.reduce((sum, item) => sum + item.acceptedQuantity, 0)} accepted · {receipt.items.reduce((sum, item) => sum + item.damagedQuantity + item.rejectedQuantity, 0)} issues</p></div>)}</div></div> : null}
            </div>
          </details>;
        })}
      </section>
    </main>
  );
}
