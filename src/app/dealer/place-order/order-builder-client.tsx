"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatDealerCurrency, getProductAvailability } from "@/lib/dealer-portal";
import { createDealerOrderAction } from "./actions";
import {
  acceptDealerCartPricingAction,
  saveDealerCartAction,
  type DealerCartSnapshotItem,
} from "./cart-actions";

type PriceSource = "DEALER_PRICE" | "SELLING_PRICE" | "MANUAL_PRICE" | "LEGACY_BACKFILL";

type ProductItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  minimumStock: number;
  gstRate: number;
  dealerPrice: number | null;
  priceSource: "DEALER_PRICE" | "SELLING_PRICE";
  pricingAvailable: boolean;
  isActive: boolean;
  imageMimeType: string | null;
  category: { id: string; name: string };
  brand: { id: string; name: string };
};

type CartRow = {
  productId: string;
  quantity: number;
  unitPriceSnapshot: number;
  gstRateSnapshot: number;
  priceSourceSnapshot: PriceSource;
};

type SyncState = "saved" | "saving" | "error" | "conflict";

function Icon({ name }: { name: string }) {
  const common = { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "cart") return <svg {...common}><path d="M3 4h2l2 11h10l3-8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "minus") return <svg {...common}><path d="M5 12h14"/></svg>;
  if (name === "trash") return <svg {...common}><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>;
  if (name === "box") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "cloud") return <svg {...common}><path d="M7 18h10a4 4 0 0 0 .4-7.98A6 6 0 0 0 6 8.5 4.5 4.5 0 0 0 7 18Z"/><path d="m9 13 3-3 3 3M12 10v6"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "warning") return <svg {...common}><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={disabled || pending} className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700">
      {pending ? "Creating Order..." : "Confirm & Place Order"}
    </button>
  );
}

function makePayload(items: CartRow[], notes: string) {
  return JSON.stringify({
    items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    notes,
  });
}

function isDifferentNumber(left: number, right: number) {
  return Math.abs(left - right) > 0.005;
}

