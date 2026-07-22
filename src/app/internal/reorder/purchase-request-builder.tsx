"use client";

import { useMemo, useState } from "react";
import { createPurchaseRequestAction } from "./actions";

type ProductOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  minimumOrderQuantity: number;
  suggestedQuantity: number;
  unitPrice: number;
};

type SupplierOption = {
  id: string;
  code: string;
  companyName: string;
  products: ProductOption[];
};

type Row = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export function PurchaseRequestBuilder({
  suppliers,
  initialSupplierId,
}: {
  suppliers: SupplierOption[];
  initialSupplierId?: string;
}) {
  const initialSupplier = suppliers.find((supplier) => supplier.id === initialSupplierId) ?? suppliers[0] ?? null;
  const [supplierId, setSupplierId] = useState(initialSupplier?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const supplier = useMemo(() => suppliers.find((item) => item.id === supplierId) ?? null, [supplierId, suppliers]);
  const availableProducts = supplier?.products ?? [];

  function addProduct(productId: string) {
    const product = availableProducts.find((item) => item.id === productId);
    if (!product) return;
    setRows((current) => {
      const existing = current.find((row) => row.productId === productId);
      if (existing) {
        return current.map((row) => row.productId === productId ? { ...row, quantity: row.quantity + product.minimumOrderQuantity } : row);
      }
      return [...current, {
        productId,
        quantity: Math.max(product.minimumOrderQuantity, product.suggestedQuantity || product.minimumOrderQuantity),
        unitPrice: product.unitPrice,
      }];
    });
  }

  function changeSupplier(next: string) {
    setSupplierId(next);
    setRows([]);
  }

  const total = rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const serialized = JSON.stringify(rows);

  return (
    <form action={createPurchaseRequestAction} className="space-y-5">
      <input type="hidden" name="itemsJson" value={serialized} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Supplier *</span>
          <select name="supplierId" value={supplierId} onChange={(event) => changeSupplier(event.target.value)} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white">
            <option value="">Select supplier</option>
            {suppliers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.companyName}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Add mapped product</span>
          <select value="" onChange={(event) => addProduct(event.target.value)} disabled={!supplier} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
            <option value="">Select product</option>
            {availableProducts.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}
          </select>
        </label>
      </div>

      {supplier && availableProducts.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          This supplier has no active product mappings. Add products from Supplier Details first.
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">Add at least one product.</div>
        ) : rows.map((row) => {
          const product = availableProducts.find((item) => item.id === row.productId);
          if (!product) return null;
          return (
            <div key={row.productId} className="grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-[1fr_140px_170px_110px] md:items-end">
              <div>
                <p className="font-black text-slate-950 dark:text-white">{product.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{product.code} · MOQ {product.minimumOrderQuantity} · Suggested {product.suggestedQuantity} {product.unit}</p>
              </div>
              <label className="space-y-2"><span className="text-[10px] font-black uppercase text-slate-400">Quantity</span><input type="number" min={product.minimumOrderQuantity} value={row.quantity} onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, quantity: Math.max(product.minimumOrderQuantity, Number(event.target.value) || product.minimumOrderQuantity) } : item))} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="space-y-2"><span className="text-[10px] font-black uppercase text-slate-400">Expected unit price</span><input type="number" min="0" step="0.01" value={row.unitPrice} onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, unitPrice: Math.max(0, Number(event.target.value) || 0) } : item))} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <button type="button" onClick={() => setRows((current) => current.filter((item) => item.productId !== row.productId))} className="h-11 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-600 dark:border-rose-500/30 dark:text-rose-300">Remove</button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Priority</span><select name="priority" defaultValue="NORMAL" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Expected delivery</span><input type="date" name="expectedDeliveryDate" className="h-12 w-full rounded-xl border border-slate-200 px-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <div className="rounded-2xl bg-slate-950 p-4 text-white dark:bg-white dark:text-slate-950"><p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">Estimated total</p><p className="mt-2 text-2xl font-black">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p></div>
      </div>
      <label className="space-y-2 block"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Internal notes</span><textarea name="notes" rows={3} className="w-full rounded-xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
      <button disabled={!supplierId || rows.length === 0} className="h-12 w-full rounded-xl bg-cyan-600 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Submit for owner approval</button>
    </form>
  );
}
