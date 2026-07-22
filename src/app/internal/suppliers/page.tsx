import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { createSupplierAction } from "./actions";

function getMessage(error?: string, success?: string) {
  const successMessages: Record<string, string> = {
    "supplier-created": "Supplier created successfully.",
    "supplier-updated": "Supplier updated successfully.",
    "supplier-archived": "Supplier archived while purchase history was preserved.",
    "supplier-reactivated": "Supplier reactivated successfully.",
  };
  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission to manage suppliers.",
    "missing-fields": "Supplier code and company name are required.",
    "duplicate-supplier": "A supplier with the same code or company name already exists.",
    "duplicate-gst": "This GST number is already assigned to another supplier.",
    "invalid-gst": "Enter a valid GST number.",
    "invalid-postal-code": "Postal code must contain exactly six digits.",
    "invalid-lead-time": "Lead time must be a valid non-negative number of days.",
  };
  if (success && successMessages[success]) return { tone: "success" as const, text: successMessages[success] };
  if (error && errorMessages[error]) return { tone: "error" as const, text: errorMessages[error] };
  return null;
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("view_suppliers", "/internal/suppliers");
  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Supplier Directory Access Denied"
        description="Your role cannot view supplier and purchase records."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const canManage = hasPermission(currentUser.roles, "manage_suppliers");
  const query = String(params?.q ?? "").trim();
  const status = params?.status === "archived" ? "archived" : params?.status === "all" ? "all" : "active";
  const suppliers = await prisma.supplier.findMany({
    where: {
      ...(status === "active" ? { isActive: true } : status === "archived" ? { isActive: false } : {}),
      ...(query
        ? {
            OR: [
              { code: { contains: query, mode: "insensitive" } },
              { companyName: { contains: query, mode: "insensitive" } },
              { contactPerson: { contains: query, mode: "insensitive" } },
              { gstNumber: { contains: query, mode: "insensitive" } },
              { city: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { productLinks: true, purchaseRequests: true } },
      purchaseRequests: {
        select: { status: true, estimatedTotal: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ isActive: "desc" }, { companyName: "asc" }],
  });

  const allCounts = await prisma.supplier.groupBy({ by: ["isActive"], _count: { _all: true } });
  const activeCount = allCounts.find((item) => item.isActive)?._count._all ?? 0;
  const archivedCount = allCounts.find((item) => !item.isActive)?._count._all ?? 0;
  const message = getMessage(params?.error, params?.success);

  return (
    <main className="space-y-7">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-600 dark:text-cyan-300">Phase 6 · Procurement</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">Supplier Directory</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Supplier profiles, product mappings, purchase history and archive-safe vendor records. No WhatsApp integration is used.
            </p>
          </div>
          <Link href="/internal/reorder" className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white dark:bg-white dark:text-slate-950">
            Reorder & Purchases
          </Link>
        </div>
      </section>

      {message ? (
        <div className={`rounded-2xl border p-4 text-sm font-bold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Active suppliers", activeCount],
          ["Archived suppliers", archivedCount],
          ["Visible records", suppliers.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className="mt-3 text-4xl font-black text-slate-950 dark:text-white">{value}</p>
          </div>
        ))}
      </section>

      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[1fr_180px_140px]">
        <input name="q" defaultValue={query} placeholder="Search supplier, GST, city..." className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        <select name="status" defaultValue={status} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All records</option>
        </select>
        <button className="h-12 rounded-xl bg-cyan-600 px-5 text-sm font-black text-white hover:bg-cyan-700">Apply</button>
      </form>

      {canManage ? (
        <details className="group rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <summary className="cursor-pointer list-none text-lg font-black text-slate-950 dark:text-white">+ Add supplier</summary>
          <form action={createSupplierAction} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Supplier code *</span><input name="code" required placeholder="SUP-001" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Company name *</span><input name="companyName" required className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Contact person</span><input name="contactPerson" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Phone</span><input name="phone" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Email</span><input type="email" name="email" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">GST number</span><input name="gstNumber" className="h-12 w-full rounded-xl border border-slate-200 px-4 uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2 md:col-span-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Address</span><input name="addressLine1" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">City</span><input name="city" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">State</span><input name="state" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Postal code</span><input name="postalCode" inputMode="numeric" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Lead time (days)</span><input type="number" name="defaultLeadTimeDays" min="0" defaultValue="7" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Payment terms</span><input name="paymentTerms" placeholder="30 days" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <label className="space-y-2 md:col-span-2 xl:col-span-3"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Internal notes</span><textarea name="internalNotes" rows={3} className="w-full rounded-xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <button className="h-12 rounded-xl bg-cyan-600 px-5 text-sm font-black text-white hover:bg-cyan-700 md:col-span-2 xl:col-span-3">Create supplier</button>
          </form>
        </details>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {suppliers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
            <p className="text-lg font-black text-slate-950 dark:text-white">No suppliers found</p>
          </div>
        ) : suppliers.map((supplier) => {
          const openPurchases = supplier.purchaseRequests.filter((request) => ["SUBMITTED", "APPROVED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(request.status)).length;
          const totalValue = supplier.purchaseRequests.reduce((sum, request) => sum + Number(request.estimatedTotal), 0);
          return (
            <article key={supplier.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">{supplier.code}</span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${supplier.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>{supplier.isActive ? "Active" : "Archived"}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-slate-950 dark:text-white">{supplier.companyName}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{supplier.contactPerson ?? "No contact person"}{supplier.city ? ` · ${supplier.city}` : ""}</p>
                </div>
                <Link href={`/internal/suppliers/${supplier.id}`} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">View Supplier Details</Link>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Products</p><p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{supplier._count.productLinks}</p></div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Open</p><p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{openPurchases}</p></div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Requests</p><p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{supplier._count.purchaseRequests}</p></div>
              </div>
              <p className="mt-4 text-xs font-bold text-slate-400">Estimated purchase history: ₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
