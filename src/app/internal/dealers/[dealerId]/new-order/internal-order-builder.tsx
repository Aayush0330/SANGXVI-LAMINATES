"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatDealerAccountCurrency, type InternalDealerOrderSource } from "@/lib/dealer-directory-shared";
import { createInternalDealerOrderAction } from "./actions";

type ProductItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  gstRate: number;
  unitPrice: number;
  categoryName: string;
  brandName: string;
};

type CartRow = { productId: string; quantity: number };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={disabled || pending} className="h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400">{pending ? "Creating Order..." : "Confirm Internal Order"}</button>;
}

export function InternalDealerOrderBuilder({
  dealerId,
  products,
  sourceOptions,
}: {
  dealerId: string;
  products: ProductItem[];
  sourceOptions: { value: InternalDealerOrderSource; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartRow[]>([]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => !normalized || [product.code, product.name, product.categoryName, product.brandName].join(" ").toLowerCase().includes(normalized));
  }, [products, query]);
  const rows = cart.flatMap((row) => {
    const product = productMap.get(row.productId);
    if (!product) return [];
    const lineSubtotal = product.unitPrice * row.quantity;
    const taxAmount = lineSubtotal * (product.gstRate / 100);
    return [{ ...row, product, lineSubtotal, taxAmount, lineTotal: lineSubtotal + taxAmount }];
  });
  const subtotal = rows.reduce((sum, row) => sum + row.lineSubtotal, 0);
  const tax = rows.reduce((sum, row) => sum + row.taxAmount, 0);
  const total = subtotal + tax;
  const hasStockIssue = rows.some((row) => row.quantity > row.product.quantity);

  function add(productId: string) {
    setCart((current) => current.some((row) => row.productId === productId) ? current : [...current, { productId, quantity: 1 }]);
  }
  function quantity(productId: string, next: number) {
    setCart((current) => current.map((row) => row.productId === productId ? { ...row, quantity: Math.max(1, Math.min(100000, next)) } : row));
  }
  const boundAction = createInternalDealerOrderAction.bind(null, dealerId);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-cyan-300">Product Selection</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Build the dealer order</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, brand..." className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 sm:max-w-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {filtered.map((product) => {
            const selected = cart.some((row) => row.productId === product.id);
            return <article key={product.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-slate-950 dark:text-white">{product.name}</p><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{product.code} · {product.brandName}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${product.quantity > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>{product.quantity} available</span></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-lg font-black text-blue-700 dark:text-cyan-300">{formatDealerAccountCurrency(product.unitPrice)}</p><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">+ {product.gstRate}% GST · per {product.unit}</p></div><button type="button" disabled={selected || product.quantity <= 0} onClick={() => add(product.id)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:disabled:bg-slate-800 dark:disabled:text-slate-500">{selected ? "Added" : "Add"}</button></div></article>;
          })}
        </div>
      </section>

      <form action={boundAction} className="h-fit rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 xl:sticky xl:top-28">
        <input type="hidden" name="itemsJson" value={JSON.stringify(cart)} />
        <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-600 dark:text-violet-300">Controlled Entry</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Review and submit</h2>
        <div className="mt-5 space-y-3">
          {rows.map((row) => <div key={row.productId} className={`rounded-2xl border p-4 ${row.quantity > row.product.quantity ? "border-rose-200 bg-rose-50/40 dark:border-rose-500/25 dark:bg-rose-500/5" : "border-slate-200 dark:border-slate-800"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-950 dark:text-white">{row.product.name}</p><p className="mt-1 text-xs text-slate-400">{formatDealerAccountCurrency(row.lineTotal)} including GST</p></div><button type="button" onClick={() => setCart((current) => current.filter((item) => item.productId !== row.productId))} className="text-xs font-black text-rose-600">Remove</button></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">Quantity</span><div className="flex items-center gap-2"><button type="button" onClick={() => quantity(row.productId, row.quantity - 1)} className="h-8 w-8 rounded-lg border border-slate-200 font-black dark:border-slate-700">−</button><input aria-label={`Quantity for ${row.product.name}`} type="number" min="1" max="100000" value={row.quantity} onChange={(event) => quantity(row.productId, Number(event.target.value) || 1)} className="h-8 w-20 rounded-lg border border-slate-200 text-center text-sm font-black dark:border-slate-700 dark:bg-slate-950" /><button type="button" onClick={() => quantity(row.productId, row.quantity + 1)} className="h-8 w-8 rounded-lg border border-slate-200 font-black dark:border-slate-700">+</button></div></div>{row.quantity > row.product.quantity ? <p className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-300">Full quantity is unavailable. Reduce the quantity or update stock before submitting.</p> : null}</div>)}
          {!rows.length ? <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">Add at least one product.</p> : null}
        </div>
        <div className="mt-5 grid gap-4">
          <div><label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Order Source</label><select name="source" defaultValue="MANUAL_ENTRY" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white">{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><p className="mt-2 text-xs text-slate-400">WhatsApp is recorded only as a source label. No messaging integration is used.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Priority</label><select name="priority" defaultValue="NORMAL" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></div><div><label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Required By</label><input name="requiredBy" type="date" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></div></div>
          <div><label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Order Notes</label><textarea name="notes" rows={4} maxLength={1000} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Customer instruction, phone confirmation, walk-in reference..." /></div>
        </div>
        <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><strong>{formatDealerAccountCurrency(subtotal)}</strong></div><div className="flex justify-between text-sm"><span className="text-slate-500">GST</span><strong>{formatDealerAccountCurrency(tax)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-3 text-base dark:border-slate-800"><span className="font-black">Estimated Total</span><strong className="text-blue-700 dark:text-cyan-300">{formatDealerAccountCurrency(total)}</strong></div></div>
        <div className="mt-5"><SubmitButton disabled={!rows.length || hasStockIssue} /></div>
      </form>
    </div>
  );
}
