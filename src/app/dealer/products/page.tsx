import Image from "next/image";
import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import { formatDealerCurrency, getProductAvailability } from "@/lib/dealer-portal";
import { prisma } from "@/lib/db";
import { createDealerStockRequestAction } from "./actions";

function Icon({ name }: { name: string }) {
  const common = { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 5h16M7 12h10m-7 7h4"/></svg>;
  if (name === "box") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "request") return <svg {...common}><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 21h14"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function getMessage(error?: string, success?: string, inquiryNumber?: string, available?: string) {
  if (success === "stock-requested") return { type: "success", text: `Stock request ${inquiryNumber ?? ""} has been sent to the internal team.` };
  if (error === "permission-denied") return { type: "error", text: "You do not have permission to use the dealer catalogue." };
  if (error === "missing-product") return { type: "error", text: "Please select a product." };
  if (error === "invalid-quantity") return { type: "error", text: "Enter a valid required quantity." };
  if (error === "product-not-found") return { type: "error", text: "Selected product is unavailable." };
  if (error === "input-too-long") return { type: "error", text: "The request note is too long." };
  if (error === "stock-available") return { type: "error", text: `This quantity can be ordered now. Available quantity: ${available ?? "enough"}.` };
  return null;
}

export default async function DealerProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    brand?: string;
    availability?: string;
    page?: string;
    error?: string;
    success?: string;
    inquiryNumber?: string;
    available?: string;
  }>;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("view_dealer_products");

  if (!hasAccess || !currentUser.roles.includes("dealer")) {
    return (
      <AccessDeniedCard
        title="Catalogue Access Denied"
        description="Your current role does not have permission to view dealer products."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { category: true, brand: true },
    orderBy: [{ quantity: "desc" }, { name: "asc" }],
  });

  const categories = Array.from(new Map(products.map((product) => [product.category.id, product.category])).values()).sort((a, b) => a.name.localeCompare(b.name));
  const brands = Array.from(new Map(products.map((product) => [product.brand.id, product.brand])).values()).sort((a, b) => a.name.localeCompare(b.name));
  const q = String(params?.q ?? "").trim().toLowerCase();
  const category = String(params?.category ?? "all");
  const brand = String(params?.brand ?? "all");
  const availabilityFilter = String(params?.availability ?? "all");
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 12;

  const filtered = products.filter((product) => {
    const searchable = [product.code, product.name, product.description, product.stack, product.unit, product.category.name, product.brand.name].join(" ").toLowerCase();
    const matchesSearch = !q || searchable.includes(q);
    const matchesCategory = category === "all" || product.categoryId === category;
    const matchesBrand = brand === "all" || product.brandId === brand;
    const availability = product.quantity <= 0 ? "unavailable" : product.quantity <= product.minimumStock ? "limited" : "available";
    const matchesAvailability = availabilityFilter === "all" || availabilityFilter === availability;
    return matchesSearch && matchesCategory && matchesBrand && matchesAvailability;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const visibleProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const availableCount = products.filter((product) => product.quantity > product.minimumStock).length;
  const limitedCount = products.filter((product) => product.quantity > 0 && product.quantity <= product.minimumStock).length;
  const unavailableCount = products.filter((product) => product.quantity <= 0).length;
  const message = getMessage(params?.error, params?.success, params?.inquiryNumber, params?.available);

  function pageHref(page: number) {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (category !== "all") query.set("category", category);
    if (brand !== "all") query.set("brand", brand);
    if (availabilityFilter !== "all") query.set("availability", availabilityFilter);
    query.set("page", String(page));
    return `/dealer/products?${query.toString()}`;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-6 xl:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-300">Live catalogue</span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Find the right product faster</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">Search by product, SKU, brand or category. Dealer pricing and availability are shown directly on every card.</p>
          </div>
        </div>

        {message ? (
          <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300"}`}>{message.text}</div>
        ) : null}

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Available", value: availableCount, tone: "text-emerald-600 dark:text-emerald-300" },
            { label: "Limited", value: limitedCount, tone: "text-amber-600 dark:text-amber-300" },
            { label: "Unavailable", value: unavailableCount, tone: "text-rose-600 dark:text-rose-300" },
          ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-white/10 dark:bg-white/[0.03] sm:p-4"><p className={`text-xl font-black sm:text-2xl ${stat.tone}`}>{stat.value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{stat.label}</p></div>)}
        </div>
      </section>

      <form className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d182a]" action="/dealer/products" method="get">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
            <input name="q" defaultValue={params?.q ?? ""} placeholder="Search products, SKU or brand" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-400" />
          </label>
          <select name="category" defaultValue={category} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5"><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="brand" defaultValue={brand} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5"><option value="all">All brands</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="availability" defaultValue={availabilityFilter} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5"><option value="all">All availability</option><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select>
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"><Icon name="filter" /> Apply</button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4">
        <div><h3 className="text-lg font-black text-slate-950 dark:text-white">Products</h3><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Showing {visibleProducts.length} of {filtered.length} matching products</p></div>
        {(q || category !== "all" || brand !== "all" || availabilityFilter !== "all") ? <Link href="/dealer/products" className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-300">Clear filters</Link> : null}
      </div>

      {visibleProducts.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-[#0d182a]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"><Icon name="box" /></div><h3 className="mt-4 text-lg font-black text-slate-900 dark:text-white">No matching products</h3><p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Try a different search or clear the filters.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleProducts.map((product) => {
            const availability = getProductAvailability(product.quantity, product.minimumStock);
            const price = product.dealerPrice ?? product.sellingPrice;
            return (
              <article key={product.id} className="group overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-xl hover:shadow-slate-900/5 dark:border-white/10 dark:bg-[#0d182a] dark:hover:border-blue-400/25">
                <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-blue-50 dark:from-white/5 dark:via-white/[0.03] dark:to-blue-500/10">
                  {product.imageMimeType ? <Image src={`/api/product-images/${product.id}`} alt={product.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-500 group-hover:scale-105" unoptimized /> : <div className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-white text-blue-600 shadow-lg dark:bg-white/10 dark:text-blue-300"><Icon name="box" /></div>}
                  <span className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${availability.tone}`}>{availability.label}</span>
                  <span className="absolute right-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white backdrop-blur">{product.unit}</span>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">{product.code}</p>
                  <h4 className="mt-2 line-clamp-2 min-h-10 text-base font-black leading-5 text-slate-950 dark:text-white">{product.name}</h4>
                  <p className="mt-2 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{product.brand.name} · {product.category.name}</p>
                  {product.description ? <p className="mt-3 line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{product.description}</p> : <div className="min-h-13" />}
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Dealer price</p><p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{price ? formatDealerCurrency(price.toString()) : "Price on request"}</p></div>
                    <p className="text-right text-[10px] font-bold text-slate-400">GST<br/><span className="text-xs font-black text-slate-600 dark:text-slate-300">{Number(product.gstRate)}%</span></p>
                  </div>
                  {product.quantity <= 0 ? (
                    <details className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-400/25 dark:bg-rose-500/10">
                      <summary className="flex cursor-pointer list-none items-center justify-center gap-2 text-sm font-black text-rose-700 dark:text-rose-300"><Icon name="request" /> Request Stock</summary>
                      <form action={createDealerStockRequestAction} className="mt-3 space-y-2">
                        <input type="hidden" name="productId" value={product.id} />
                        <input name="quantityAsked" type="number" min="1" required placeholder="Required quantity" className="h-10 w-full rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold outline-none dark:border-rose-400/25 dark:bg-slate-950" />
                        <textarea name="note" rows={2} placeholder="Optional note" className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold outline-none dark:border-rose-400/25 dark:bg-slate-950" />
                        <button className="h-10 w-full rounded-xl bg-rose-600 text-xs font-black text-white hover:bg-rose-700">Send Request</button>
                      </form>
                    </details>
                  ) : (
                    <div className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ordering</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-slate-700 dark:text-slate-200">Available in New Order</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Ready</span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0d182a]">
          <Link aria-disabled={safePage <= 1} href={safePage > 1 ? pageHref(safePage - 1) : pageHref(1)} className={`rounded-xl border px-4 py-2 text-xs font-black ${safePage <= 1 ? "pointer-events-none border-slate-200 text-slate-300 dark:border-white/10 dark:text-slate-600" : "border-slate-200 text-slate-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"}`}>Previous</Link>
          <p className="text-xs font-black text-slate-500 dark:text-slate-400">Page {safePage} of {pageCount}</p>
          <Link aria-disabled={safePage >= pageCount} href={safePage < pageCount ? pageHref(safePage + 1) : pageHref(pageCount)} className={`rounded-xl border px-4 py-2 text-xs font-black ${safePage >= pageCount ? "pointer-events-none border-slate-200 text-slate-300 dark:border-white/10 dark:text-slate-600" : "border-slate-200 text-slate-700 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"}`}>Next</Link>
        </div>
      ) : null}
    </div>
  );
}
