"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import type { NavigationItem } from "@/lib/navigation";

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
  }
  if (name === "products") {
    return <svg {...common}><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M4 12.5 12 17l8-4.5"/><path d="M4 17.5 12 22l8-4.5"/></svg>;
  }
  if (name === "order") {
    return <svg {...common}><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/><path d="M9 3V1m6 2V1"/></svg>;
  }
  if (name === "orders") {
    return <svg {...common}><path d="M6 4h13v16H6z"/><path d="M3 7h3m-3 5h3m-3 5h3"/><path d="M10 8h5m-5 4h5m-5 4h3"/></svg>;
  }
  if (name === "profile") {
    return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
  }
  if (name === "menu") {
    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
  }
  if (name === "arrow") {
    return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>;
}

function getIconName(href: string) {
  if (href.includes("dashboard")) return "dashboard";
  if (href.includes("products")) return "products";
  if (href.includes("place-order")) return "order";
  if (href.includes("orders")) return "orders";
  if (href.includes("profile")) return "profile";
  return "dashboard";
}

function getPageCopy(pathname: string) {
  if (pathname.startsWith("/dealer/products")) return { eyebrow: "Product Catalogue", title: "Browse Products" };
  if (pathname.startsWith("/dealer/place-order")) return { eyebrow: "Order Builder", title: "Create New Order" };
  if (pathname.startsWith("/dealer/orders")) return { eyebrow: "Order Tracking", title: "My Orders" };
  if (pathname.startsWith("/dealer/profile")) return { eyebrow: "Dealer Account", title: "My Profile" };
  return { eyebrow: "Dealer Overview", title: "Dashboard" };
}

export function DealerPortalShell({
  children,
  navigation,
  user,
  portalControl,
  headerActions,
}: {
  children: ReactNode;
  navigation: NavigationItem[];
  user: { name: string; email: string };
  portalControl?: ReactNode;
  headerActions?: ReactNode;
}) {
  const pathname = usePathname();
  const pageCopy = getPageCopy(pathname);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950 dark:bg-[#07101f] dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-slate-200/80 bg-white px-4 py-5 dark:border-white/10 dark:bg-[#0b1526] lg:flex lg:flex-col">
        <Link href="/dealer/dashboard" className="flex items-center gap-3 px-2">
          <BrandLogo className="h-11 w-11 rounded-2xl" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">Sanghvi ERP</p>
            <p className="mt-0.5 text-base font-black text-slate-950 dark:text-white">Dealer Hub</p>
          </div>
        </Link>

        <div className="mt-8 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Workspace</div>
        <nav className="mt-3 space-y-1.5">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/15" : "bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-white/5 dark:text-slate-400"}`}>
                  <Icon name={getIconName(item.href)} className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {active ? <Icon name="arrow" className="h-4 w-4 opacity-80" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white dark:bg-blue-600">{initials || "D"}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900 dark:text-white">{user.name}</p>
              <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1526]/90">
          <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dealer/dashboard" className="lg:hidden">
                <BrandLogo className="h-10 w-10 rounded-2xl" />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">{pageCopy.eyebrow}</p>
                <h1 className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white sm:text-xl">{pageCopy.title}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {portalControl}
              {headerActions}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 xl:px-8 xl:pt-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-[22px] border border-slate-200 bg-white/95 p-2 shadow-2xl shadow-slate-900/15 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1526]/95 lg:hidden">
        {navigation.slice(0, 5).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-black transition ${active ? "bg-blue-600 text-white" : "text-slate-500 dark:text-slate-400"}`}>
              <Icon name={getIconName(item.href)} className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label.replace("Browse ", "")}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