export function DealerOrderBuilder({
  products,
  initialProductId,
  initialCart,
  initialCartVersion,
  initialNotes,
  initialSavedAt,
}: {
  products: ProductItem[];
  initialProductId?: string;
  initialCart: CartRow[];
  initialCartVersion: number;
  initialNotes: string;
  initialSavedAt: string | null;
}) {
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const initialRows = useMemo(() => {
    const rows = initialCart.filter((item) => productMap.has(item.productId));
    const requestedProduct = initialProductId ? productMap.get(initialProductId) : null;
    if (
      requestedProduct
      && requestedProduct.isActive
      && requestedProduct.quantity > 0
      && requestedProduct.pricingAvailable
      && requestedProduct.dealerPrice !== null
      && !rows.some((row) => row.productId === requestedProduct.id)
    ) {
      return [...rows, {
        productId: requestedProduct.id,
        quantity: 1,
        unitPriceSnapshot: requestedProduct.dealerPrice,
        gstRateSnapshot: requestedProduct.gstRate,
        priceSourceSnapshot: requestedProduct.priceSource,
      }];
    }
    return rows;
  }, [initialCart, initialProductId, productMap]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartRow[]>(initialRows);
  const [notes, setNotes] = useState(initialNotes);
  const [version, setVersion] = useState(initialCartVersion);
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [syncState, setSyncState] = useState<SyncState>("saved");
  const [syncMessage, setSyncMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAcceptingPricing, setIsAcceptingPricing] = useState(false);

  const databaseInitialPayload = useMemo(() => makePayload(initialCart, initialNotes), [initialCart, initialNotes]);
  const [lastSavedPayload, setLastSavedPayload] = useState(databaseInitialPayload);
  const lastFailedPayloadRef = useRef<string | null>(null);
  const currentPayload = useMemo(() => makePayload(cart, notes), [cart, notes]);
  const isDirty = currentPayload !== lastSavedPayload;

  useEffect(() => {
    if (!isDirty || isSaving || syncState === "conflict" || lastFailedPayloadRef.current === currentPayload) return;

    const timer = window.setTimeout(async () => {
      const capturedPayload = currentPayload;
      const capturedItems = cart.map((item) => ({ productId: item.productId, quantity: item.quantity }));
      const capturedNotes = notes;
      const capturedVersion = version;

      setIsSaving(true);
      setSyncState("saving");
      setSyncMessage("");

      try {
        const result = await saveDealerCartAction({
          items: capturedItems,
          notes: capturedNotes,
          version: capturedVersion,
        });

        if (result.status === "saved") {
          setLastSavedPayload(capturedPayload);
          lastFailedPayloadRef.current = null;
          setVersion(result.version);
          setSavedAt(result.savedAt);
          setSyncState("saved");
        } else if (result.status === "conflict") {
          setVersion(result.version);
          setSyncState("conflict");
          setSyncMessage("This cart changed in another session. Reload to protect the latest saved version.");
        } else if (result.status === "error") {
          lastFailedPayloadRef.current = capturedPayload;
          setSyncState("error");
          setSyncMessage(result.message);
        } else {
          lastFailedPayloadRef.current = capturedPayload;
          setSyncState("error");
          setSyncMessage("The cart returned an unexpected save response.");
        }
      } catch {
        lastFailedPayloadRef.current = capturedPayload;
        setSyncState("error");
        setSyncMessage("The cart could not be saved. Change the cart or reload to try again.");
      } finally {
        setIsSaving(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [cart, currentPayload, isDirty, isSaving, notes, syncState, version]);

  const categories = useMemo(() => Array.from(new Map(
    products.filter((product) => product.isActive && product.quantity > 0).map((product) => [product.category.id, product.category]),
  ).values()).sort((a, b) => a.name.localeCompare(b.name)), [products]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      if (!product.isActive || product.quantity <= 0) return false;
      const searchable = [product.code, product.name, product.brand.name, product.category.name].join(" ").toLowerCase();
      return (!normalized || searchable.includes(normalized)) && (category === "all" || product.category.id === category);
    });
  }, [products, query, category]);

  const cartProducts = cart.flatMap((row) => {
    const product = productMap.get(row.productId);
    if (!product) return [];
    const currentUnitPrice = product.dealerPrice ?? 0;
    const base = currentUnitPrice * row.quantity;
    const gst = base * (product.gstRate / 100);
    const priceChanged = product.pricingAvailable && (
      isDifferentNumber(row.unitPriceSnapshot, currentUnitPrice)
      || isDifferentNumber(row.gstRateSnapshot, product.gstRate)
      || row.priceSourceSnapshot !== product.priceSource
    );
    const unavailableReason = !product.isActive
      ? "This product was archived. Remove it from the cart."
      : !product.pricingAvailable
        ? "Dealer pricing is currently unavailable."
        : product.quantity <= 0
          ? "This product is out of stock."
          : row.quantity > product.quantity
            ? `Only ${product.quantity} ${product.unit.toLowerCase()} are currently available.`
            : null;
    return [{ ...row, product, base, gst, total: base + gst, priceChanged, unavailableReason }];
  });

  const subtotal = cartProducts.reduce((sum, row) => sum + row.base, 0);
  const gstTotal = cartProducts.reduce((sum, row) => sum + row.gst, 0);
  const grandTotal = subtotal + gstTotal;
  const totalUnits = cart.reduce((sum, row) => sum + row.quantity, 0);
  const hasPriceChanges = cartProducts.some((row) => row.priceChanged);
  const hasUnavailableItems = cartProducts.some((row) => row.unavailableReason !== null);
  const canSubmit = cart.length > 0
    && !isDirty
    && !isSaving
    && !isAcceptingPricing
    && syncState === "saved"
    && !hasPriceChanges
    && !hasUnavailableItems
    && version > 0;

  function addProduct(productId: string) {
    const product = productMap.get(productId);
    if (!product || !product.isActive || product.quantity <= 0 || !product.pricingAvailable || product.dealerPrice === null) return;

    const currentPrice = product.dealerPrice;
    setCart((current) => {
      const existing = current.find((row) => row.productId === productId);
      if (existing) {
        return current.map((row) => row.productId === productId
          ? { ...row, quantity: Math.min(product.quantity, row.quantity + 1) }
          : row);
      }
      return [...current, {
        productId,
        quantity: 1,
        unitPriceSnapshot: currentPrice,
        gstRateSnapshot: product.gstRate,
        priceSourceSnapshot: product.priceSource,
      }];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    const product = productMap.get(productId);
    if (!product || product.quantity <= 0) return;
    const next = Math.max(1, Math.min(product.quantity, Math.floor(quantity || 1)));
    setCart((current) => current.map((row) => row.productId === productId ? { ...row, quantity: next } : row));
  }

  function removeProduct(productId: string) {
    setCart((current) => current.filter((row) => row.productId !== productId));
  }

  async function acceptCurrentPricing() {
    if (isDirty || isSaving || version < 1 || syncState !== "saved") return;
    setIsAcceptingPricing(true);
    setSyncMessage("");
    try {
      const result = await acceptDealerCartPricingAction({ version });
      if (result.status === "pricing-accepted") {
        const snapshots = new Map<string, DealerCartSnapshotItem>(result.items.map((item) => [item.productId, item]));
        setCart((current) => current.map((row) => {
          const snapshot = snapshots.get(row.productId);
          return snapshot ? {
            ...row,
            unitPriceSnapshot: snapshot.unitPriceSnapshot,
            gstRateSnapshot: snapshot.gstRateSnapshot,
            priceSourceSnapshot: snapshot.priceSourceSnapshot,
          } : row;
        }));
        setVersion(result.version);
        setSavedAt(result.savedAt);
        setSyncState("saved");
      } else if (result.status === "conflict") {
        setVersion(result.version);
        setSyncState("conflict");
        setSyncMessage("This cart changed in another session. Reload before accepting prices.");
      } else if (result.status === "error") {
        setSyncState("error");
        setSyncMessage(result.message);
      } else {
        setSyncState("error");
        setSyncMessage("The cart returned an unexpected pricing response.");
      }
    } catch {
      setSyncState("error");
      setSyncMessage("Current pricing could not be accepted. Try again.");
    } finally {
      setIsAcceptingPricing(false);
    }
  }

  const syncLabel = syncState === "saving"
    ? "Saving cart..."
    : syncState === "conflict"
      ? "Cart conflict"
      : syncState === "error"
        ? "Save failed"
        : savedAt
          ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Ready to save";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="space-y-4">
        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0d182a] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300">
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${syncState === "error" || syncState === "conflict" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" : "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"}`}><Icon name={syncState === "saved" ? "check" : syncState === "conflict" ? "refresh" : "cloud"} /></span>
              <span>{syncLabel}</span>
              <span className="font-semibold text-slate-400">· resumes on every device</span>
            </div>
            {syncState === "conflict" ? <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-black text-white dark:bg-white dark:text-slate-950"><Icon name="refresh" />Load latest cart</button> : null}
          </div>
          {syncMessage ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300">{syncMessage}</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
            <label className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or SKU" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white dark:border-white/10 dark:bg-white/5" />
            </label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5">
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const inCart = cart.some((row) => row.productId === product.id);
            const availability = getProductAvailability(product.quantity, product.minimumStock);
            return (
              <article key={product.id} className={`overflow-hidden rounded-[24px] border bg-white shadow-sm transition dark:bg-[#0d182a] ${inCart ? "border-blue-400 ring-2 ring-blue-500/10 dark:border-blue-400/60" : "border-slate-200 hover:border-blue-200 dark:border-white/10 dark:hover:border-blue-400/25"}`}>
                <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-blue-50 dark:from-white/5 dark:to-blue-500/10">
                  {product.imageMimeType ? <Image src={`/api/product-images/${product.id}`} alt={product.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" unoptimized /> : <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-sm dark:bg-white/10 dark:text-blue-300"><Icon name="box" /></div>}
                  <span className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${availability.tone}`}>{availability.label}</span>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">{product.code}</p>
                  <h3 className="mt-2 line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950 dark:text-white">{product.name}</h3>
                  <p className="mt-1 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{product.brand.name} · {product.unit}</p>
                  <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Dealer price</p><p className="mt-1 text-base font-black text-slate-950 dark:text-white">{product.dealerPrice === null ? "Not set" : formatDealerCurrency(product.dealerPrice)}</p></div><p className="text-[10px] font-bold text-slate-400">+ {product.gstRate}% GST</p></div>
                  <button
                    type="button"
                    disabled={!product.pricingAvailable}
                    onClick={() => addProduct(product.id)}
                    className={`mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-2xl text-xs font-black transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-white/5 ${inCart ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "bg-slate-950 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"}`}
                  >
                    <Icon name={inCart ? "cart" : "plus"} />
                    {!product.pricingAvailable ? "Pricing unavailable" : inCart ? "Added to Order" : "Add to Order"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="xl:sticky xl:top-[96px] xl:self-start">
        <form action={createDealerOrderAction} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-[#0d182a]">
          <input type="hidden" name="cartVersion" value={version} />
          <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 to-blue-950 p-5 text-white dark:border-white/10">
            <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Saved order cart</p><h2 className="mt-1 text-xl font-black">{cart.length} products</h2></div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Icon name="cart" /></div></div>
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-blue-100">{totalUnits} total units selected</p>{cart.length > 0 ? <button type="button" onClick={() => setCart([])} className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-200 hover:text-white">Clear cart</button> : null}</div>
          </div>

          <div className="max-h-[430px] overflow-y-auto p-4">
            {cartProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-white/15"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"><Icon name="cart" /></div><p className="mt-3 text-sm font-black text-slate-900 dark:text-white">Your saved cart is empty</p><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Add products and they will be available after logout or on another device.</p></div>
            ) : (
              <div className="space-y-3">
                {cartProducts.map((row) => (
                  <div key={row.productId} className={`rounded-2xl border p-3 ${row.unavailableReason ? "border-rose-200 bg-rose-50/40 dark:border-rose-400/25 dark:bg-rose-500/5" : row.priceChanged ? "border-amber-200 bg-amber-50/40 dark:border-amber-400/25 dark:bg-amber-500/5" : "border-slate-200 dark:border-white/10"}`}>
                    <div className="flex items-start gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5">{row.product.imageMimeType ? <Image src={`/api/product-images/${row.product.id}`} alt="" fill sizes="48px" className="object-cover" unoptimized /> : <div className="flex h-full items-center justify-center text-blue-500"><Icon name="box" /></div>}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-950 dark:text-white">{row.product.name}</p><p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{row.product.code} · {row.product.dealerPrice === null ? "Pricing unavailable" : formatDealerCurrency(row.product.dealerPrice)}</p></div>
                      <button type="button" onClick={() => removeProduct(row.productId)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"><Icon name="trash" /></button>
                    </div>
                    {row.priceChanged ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-300"><span className="inline-flex items-center gap-1"><Icon name="warning" />Price or GST changed</span><span className="mt-1 block font-semibold">Saved: {formatDealerCurrency(row.unitPriceSnapshot)} + {row.gstRateSnapshot}% GST · Current: {formatDealerCurrency(row.product.dealerPrice ?? 0)} + {row.product.gstRate}% GST</span></div> : null}
                    {row.unavailableReason ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300">{row.unavailableReason}</p> : null}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
                        <button type="button" disabled={row.product.quantity <= 0} onClick={() => updateQuantity(row.productId, row.quantity - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"><Icon name="minus" /></button>
                        <input aria-label={`Quantity for ${row.product.name}`} value={row.quantity} onChange={(event) => updateQuantity(row.productId, Number(event.target.value))} type="number" min="1" max={Math.max(1, row.product.quantity)} disabled={row.product.quantity <= 0} className="h-8 w-12 border-0 bg-transparent p-0 text-center text-xs font-black outline-none disabled:opacity-50" />
                        <button type="button" disabled={row.product.quantity <= 0 || row.quantity >= row.product.quantity} onClick={() => updateQuantity(row.productId, row.quantity + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"><Icon name="plus" /></button>
                      </div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">{row.product.pricingAvailable ? formatDealerCurrency(row.total) : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4 dark:border-white/10">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">Order note</label>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={1000} placeholder="Delivery preference or special instructions" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/5" />
            <div className="mt-4 space-y-2 text-xs font-semibold">
              <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>Subtotal</span><span>{formatDealerCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>GST</span><span>{formatDealerCurrency(gstTotal)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-black text-slate-950 dark:border-white/10 dark:text-white"><span>Current Total</span><span>{formatDealerCurrency(grandTotal)}</span></div>
            </div>
            {hasPriceChanges ? <button type="button" disabled={isDirty || isSaving || isAcceptingPricing || syncState !== "saved"} onClick={acceptCurrentPricing} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300"><Icon name="check" />{isAcceptingPricing ? "Accepting prices..." : "Accept Current Price & GST"}</button> : null}
            <div className="mt-4"><SubmitButton disabled={!canSubmit} /></div>
            {!canSubmit && cart.length > 0 ? <p className="mt-3 text-center text-[10px] font-bold leading-4 text-amber-600 dark:text-amber-300">{syncState === "conflict" ? "Reload the latest cart before ordering." : isDirty || isSaving ? "Wait for the cart to finish saving." : hasUnavailableItems ? "Resolve or remove unavailable items before ordering." : hasPriceChanges ? "Review and accept current pricing before ordering." : "Review the saved cart before ordering."}</p> : null}
            <p className="mt-3 text-center text-[10px] font-semibold leading-4 text-slate-400">The server revalidates product status, current price, GST and complete stock before creating the order. The cart clears only after a successful order.</p>
          </div>
        </form>
      </aside>
    </div>
  );
}
