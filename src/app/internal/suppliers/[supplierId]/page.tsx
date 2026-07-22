import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { formatBusinessDate, formatIndianMoney } from "@/lib/purchasing";
import {
  archiveSupplierAction,
  deactivateProductSupplierAction,
  reactivateSupplierAction,
  updateSupplierAction,
  upsertProductSupplierAction,
} from "../actions";

function getMessage(error?: string, success?: string) {
  const successMessages: Record<string, string> = {
    "supplier-created": "Supplier created successfully.",
    "supplier-updated": "Supplier profile updated.",
    "supplier-archived": "Supplier archived and historical purchases preserved.",
    "supplier-reactivated": "Supplier reactivated.",
    "product-link-updated": "Product-supplier mapping saved.",
    "product-link-disabled": "Product mapping disabled.",
  };
  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission to manage this supplier.",
    "missing-fields": "Complete all required fields.",
    "duplicate-supplier": "Another supplier already uses this code or company name.",
    "duplicate-gst": "Another supplier already uses this GST number.",
    "invalid-gst": "Enter a valid GST number.",
    "invalid-postal-code": "Postal code must contain six digits.",
    "invalid-lead-time": "Lead time must be a non-negative whole number.",
    "archive-reason-required": "Add an archive reason.",
    "supplier-has-open-purchases": "Close or cancel active purchase requests before archiving this supplier.",
    "supplier-not-active": "Reactivate the supplier before mapping products.",
    "missing-product-link": "Select a product.",
    "invalid-product-link": "Check MOQ, lead time and purchase price.",
    "product-not-found": "The selected active product was not found.",
  };
  if (success && successMessages[success]) return { tone: "success" as const, text: successMessages[success] };
  if (error && errorMessages[error]) return { tone: "error" as const, text: errorMessages[error] };
  return null;
}

