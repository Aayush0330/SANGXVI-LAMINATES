"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  archiveProductAction,
  createProductAction,
  createProductBrandAction,
  createProductCategoryAction,
  reactivateProductAction,
  updateProductAction,
  updateStockAction,
} from "./actions";

type ProductStatus = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK";
type MainTab = "products" | "categories" | "brands" | "archived";
type FormTab = "basic" | "inventory" | "pricing";
type DetailsTab = "overview" | "stock" | "usage" | "details";

type Message = { type: "success" | "error"; text: string } | null;

type ProductRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  stack: string;
  unit: string;
  gstRate: number;
  purchasePrice: number | null;
  sellingPrice: number | null;
  dealerPrice: number | null;
  imageUrl: string | null;
  imageFileName: string | null;
  quantity: number;
  blocked: number;
  minimumStock: number;
  maximumStock: number;
  status: ProductStatus;
  isActive: boolean;
  archivedAt: string | null;
  archivedByName: string | null;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  blockCount: number;
  purchaseReceiptCount: number;
  recentPurchases: Array<{
    id: string;
    receiptNumber: string;
    requestNumber: string;
    supplierName: string;
    acceptedQuantity: number;
    damagedQuantity: number;
    rejectedQuantity: number;
    unitCost: number | null;
    receivedAt: string;
  }>;
  recentBlocks: Array<{
    id: string;
    quantity: number;
    status: string;
    blockReason: string;
    releaseReason: string | null;
    blockedAt: string;
    releasedAt: string | null;
    orderNumber: string;
  }>;
};

type MasterRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
};

type Props = {
  message: Message;
  products: ProductRecord[];
  categories: MasterRecord[];
  brands: MasterRecord[];
};

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
const labelClass = "mb-2 block text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400";

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    cube: <><path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"/><path d="M4.5 7.2v8.6L12 20l7.5-4.2V7.2"/><path d="M12 11.4V20"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    warning: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></>,
    stop: <><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></>,
    crown: <><path d="m4 8 3 3 5-6 5 6 3-3-2 10H6L4 8Z"/><path d="M6 18h12"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    archive: <><path d="M4 7h16"/><path d="M5 7v12h14V7"/><path d="M9 11h6"/><path d="M3 4h18v3H3z"/></>,
    edit: <><path d="m14 5 5 5"/><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></>,
    x: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    filter: <><path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    list: <><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
    box: <><path d="M4 8h16v12H4z"/><path d="M2 4h20v4H2z"/><path d="M9 12h6"/></>,
    rotate: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/></>,
    activity: <><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
    tag: <><path d="m20 13-7 7L4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1.5"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14a2 2 0 0 0 2-2v-3"/><path d="M3 15v3a2 2 0 0 0 2 2"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    rupee: <><path d="M6 4h12"/><path d="M6 8h12"/><path d="M7 4c6 0 6 8 0 8h-1l8 8"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.cube}</svg>;
}

function productPalette(product: Pick<ProductRecord, "name" | "code">) {
  const palettes = [
    ["#111827", "#475569"], ["#d6d3d1", "#f8fafc"], ["#9a3412", "#f59e0b"],
    ["#334155", "#94a3b8"], ["#14532d", "#4ade80"], ["#581c87", "#c084fc"],
  ];
  const seed = [...`${product.name}${product.code}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palettes[seed % palettes.length];
}

function ProductSwatch({ product, size = "md" }: { product: Pick<ProductRecord, "name" | "code" | "imageUrl">; size?: "sm" | "md" | "lg" }) {
  const [from, to] = productPalette(product);
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(135deg, ${from}, ${to}), repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 2px, transparent 2px 7px)`,
    backgroundBlendMode: "overlay",
  };
  const sizeClass = size === "lg" ? "h-16 w-16 rounded-2xl" : size === "sm" ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";

  if (product.imageUrl) {
    return <span className={`${sizeClass} relative shrink-0 overflow-hidden border border-white/60 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700`}><Image src={product.imageUrl} alt={product.name} fill unoptimized sizes="64px" className="object-cover" /></span>;
  }

  return <div className={`${sizeClass} shrink-0 border border-white/40 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700`} style={style} aria-label={`${product.name} swatch`} />;
}

function statusMeta(product: Pick<ProductRecord, "status" | "quantity" | "minimumStock">) {
  if (product.quantity <= 0 || product.status === "OUT_OF_STOCK") return { label: "Out of Stock", className: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20" };
  if (product.quantity <= product.minimumStock || product.status === "LOW_STOCK") return { label: "Low Stock", className: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20" };
  return { label: "In Stock", className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20" };
}

function StatusBadge({ product }: { product: Pick<ProductRecord, "status" | "quantity" | "minimumStock"> }) {
  const meta = statusMeta(product);
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${meta.className}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{meta.label}</span>;
}

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(date));
}

function formatDateTime(date: string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(date));
}

function formatCurrency(value: number | null) {
  if (value === null) return "Not set";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function Drawer({ open, title, eyebrow, onClose, children, width = 456 }: { open: boolean; title: string; eyebrow: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-200 bg-slate-50 shadow-[-24px_0_70px_rgba(15,23,42,.2)] dark:border-slate-800 dark:bg-slate-950"
        style={{ maxWidth: `${width}px` }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-[78px] items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p>
            <h2 className="mt-1 truncate text-[20px] font-black tracking-tight text-slate-950 dark:text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white" aria-label="Close drawer">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

function StatCard({ label, value, helper, icon, tone }: { label: string; value: string; helper: string; icon: string; tone: "blue" | "green" | "amber" | "red" | "violet" }) {
  const toneMap = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    red: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${toneMap[tone]}`}><Icon name={icon} className="h-5 w-5" /></span></div><p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{helper}</p></article>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900/40"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-900"><Icon name="box" /></span><h3 className="mt-4 font-black text-slate-950 dark:text-white">{title}</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p></div></div>;
}

export function ProductManagementClient({ message, products, categories, brands }: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("products");
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [drawer, setDrawer] = useState<"create" | "details" | "edit" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formTab, setFormTab] = useState<FormTab>("basic");
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("overview");

  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);
  const archivedProducts = useMemo(() => products.filter((product) => !product.isActive), [products]);
  const selectedProduct = products.find((product) => product.id === selectedId) ?? null;
  const units = useMemo(() => [...new Set(activeProducts.map((product) => product.unit))].sort(), [activeProducts]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeProducts.filter((product) => {
      if (query && ![product.name, product.code, product.stack, product.categoryName, product.brandName, product.unit].join(" ").toLowerCase().includes(query)) return false;
      if (categoryFilter !== "all" && product.categoryId !== categoryFilter) return false;
      if (brandFilter !== "all" && product.brandId !== brandFilter) return false;
      if (unitFilter !== "all" && product.unit !== unitFilter) return false;
      if (stockFilter === "available" && statusMeta(product).label !== "In Stock") return false;
      if (stockFilter === "low" && statusMeta(product).label !== "Low Stock") return false;
      if (stockFilter === "out" && statusMeta(product).label !== "Out of Stock") return false;
      return true;
    });
  }, [activeProducts, search, categoryFilter, brandFilter, unitFilter, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filteredProducts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const lowStock = activeProducts.filter((product) => product.quantity > 0 && product.quantity <= product.minimumStock).length;
  const outOfStock = activeProducts.filter((product) => product.quantity <= 0).length;
  const topCategory = useMemo(() => {
    const counts = activeProducts.reduce<Record<string, number>>((acc, product) => { acc[product.categoryName] = (acc[product.categoryName] ?? 0) + 1; return acc; }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  }, [activeProducts]);
  const stockTotal = activeProducts.reduce((sum, product) => sum + product.quantity, 0);
  const maxCapacity = activeProducts.reduce((sum, product) => sum + product.maximumStock, 0);
  const healthy = activeProducts.length - lowStock - outOfStock;
  const resetFilters = () => { setSearch(""); setCategoryFilter("all"); setBrandFilter("all"); setUnitFilter("all"); setStockFilter("all"); };
  const openDetails = (product: ProductRecord) => { setSelectedId(product.id); setDetailsTab("overview"); setDrawer("details"); };
  const openEdit = (product: ProductRecord) => { setSelectedId(product.id); setFormTab("basic"); setDrawer("edit"); };

  const tabs: Array<{ id: MainTab; label: string; count?: number }> = [
    { id: "products", label: "All Products", count: activeProducts.length },
    { id: "categories", label: "Categories", count: categories.filter((item) => item.isActive).length },
    { id: "brands", label: "Brands", count: brands.filter((item) => item.isActive).length },
    { id: "archived", label: "Archived", count: archivedProducts.length },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Inventory Catalogue</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Product Management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Manage product identity, stock levels, catalogue visibility and reorder targets from one workspace.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setFormTab("basic"); setDrawer("create"); }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-lg shadow-slate-950/15 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"><Icon name="plus" className="h-4 w-4" />Add Product</button></div>
      </header>

      {message ? <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"}`}>{message.text}</div> : null}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setMainTab(tab.id)} className={`relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-bold ${mainTab === tab.id ? "text-blue-600" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>{tab.label}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-800">{tab.count}</span>{mainTab === tab.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600" /> : null}</button>)}
      </nav>

      {mainTab === "products" ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Total Products" value={String(products.length)} helper={`${archivedProducts.length} archived`} icon="cube" tone="blue" />
            <StatCard label="Active Products" value={String(activeProducts.length)} helper={`${activeProducts.length ? Math.round((activeProducts.length / products.length) * 100) : 0}% of catalogue`} icon="check" tone="green" />
            <StatCard label="Low Stock" value={String(lowStock)} helper="Needs attention" icon="warning" tone="amber" />
            <StatCard label="Out of Stock" value={String(outOfStock)} helper="Immediate action" icon="stop" tone="red" />
            <StatCard label="Top Category" value={String(topCategory[0])} helper={`${topCategory[1]} products`} icon="crown" tone="violet" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 xl:grid-cols-[minmax(240px,1.5fr)_repeat(4,minmax(130px,.75fr))_auto]">
              <label className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="h-4 w-4" /></span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by product name or code..." className={`${inputClass} pl-9`} /></label>
              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} className={inputClass}><option value="all">All Categories</option>{categories.filter((item) => item.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <select value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); setPage(1); }} className={inputClass}><option value="all">All Brands</option>{brands.filter((item) => item.isActive).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
              <select value={unitFilter} onChange={(event) => { setUnitFilter(event.target.value); setPage(1); }} className={inputClass}><option value="all">All Units</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
              <select value={stockFilter} onChange={(event) => { setStockFilter(event.target.value); setPage(1); }} className={inputClass}><option value="all">All Stock States</option><option value="available">In Stock</option><option value="low">Low Stock</option><option value="out">Out of Stock</option></select>
              <div className="flex gap-2"><button type="button" onClick={resetFilters} className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 px-3 text-xs font-black text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-500/10"><Icon name="rotate" className="h-4 w-4" />Reset</button><div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700"><button type="button" onClick={() => setView("table")} className={`grid h-8 w-8 place-items-center rounded-lg ${view === "table" ? "bg-slate-950 text-white dark:bg-blue-600" : "text-slate-500"}`}><Icon name="list" className="h-4 w-4" /></button><button type="button" onClick={() => setView("grid")} className={`grid h-8 w-8 place-items-center rounded-lg ${view === "grid" ? "bg-slate-950 text-white dark:bg-blue-600" : "text-slate-500"}`}><Icon name="grid" className="h-4 w-4" /></button></div></div>
            </div>

            {view === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400"><tr><th className="px-4 py-3">Product</th><th className="px-3 py-3">Code / SKU</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Brand</th><th className="px-3 py-3">Unit</th><th className="px-3 py-3 text-center">Current</th><th className="px-3 py-3 text-center">Min</th><th className="px-3 py-3 text-center">Max</th><th className="px-3 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pagedProducts.map((product) => <tr key={product.id} className="cursor-pointer transition hover:bg-blue-50/50 dark:hover:bg-blue-500/5" onClick={() => openDetails(product)}><td className="px-4 py-3"><div className="flex items-center gap-3"><ProductSwatch product={product} size="sm" /><div><p className="font-black text-slate-950 dark:text-white">{product.name}</p><p className="mt-0.5 max-w-52 truncate text-[10px] text-slate-500 dark:text-slate-400">{product.description || `Stack ${product.stack}`}</p></div></div></td><td className="px-3 py-3 font-bold text-slate-700 dark:text-slate-200">{product.code}</td><td className="px-3 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">{product.categoryName}</span></td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{product.brandName}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{product.unit}</td><td className={`px-3 py-3 text-center font-black ${product.quantity <= 0 ? "text-rose-600" : "text-slate-950 dark:text-white"}`}>{product.quantity}</td><td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">{product.minimumStock}</td><td className="px-3 py-3 text-center text-slate-600 dark:text-slate-300">{product.maximumStock}</td><td className="px-3 py-3"><StatusBadge product={product} /></td><td className="px-4 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); openEdit(product); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-black text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300"><Icon name="edit" className="h-3.5 w-3.5" />Edit</button></td></tr>)}
                  </tbody>
                </table>
                {pagedProducts.length === 0 ? <div className="p-5"><EmptyState title="No products found" description="Change filters or add a new product to the catalogue." /></div> : null}
              </div>
            ) : (
              <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{pagedProducts.map((product) => <article key={product.id} className="cursor-pointer rounded-2xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-slate-700" onClick={() => openDetails(product)}><div className="flex items-start justify-between gap-3"><ProductSwatch product={product} size="lg" /><StatusBadge product={product} /></div><h3 className="mt-4 font-black text-slate-950 dark:text-white">{product.name}</h3><p className="mt-1 text-xs text-slate-500">{product.code} · {product.brandName}</p><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Current</p><p className="mt-1 font-black text-slate-950 dark:text-white">{product.quantity}</p></div><div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Minimum</p><p className="mt-1 font-black text-slate-950 dark:text-white">{product.minimumStock}</p></div><div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Maximum</p><p className="mt-1 font-black text-slate-950 dark:text-white">{product.maximumStock}</p></div></div></article>)}</div>
            )}

            <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"><p className="text-xs font-semibold text-slate-500">Showing {filteredProducts.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filteredProducts.length)} of {filteredProducts.length} active products</p><div className="flex items-center gap-2"><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-40 dark:border-slate-700"><Icon name="chevronLeft" className="h-4 w-4" /></button>{Array.from({ length: Math.min(5, totalPages) }, (_, index) => { const start = Math.max(1, Math.min(safePage - 2, totalPages - 4)); const value = start + index; return <button key={value} type="button" onClick={() => setPage(value)} className={`h-9 min-w-9 rounded-lg px-2 text-xs font-black ${safePage === value ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{value}</button>; })}<button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-40 dark:border-slate-700"><Icon name="chevronRight" className="h-4 w-4" /></button><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"><option value={8}>8 / page</option><option value={16}>16 / page</option><option value={32}>32 / page</option></select></div></footer>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h3 className="font-black text-slate-950 dark:text-white">Stock Distribution</h3><div className="mt-5 flex items-center gap-5"><div className="grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#22c55e 0 ${activeProducts.length ? (healthy / activeProducts.length) * 100 : 0}%, #f59e0b 0 ${activeProducts.length ? ((healthy + lowStock) / activeProducts.length) * 100 : 0}%, #f43f5e 0)` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center dark:bg-slate-900"><div><p className="text-xl font-black text-slate-950 dark:text-white">{activeProducts.length}</p><p className="text-[9px] font-bold text-slate-400">Products</p></div></div></div><div className="min-w-0 flex-1 space-y-3">{[["In Stock", healthy, "bg-emerald-500"], ["Low Stock", lowStock, "bg-amber-500"], ["Out of Stock", outOfStock, "bg-rose-500"]].map(([label, value, dot]) => <div key={String(label)} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</span><span className="font-black text-slate-950 dark:text-white">{value}</span></div>)}</div></div><div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950"><div className="flex justify-between"><span className="text-slate-500">Available units</span><strong>{stockTotal.toLocaleString("en-IN")}</strong></div><div className="mt-2 flex justify-between"><span className="text-slate-500">Configured capacity</span><strong>{maxCapacity.toLocaleString("en-IN")}</strong></div></div></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h3 className="font-black text-slate-950 dark:text-white">Category Distribution</h3><div className="mt-5 space-y-4">{categories.filter((item) => item.isActive).sort((a, b) => b.productCount - a.productCount).slice(0, 5).map((category) => { const percentage = activeProducts.length ? Math.min(100, (activeProducts.filter((product) => product.categoryId === category.id).length / activeProducts.length) * 100) : 0; return <div key={category.id}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold text-slate-600 dark:text-slate-300">{category.name}</span><span className="font-black text-slate-950 dark:text-white">{Math.round(percentage)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percentage}%` }} /></div></div>; })}</div></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h3 className="font-black text-slate-950 dark:text-white">Products Needing Attention</h3><div className="mt-4 space-y-2">{activeProducts.filter((product) => product.quantity <= product.minimumStock).slice(0, 5).map((product) => <button key={product.id} type="button" onClick={() => openDetails(product)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-2.5 text-left hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-500/5"><ProductSwatch product={product} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-950 dark:text-white">{product.name}</p><p className="mt-0.5 text-[10px] text-slate-500">Current {product.quantity} · Min {product.minimumStock}</p></div><span className="text-xs font-black text-amber-600">+{Math.max(product.maximumStock - product.quantity, 0)}</span></button>)}{!activeProducts.some((product) => product.quantity <= product.minimumStock) ? <p className="rounded-xl bg-emerald-50 p-4 text-center text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">All active products are above minimum stock.</p> : null}</div></article>
          </section>
        </>
      ) : null}

      {mainTab === "categories" ? <MasterPanel type="category" records={categories} /> : null}
      {mainTab === "brands" ? <MasterPanel type="brand" records={brands} /> : null}
      {mainTab === "archived" ? <ArchivedPanel products={archivedProducts} onDetails={openDetails} /> : null}

      <ProductFormDrawer key={`create-${drawer === "create" ? "open" : "closed"}`} mode="create" open={drawer === "create"} onClose={() => setDrawer(null)} formTab={formTab} setFormTab={setFormTab} categories={categories} brands={brands} />
      <ProductFormDrawer key={`edit-${selectedProduct?.id ?? "none"}-${drawer === "edit" ? "open" : "closed"}`} mode="edit" open={drawer === "edit" && Boolean(selectedProduct)} onClose={() => setDrawer(null)} formTab={formTab} setFormTab={setFormTab} categories={categories} brands={brands} product={selectedProduct} />
      <ProductDetailsDrawer open={drawer === "details" && Boolean(selectedProduct)} onClose={() => setDrawer(null)} product={selectedProduct} detailsTab={detailsTab} setDetailsTab={setDetailsTab} onEdit={() => selectedProduct && openEdit(selectedProduct)} />
    </div>
  );
}

function MasterPanel({ type, records }: { type: "category" | "brand"; records: MasterRecord[] }) {
  const isCategory = type === "category";
  const action = isCategory ? createProductCategoryAction : createProductBrandAction;
  const nameKey = isCategory ? "categoryName" : "brandName";
  const descriptionKey = isCategory ? "categoryDescription" : "brandDescription";
  return <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><form action={action} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Catalogue Master</p><h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">Add {isCategory ? "Category" : "Brand / Company"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Create a reusable {isCategory ? "classification" : "manufacturer / company"} for products.</p><label className="mt-5 block"><span className={labelClass}>{isCategory ? "Category" : "Brand"} Name *</span><input name={nameKey} required maxLength={80} className={inputClass} placeholder={isCategory ? "e.g. Laminate" : "e.g. Greenlam"} /></label><label className="mt-4 block"><span className={labelClass}>Description</span><textarea name={descriptionKey} maxLength={300} rows={4} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" placeholder="Optional details" /></label><button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"><Icon name="plus" className="h-4 w-4" />Create {isCategory ? "Category" : "Brand"}</button></form><div className="grid content-start gap-3 sm:grid-cols-2 2xl:grid-cols-3">{records.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><Icon name={isCategory ? "tag" : "box"} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${record.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{record.isActive ? "Active" : "Inactive"}</span></div><h3 className="mt-4 font-black text-slate-950 dark:text-white">{record.name}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{record.description || "No description added."}</p><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800"><span className="text-slate-500">Products</span><strong className="text-slate-950 dark:text-white">{record.productCount}</strong></div></article>)}</div></section>;
}

function ArchivedPanel({ products, onDetails }: { products: ProductRecord[]; onDetails: (product: ProductRecord) => void }) {
  if (!products.length) return <EmptyState title="No archived products" description="Products archived from the active catalogue will appear here with their complete history preserved." />;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-200 p-5 dark:border-slate-800"><h2 className="text-xl font-black text-slate-950 dark:text-white">Archived Products</h2><p className="mt-1 text-sm text-slate-500">Hidden from new dealer orders. Historical order records remain unchanged.</p></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{products.map((product) => <article key={product.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><button type="button" onClick={() => onDetails(product)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><ProductSwatch product={product} /><div className="min-w-0"><h3 className="truncate font-black text-slate-950 dark:text-white">{product.name}</h3><p className="mt-1 text-xs text-slate-500">{product.code} · Archived {formatDate(product.archivedAt)}{product.archivedByName ? ` by ${product.archivedByName}` : ""}</p></div></button><div className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{product.usageCount} historical uses</span><form action={reactivateProductAction}><input type="hidden" name="productId" value={product.id} /><button className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"><Icon name="rotate" className="h-4 w-4" />Reactivate</button></form></div></article>)}</div></section>;
}

function ProductFormDrawer({ mode, open, onClose, formTab, setFormTab, categories, brands, product = null }: { mode: "create" | "edit"; open: boolean; onClose: () => void; formTab: FormTab; setFormTab: (tab: FormTab) => void; categories: MasterRecord[]; brands: MasterRecord[]; product?: ProductRecord | null }) {
  const isEdit = mode === "edit";
  const action = isEdit ? updateProductAction : createProductAction;
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const compactInputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
  const compactLabelClass = "mb-1.5 block text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400";

  const generateSku = () => {
    const categoryName = categoryRef.current?.selectedOptions[0]?.text ?? "Product";
    const productName = nameRef.current?.value.trim() || "Item";
    const clean = (value: string, length = 3) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, length).padEnd(length, "X");
    const categoryCode = clean(categoryName);
    const words = productName.split(/\s+/).filter(Boolean);
    const nameCode = words.length > 1
      ? `${clean(words[0], 2)}${clean(words[1], 2)}`
      : clean(productName, 4);
    const suffix = String(Date.now()).slice(-4);
    if (codeRef.current) codeRef.current.value = `${categoryCode}-${nameCode}-${suffix}`;
  };

  const handleImageChange = (file: File | undefined) => {
    setImageError(null);
    if (!file) {
      setImagePreview(product?.imageUrl ?? null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Use a PNG, JPG or WEBP image.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be 5 MB or smaller.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    setRemoveImage(false);
  };

  const validateStep = (step: FormTab) => {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-product-step="${step}"]`);
    if (!section) return true;
    const controls = Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    const invalid = controls.find((control) => !control.checkValidity());
    if (!invalid) return true;
    invalid.reportValidity();
    return false;
  };

  const moveTo = (next: FormTab) => {
    if (!validateStep(formTab)) return;
    setFormTab(next);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const orderedSteps: FormTab[] = ["basic", "inventory", "pricing"];
    for (const step of orderedSteps) {
      const section = formRef.current?.querySelector<HTMLElement>(`[data-product-step="${step}"]`);
      const invalid = section
        ? Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")).find((control) => !control.checkValidity())
        : undefined;
      if (invalid) {
        event.preventDefault();
        setFormTab(step);
        window.setTimeout(() => invalid.reportValidity(), 0);
        return;
      }
    }
  };

  const tabs: Array<{ id: FormTab; label: string }> = [
    { id: "basic", label: "Basic Info" },
    { id: "inventory", label: "Inventory" },
    { id: "pricing", label: "Pricing" },
  ];

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? "Edit Product" : "Add New Product"} eyebrow={isEdit ? "Catalogue Update" : "New Catalogue Item"} width={456}>
      <form ref={formRef} action={action} onSubmit={handleSubmit} className="flex min-h-full flex-col bg-white dark:bg-slate-950">
        {isEdit && product ? <input type="hidden" name="productId" value={product.id} /> : null}
        <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />

        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="grid grid-cols-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormTab(tab.id)}
                className={`relative h-12 text-[11px] font-black transition ${formTab === tab.id ? "text-slate-950 dark:text-white" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
              >
                {tab.label}
                {formTab === tab.id ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 px-5 py-5">
          <section data-product-step="basic" className={formTab === "basic" ? "space-y-4" : "hidden"}>
            <label className="block">
              <span className={compactLabelClass}>Product Name *</span>
              <input ref={nameRef} name="name" defaultValue={product?.name ?? ""} required maxLength={120} className={compactInputClass} placeholder="Enter product name" />
            </label>

            <div>
              <span className={compactLabelClass}>Product Code / SKU *</span>
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                <input ref={codeRef} name="code" defaultValue={product?.code ?? ""} required maxLength={60} className={compactInputClass} placeholder="e.g. LAM-ABC-001" />
                <button type="button" onClick={generateSku} className="h-10 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-blue-600 transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-blue-500/10">
                  Auto-generate
                </button>
              </div>
              <p className="mt-1.5 text-[9px] font-medium text-slate-400">Must be unique across all products.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={compactLabelClass}>Category *</span>
                <select ref={categoryRef} name="categoryId" defaultValue={product?.categoryId ?? ""} required className={compactInputClass}>
                  <option value="" disabled>Select Category</option>
                  {categories.filter((item) => item.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={compactLabelClass}>Brand / Company *</span>
                <select name="brandId" defaultValue={product?.brandId ?? ""} required className={compactInputClass}>
                  <option value="" disabled>Select Brand</option>
                  {brands.filter((item) => item.isActive).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={compactLabelClass}>Unit *</span>
                <select name="unit" defaultValue={product?.unit ?? "Sheets"} required className={compactInputClass}>
                  {["Sheets", "Pieces", "Boxes", "Rolls", "Meters", "Square Feet"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={compactLabelClass}>GST % *</span>
                <select name="gstRate" defaultValue={String(product?.gstRate ?? 18)} required className={compactInputClass}>
                  {[0, 5, 12, 18, 28].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className={compactLabelClass}>Description</span>
              <textarea name="description" defaultValue={product?.description ?? ""} maxLength={500} rows={3} className="min-h-[84px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="Enter product description..." />
            </label>

            <div>
              <span className={compactLabelClass}>Image</span>
              <label className="group relative flex min-h-[112px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-500/5">
                <input ref={imageInputRef} name="image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => handleImageChange(event.target.files?.[0])} />
                {imagePreview ? (
                  <div className="flex w-full items-center gap-4 text-left">
                    <span className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-700"><Image src={imagePreview} alt="Product preview" fill unoptimized sizes="96px" className="object-cover" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-slate-800 dark:text-white">{product?.imageFileName || "Selected product image"}</p>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">Click to replace. PNG, JPG or WEBP up to 5 MB.</p>
                      <button type="button" onClick={(event) => { event.preventDefault(); setImagePreview(null); setRemoveImage(true); if (imageInputRef.current) imageInputRef.current.value = ""; }} className="mt-2 text-[10px] font-black text-rose-600 hover:text-rose-700">Remove image</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"><Icon name="upload" className="h-5 w-5" /></span>
                    <p className="mt-2.5 text-xs font-black text-slate-700 dark:text-slate-200">Upload Product Image</p>
                    <p className="mt-1 text-[9px] text-slate-400">PNG, JPG or WEBP up to 5 MB</p>
                  </div>
                )}
              </label>
              {imageError ? <p className="mt-1.5 text-[10px] font-bold text-rose-600">{imageError}</p> : null}
            </div>
          </section>

          <section data-product-step="inventory" className={formTab === "inventory" ? "space-y-4" : "hidden"}>
            <label className="block">
              <span className={compactLabelClass}>Rack / Stack Location *</span>
              <input name="stack" defaultValue={product?.stack ?? ""} required maxLength={60} className={compactInputClass} placeholder="e.g. E-01" />
            </label>

            {!isEdit ? (
              <label className="block">
                <span className={compactLabelClass}>Opening Stock *</span>
                <input name="quantity" type="number" min="0" step="1" defaultValue="0" required className={compactInputClass} />
              </label>
            ) : (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                <p className="text-xs font-black text-blue-700 dark:text-blue-300">Current stock: {product?.quantity ?? 0} {product?.unit}</p>
                <p className="mt-1 text-[10px] leading-4 text-blue-600/80 dark:text-blue-300/70">Stock quantity is changed from Product Details so every movement remains controlled.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={compactLabelClass}>Minimum Stock *</span>
                <input name="minimumStock" type="number" min="0" step="1" defaultValue={product?.minimumStock ?? 0} required className={compactInputClass} />
              </label>
              <label className="block">
                <span className={compactLabelClass}>Maximum Stock *</span>
                <input name="maximumStock" type="number" min="1" step="1" defaultValue={product?.maximumStock ?? 100} required className={compactInputClass} />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"><Icon name="warning" className="h-4 w-4" /></span>
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white">Inventory rules</h3>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">Low stock triggers at minimum stock. Suggested reorder equals maximum stock minus current stock. Current stock can never be negative.</p>
                </div>
              </div>
            </div>
          </section>

          <section data-product-step="pricing" className={formTab === "pricing" ? "space-y-4" : "hidden"}>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
              <p className="text-xs font-black text-blue-700 dark:text-blue-300">Catalogue pricing</p>
              <p className="mt-1 text-[10px] leading-4 text-blue-600/80 dark:text-blue-300/70">Prices are optional. GST is configured in Basic Info and saved with this product.</p>
            </div>

            <label className="block">
              <span className={compactLabelClass}>Purchase Price</span>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">₹</span><input name="purchasePrice" type="number" min="0" step="0.01" defaultValue={product?.purchasePrice ?? ""} className={`${compactInputClass} pl-8`} placeholder="0.00" /></div>
            </label>

            <label className="block">
              <span className={compactLabelClass}>Standard Selling Price</span>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">₹</span><input name="sellingPrice" type="number" min="0" step="0.01" defaultValue={product?.sellingPrice ?? ""} className={`${compactInputClass} pl-8`} placeholder="0.00" /></div>
            </label>

            <label className="block">
              <span className={compactLabelClass}>Dealer Price</span>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">₹</span><input name="dealerPrice" type="number" min="0" step="0.01" defaultValue={product?.dealerPrice ?? ""} className={`${compactInputClass} pl-8`} placeholder="0.00" /></div>
            </label>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><Icon name="rupee" className="h-4 w-4" /></span>
                <div>
                  <p className="text-xs font-black text-slate-900 dark:text-white">Pricing remains independent from stock</p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">Updating price will not alter existing orders or historical quantities. Future billing can use these catalogue values.</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
          <button type="button" onClick={onClose} className="h-10 min-w-[90px] rounded-lg border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900">Cancel</button>
          <div className="flex items-center gap-2">
            {formTab !== "basic" ? <button type="button" onClick={() => setFormTab(formTab === "pricing" ? "inventory" : "basic")} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Back</button> : null}
            {formTab === "basic" ? (
              <button type="button" onClick={() => moveTo("inventory")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-5 text-xs font-black text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500">Next <Icon name="chevronRight" className="h-4 w-4" /></button>
            ) : formTab === "inventory" ? (
              <button type="button" onClick={() => moveTo("pricing")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-5 text-xs font-black text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500">Next <Icon name="chevronRight" className="h-4 w-4" /></button>
            ) : (
              <button className="h-10 rounded-lg bg-blue-600 px-5 text-xs font-black text-white transition hover:bg-blue-700">{isEdit ? "Save Changes" : "Create Product"}</button>
            )}
          </div>
        </footer>
      </form>
    </Drawer>
  );
}

function ProductDetailsDrawer({ open, onClose, product, detailsTab, setDetailsTab, onEdit }: { open: boolean; onClose: () => void; product: ProductRecord | null; detailsTab: DetailsTab; setDetailsTab: (tab: DetailsTab) => void; onEdit: () => void }) {
  if (!product) return null;
  const reorder = Math.max(product.maximumStock - product.quantity, 0);
  const detailTabs: Array<{ id: DetailsTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "stock", label: "Stock History" },
    { id: "usage", label: "Usage" },
    { id: "details", label: "Details" },
  ];

  return (
    <Drawer open={open} onClose={onClose} title="Product Details" eyebrow="Catalogue Record" width={456}>
      <div className="space-y-4 bg-white p-5 dark:bg-slate-950">
        <div className="flex items-start gap-3">
          <ProductSwatch product={product} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-black text-slate-950 dark:text-white">{product.name}</h2>
              <span className={`rounded-full px-2 py-1 text-[9px] font-black ${product.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{product.isActive ? "Active" : "Archived"}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{product.description || `${product.code} · ${product.brandName}`}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onEdit} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300">
            <Icon name="edit" className="h-3.5 w-3.5" />Edit
          </button>
          {product.isActive ? (
            <form action={archiveProductAction} onSubmit={(event) => { if (!window.confirm(`Archive ${product.name}? It will be hidden from new dealer orders.`)) event.preventDefault(); }}>
              <input type="hidden" name="productId" value={product.id} />
              <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-3 text-[10px] font-black text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20"><Icon name="archive" className="h-3.5 w-3.5" />Archive</button>
            </form>
          ) : (
            <form action={reactivateProductAction}>
              <input type="hidden" name="productId" value={product.id} />
              <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[10px] font-black text-white"><Icon name="rotate" className="h-3.5 w-3.5" />Reactivate</button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[["Current Stock", product.quantity], ["Min Stock", product.minimumStock], ["Max Stock", product.maximumStock]].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-lg font-black text-slate-950 dark:text-white">{value}</p>
              <p className="mt-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <StatusBadge product={product} />
          <p className="text-[10px] font-bold text-slate-500">Suggested reorder <strong className="text-amber-600">{product.quantity <= product.minimumStock ? reorder : 0}</strong></p>
        </div>

        <div className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-800">
          {detailTabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setDetailsTab(tab.id)} className={`relative h-10 whitespace-nowrap text-[9px] font-black ${detailsTab === tab.id ? "text-slate-950 dark:text-white" : "text-slate-400"}`}>
              {tab.label}
              {detailsTab === tab.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600" /> : null}
            </button>
          ))}
        </div>

        {detailsTab === "overview" ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-xs font-black text-slate-950 dark:text-white">Key Information</h3>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-4 text-[10px]">
                {[["Category", product.categoryName], ["Brand", product.brandName], ["Unit", product.unit], ["SKU", product.code], ["Stack", product.stack], ["GST", `${product.gstRate}%`]].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0">
                    <dt className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
                    <dd className="mt-1 truncate font-bold text-slate-700 dark:text-slate-200">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {product.isActive ? (
              <form action={updateStockAction} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-950 dark:text-white">Update Stock</h3>
                <input type="hidden" name="productId" value={product.id} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label><span className="mb-1 block text-[8px] font-black uppercase tracking-wider text-slate-400">Action</span><select name="movementType" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-950"><option value="ADD">Add Stock</option><option value="REDUCE">Reduce Stock</option></select></label>
                  <label><span className="mb-1 block text-[8px] font-black uppercase tracking-wider text-slate-400">Quantity</span><input name="quantityChange" type="number" min="1" step="1" required className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-950" /></label>
                </div>
                <button className="mt-3 h-9 w-full rounded-lg bg-blue-600 text-[10px] font-black text-white">Update Stock</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {detailsTab === "stock" ? (
          <div className="space-y-4">
            {product.recentPurchases.length ? (
              <section>
                <div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Supplier receipts</h3><span className="text-[9px] font-bold text-slate-400">{product.purchaseReceiptCount} total</span></div>
                <div className="mt-2 space-y-2">{product.recentPurchases.map((receipt) => (
                  <article key={receipt.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                    <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black text-slate-950 dark:text-white">{receipt.receiptNumber}</p><span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">+{receipt.acceptedQuantity} {product.unit}</span></div>
                    <p className="mt-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">{receipt.supplierName} · {receipt.requestNumber}</p>
                    <p className="mt-1 text-[9px] text-slate-400">Received {formatDateTime(receipt.receivedAt)}{receipt.unitCost === null ? "" : ` · ${formatCurrency(receipt.unitCost)} each`}{receipt.damagedQuantity + receipt.rejectedQuantity > 0 ? ` · ${receipt.damagedQuantity + receipt.rejectedQuantity} issue units` : ""}</p>
                  </article>
                ))}</div>
              </section>
            ) : null}
            {product.recentBlocks.length ? (
              <section>
                <div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Order reservations</h3><span className="text-[9px] font-bold text-slate-400">{product.blockCount} total</span></div>
                <div className="mt-2 space-y-2">{product.recentBlocks.map((block) => (
                  <article key={block.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black text-slate-950 dark:text-white">{block.orderNumber}</p><span className={`rounded-full px-2 py-1 text-[8px] font-black ${block.status === "ACTIVE" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>{block.status}</span></div>
                    <p className="mt-1.5 text-[10px] text-slate-500">{block.quantity} {product.unit} · {block.blockReason.replaceAll("_", " ")}</p>
                    <p className="mt-1.5 text-[9px] text-slate-400">Blocked {formatDateTime(block.blockedAt)}{block.releasedAt ? ` · Released ${formatDateTime(block.releasedAt)}` : ""}</p>
                  </article>
                ))}</div>
              </section>
            ) : null}
            {!product.recentPurchases.length && !product.recentBlocks.length ? <EmptyState title="No stock history" description="Supplier receipts and order reservations will appear here." /> : null}
          </div>
        ) : null}

        {detailsTab === "usage" ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-blue-50 p-5 text-center dark:bg-blue-500/10"><p className="text-3xl font-black text-blue-600 dark:text-blue-300">{product.usageCount}</p><p className="mt-1 text-[10px] font-bold text-blue-700/70 dark:text-blue-300/70">Historical order line items</p></div>
            <div className="rounded-xl border border-slate-200 p-4 text-[10px] leading-5 text-slate-500 dark:border-slate-700"><p className="font-black text-slate-950 dark:text-white">History remains preserved</p><p className="mt-1.5">Archiving never removes this product from existing orders, reports, delivery proofs or audit history.</p></div>
          </div>
        ) : null}

        {detailsTab === "details" ? (
          <div className="space-y-3">
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-xs font-black text-slate-950 dark:text-white">Pricing</h3>
              <dl className="mt-3 space-y-2 text-[10px]">
                {[["Purchase Price", formatCurrency(product.purchasePrice)], ["Selling Price", formatCurrency(product.sellingPrice)], ["Dealer Price", formatCurrency(product.dealerPrice)], ["GST Rate", `${product.gstRate}%`]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="font-black text-slate-800 dark:text-slate-200">{value}</dd></div>)}
              </dl>
            </section>
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="text-xs font-black text-slate-950 dark:text-white">Catalogue Record</h3><dl className="mt-3 space-y-2 text-[10px]"><div className="flex justify-between gap-4"><dt className="text-slate-500">Created</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{formatDate(product.createdAt)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Last Updated</dt><dd className="font-bold text-slate-700 dark:text-slate-200">{formatDate(product.updatedAt)}</dd></div>{product.archivedAt ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Archived</dt><dd className="text-right font-bold text-slate-700 dark:text-slate-200">{formatDate(product.archivedAt)}{product.archivedByName ? ` by ${product.archivedByName}` : ""}</dd></div> : null}</dl></section>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