function statusTone(status: string) {
  if (["RECEIVED", "CLOSED"].includes(status)) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (["REJECTED", "CANCELLED"].includes(status)) return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  if (["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(status)) return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { supplierId } = await params;
  const query = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("view_suppliers", `/internal/suppliers/${supplierId}`);
  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Supplier Details Access Denied"
        description="Your role cannot view supplier purchase history."
        backHref="/internal/suppliers"
        backLabel="Back to Suppliers"
      />
    );
  }

  const canManage = hasPermission(currentUser.roles, "manage_suppliers");
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      productLinks: {
        include: { product: { include: { category: true, brand: true } } },
        orderBy: [{ isActive: "desc" }, { isPreferred: "desc" }, { product: { name: "asc" } }],
      },
      purchaseRequests: {
        include: {
          items: { include: { product: true }, orderBy: { product: { name: "asc" } } },
          receipts: { include: { items: true }, orderBy: { receivedAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!supplier) notFound();

  const products = canManage
    ? await prisma.product.findMany({
        where: { isActive: true },
        include: { category: true, brand: true },
        orderBy: [{ name: "asc" }, { code: "asc" }],
      })
    : [];
  const message = getMessage(query?.error, query?.success);
  const purchaseTotal = supplier.purchaseRequests.reduce((sum, request) => sum + Number(request.estimatedTotal), 0);
  const acceptedUnits = supplier.purchaseRequests.reduce((sum, request) => sum + request.items.reduce((itemSum, item) => itemSum + item.receivedQuantity, 0), 0);
  const openCount = supplier.purchaseRequests.filter((request) => ["SUBMITTED", "APPROVED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(request.status)).length;

  return (
    <main className="space-y-7">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">{supplier.code}</span>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${supplier.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>{supplier.isActive ? "Active" : "Archived"}</span>
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">{supplier.companyName}</h1>
            <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">{supplier.contactPerson ?? "No contact person"}{supplier.phone ? ` · ${supplier.phone}` : ""}{supplier.city ? ` · ${supplier.city}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/internal/suppliers" className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 dark:border-slate-700 dark:text-slate-200">Directory</Link>
            {supplier.isActive ? <Link href={`/internal/reorder?supplierId=${supplier.id}`} className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white">Create purchase</Link> : null}
          </div>
        </div>
      </section>

      {message ? (
        <div className={`rounded-2xl border p-4 text-sm font-bold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Mapped products", supplier.productLinks.filter((link) => link.isActive).length],
          ["Open purchases", openCount],
          ["Accepted units", acceptedUnits],
          ["Estimated value", formatIndianMoney(purchaseTotal)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Supplier profile</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            {[
              ["GST", supplier.gstNumber ?? "—"],
              ["Email", supplier.email ?? "—"],
              ["Payment terms", supplier.paymentTerms ?? "—"],
              ["Default lead time", `${supplier.defaultLeadTimeDays} days`],
              ["Address", [supplier.addressLine1, supplier.addressLine2, supplier.city, supplier.state, supplier.postalCode].filter(Boolean).join(", ") || "—"],
              ["Last updated", formatBusinessDate(supplier.updatedAt)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</dt><dd className="mt-2 font-bold text-slate-800 dark:text-slate-200">{value}</dd></div>
            ))}
          </dl>
          {supplier.internalNotes ? <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm font-semibold leading-6 text-slate-600 dark:border-slate-700 dark:text-slate-300">{supplier.internalNotes}</div> : null}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black text-slate-950 dark:text-white">Product mappings</h2><span className="text-xs font-bold text-slate-400">Preferred supplier drives reorder suggestions</span></div>
          <div className="mt-5 space-y-3">
            {supplier.productLinks.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400 dark:border-slate-700">No products mapped.</p> : supplier.productLinks.map((link) => (
              <div key={link.id} className={`rounded-2xl border p-4 ${link.isActive ? "border-slate-200 dark:border-slate-700" : "border-dashed border-slate-200 opacity-60 dark:border-slate-800"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><p className="font-black text-slate-950 dark:text-white">{link.product.name}</p><p className="mt-1 text-xs font-semibold text-slate-400">{link.product.code} · {link.product.brand.name} · {link.product.category.name}</p></div>
                  <div className="flex flex-wrap gap-2">{link.isPreferred ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">Preferred</span> : null}<span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">MOQ {link.minimumOrderQuantity}</span></div>
                </div>
                <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">Last price: {link.lastPurchasePrice === null ? "Not recorded" : formatIndianMoney(Number(link.lastPurchasePrice))} · Lead time: {link.leadTimeDays ?? supplier.defaultLeadTimeDays} days</p>
                {canManage && link.isActive ? <form action={deactivateProductSupplierAction} className="mt-3"><input type="hidden" name="supplierId" value={supplier.id} /><input type="hidden" name="linkId" value={link.id} /><button className="text-xs font-black text-rose-600 dark:text-rose-300">Disable mapping</button></form> : null}
              </div>
            ))}
          </div>
        </article>
      </section>

      {canManage ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <details className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <summary className="cursor-pointer list-none text-lg font-black text-slate-950 dark:text-white">Edit supplier</summary>
            <form action={updateSupplierAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Code *</span><input name="code" required defaultValue={supplier.code} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Company *</span><input name="companyName" required defaultValue={supplier.companyName} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Contact</span><input name="contactPerson" defaultValue={supplier.contactPerson ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Phone</span><input name="phone" defaultValue={supplier.phone ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Email</span><input type="email" name="email" defaultValue={supplier.email ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">GST</span><input name="gstNumber" defaultValue={supplier.gstNumber ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2 sm:col-span-2"><span className="text-xs font-black uppercase text-slate-500">Address</span><input name="addressLine1" defaultValue={supplier.addressLine1 ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <input type="hidden" name="addressLine2" value={supplier.addressLine2 ?? ""} />
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">City</span><input name="city" defaultValue={supplier.city ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">State</span><input name="state" defaultValue={supplier.state ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Postal code</span><input name="postalCode" defaultValue={supplier.postalCode ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Lead days</span><input type="number" min="0" name="defaultLeadTimeDays" defaultValue={supplier.defaultLeadTimeDays} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2 sm:col-span-2"><span className="text-xs font-black uppercase text-slate-500">Payment terms</span><input name="paymentTerms" defaultValue={supplier.paymentTerms ?? ""} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2 sm:col-span-2"><span className="text-xs font-black uppercase text-slate-500">Notes</span><textarea name="internalNotes" rows={3} defaultValue={supplier.internalNotes ?? ""} className="w-full rounded-xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <button className="h-11 rounded-xl bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950 sm:col-span-2">Save profile</button>
            </form>
          </details>

          <details className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <summary className="cursor-pointer list-none text-lg font-black text-slate-950 dark:text-white">Map product</summary>
            <form action={upsertProductSupplierAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label className="space-y-2 sm:col-span-2"><span className="text-xs font-black uppercase text-slate-500">Product *</span><select name="productId" required className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name} · {product.brand.name}</option>)}</select></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Supplier product code</span><input name="supplierProductCode" className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">MOQ *</span><input type="number" min="1" name="minimumOrderQuantity" defaultValue="1" required className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Last purchase price</span><input type="number" min="0" step="0.01" name="lastPurchasePrice" className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-xs font-black uppercase text-slate-500">Lead days</span><input type="number" min="0" name="leadTimeDays" defaultValue={supplier.defaultLeadTimeDays} className="h-11 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:col-span-2"><input type="checkbox" name="isPreferred" value="1" /><span className="text-sm font-black text-slate-700 dark:text-slate-200">Set as preferred supplier for this product</span></label>
              <button disabled={!supplier.isActive} className="h-11 rounded-xl bg-cyan-600 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">Save product mapping</button>
            </form>
          </details>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 xl:col-span-2">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Lifecycle</h2>
            {supplier.isActive ? (
              <form action={archiveSupplierAction} className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="hidden" name="supplierId" value={supplier.id} /><input name="reason" required placeholder="Reason for archiving" className="h-11 flex-1 rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button className="h-11 rounded-xl bg-rose-600 px-5 text-sm font-black text-white">Archive supplier</button></form>
            ) : (
              <form action={reactivateSupplierAction} className="mt-4"><input type="hidden" name="supplierId" value={supplier.id} /><button className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white">Reactivate supplier</button></form>
            )}
          </article>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Purchase history</h2>
        <div className="mt-5 space-y-4">
          {supplier.purchaseRequests.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">No purchase requests yet.</p> : supplier.purchaseRequests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="font-black text-slate-950 dark:text-white">{request.requestNumber}</p><p className="mt-1 text-xs font-semibold text-slate-400">Created {formatBusinessDate(request.createdAt)} · {request.items.length} products</p></div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(request.status)}`}>{request.status.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {request.items.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300"><p className="font-black text-slate-950 dark:text-white">{item.product.name}</p><p className="mt-1">Requested {item.requestedQuantity} · Ordered {item.orderedQuantity} · Accepted {item.receivedQuantity}</p></div>)}
              </div>
              <p className="mt-4 text-sm font-black text-slate-700 dark:text-slate-200">Estimated total: {formatIndianMoney(Number(request.estimatedTotal))}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
