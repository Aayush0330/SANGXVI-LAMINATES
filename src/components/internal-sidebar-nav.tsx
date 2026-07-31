"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { NavigationItem } from "@/lib/navigation";

type SidebarSection = {
  heading: string;
  items: NavigationItem[];
};

function NavIcon({ label }: { label: string }) {
  const normalized = label.toLowerCase();

  if (normalized.includes("dashboard")) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
      </svg>
    );
  }

  if (normalized.includes("order") || normalized.includes("dispatch")) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M6 7h13l-1.3 7.2a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7L5 4H2" />
        <path d="M9 20h.01M17 20h.01" />
      </svg>
    );
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("product") ||
    normalized.includes("stock")
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="m12 3 8 4-8 4-8-4 8-4Z" />
        <path d="m4 11 8 4 8-4M4 15l8 4 8-4" />
      </svg>
    );
  }

  if (normalized.includes("attendance")) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
        <path d="m8 14 2 2 5-5" />
      </svg>
    );
  }

  if (normalized.includes("payroll") || normalized.includes("payslip")) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 3h9l3 3v15H6V3Z" />
        <path d="M15 3v4h4M9 11h6M9 15h6M9 18h4" />
      </svg>
    );
  }

  if (normalized.includes("collection")) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      </svg>
    );
  }

  if (normalized.includes("task") || normalized.includes("qc")) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
      </svg>
    );
  }

  if (normalized.includes("user") || normalized.includes("team") || normalized.includes("hr")) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <path d="M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </svg>
    );
  }

  if (normalized.includes("report")) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
        <path d="M14 3v6h6M8 14h8M8 17h5" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function isActivePath(pathname: string, href: string) {
  if (
    [
      "/internal/inventory",
      "/account/attendance",
      "/account/attendance/payslips",
      "/internal/hr",
      "/internal/hr/reports",
      "/internal/attendance",
      "/internal/attendance/summary",
      "/internal/attendance/payroll",
      "/internal/hr",
      "/internal/users",
    ].includes(href)
  ) {
    return pathname === href;
  }

  if (href === "/internal/attendance/payroll/payslips") {
    return (
      pathname === href ||
      pathname.startsWith("/internal/attendance/payroll/payslip/")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getSidebarHeading(item: NavigationItem, financeMode: boolean) {
  if (
    [
      "/internal/dashboard",
      "/internal/orders",
      "/account/tasks",
      "/internal/inquiries",
    ].includes(item.href)
  ) {
    return "Main";
  }

  if (financeMode) {
    if (
      [
        "/account/attendance",
        "/account/attendance/payslips",
        "/internal/hr",
        "/internal/hr/reports",
        "/internal/attendance/summary",
        "/internal/attendance/payroll",
        "/internal/attendance/payroll/payslips",
      ].includes(item.href)
    ) {
      return "Workforce";
    }

    if (["/internal/collections", "/internal/reports"].includes(item.href)) {
      return "Finance";
    }
  }

  if (
    [
      "/account/attendance",
      "/account/attendance/payslips",
      "/internal/hr",
      "/internal/hr/reports",
      "/internal/attendance",
      "/internal/attendance/summary",
      "/internal/attendance/payroll",
      "/internal/attendance/payroll/payslips",
      "/internal/attendance/settings",
      "/internal/teams",
      "/internal/tasks",
    ].includes(item.href)
  ) {
    return "Workforce";
  }

  if (
    [
      "/internal/inventory",
      "/internal/inventory/insights",
      "/internal/inventory/calendar",
      "/internal/order-receiving",
      "/internal/dispatch",
      "/internal/transport",
      "/internal/delivery-proofs",
      "/internal/collections",
      "/internal/field-visits",
      "/internal/field-locations",
      "/internal/qc",
    ].includes(item.href)
  ) {
    return "Operations";
  }

  return "Administration";
}

function getSidebarLabel(item: NavigationItem, financeMode: boolean) {
  switch (item.href) {
    case "/internal/orders":
      return "Orders";
    case "/internal/attendance/summary":
      return "Attendance Summary";
    case "/internal/attendance/payroll/payslips":
      return "Payslips";
    case "/internal/attendance/settings":
      return "Office Settings";
    case "/internal/inventory/calendar":
      return "Stock Calendar";
    case "/internal/order-receiving":
      return "Order Receiving";
    case "/internal/dispatch":
      return "Physical Checks";
    case "/internal/field-visits":
      return "Field Reports";
    case "/internal/field-locations":
      return "Live Locations";
    case "/internal/qc":
      return "QC & Delivery";
    case "/internal/users/dealer-members":
      return "Dealer Access";
    case "/internal/security":
      return "Security Audit";
    case "/internal/backups":
      return "System Backups";
    case "/internal/reports":
      return financeMode ? "Financial Reports" : "Reports";
    default:
      return item.label;
  }
}

export function InternalSidebarNav({
  items,
  financeMode = false,
}: {
  items: NavigationItem[];
  financeMode?: boolean;
}) {
  const pathname = usePathname();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLAnchorElement>(null);
  const sections = items.reduce<SidebarSection[]>((accumulator, item) => {
    const heading = getSidebarHeading(item, financeMode);
    const existingSection = accumulator.find(
      (section) => section.heading === heading,
    );

    if (existingSection) {
      existingSection.items.push(item);
      return accumulator;
    }

    accumulator.push({ heading, items: [item] });
    return accumulator;
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const activeItem = activeItemRef.current;

    if (!scrollContainer || !activeItem) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const itemIsVisible =
      itemRect.top >= containerRect.top && itemRect.bottom <= containerRect.bottom;

    if (itemIsVisible) return;

    const centeredScrollTop =
      scrollContainer.scrollTop +
      itemRect.top -
      containerRect.top -
      (scrollContainer.clientHeight - activeItem.offsetHeight) / 2;

    scrollContainer.scrollTo({
      top: Math.max(0, centeredScrollTop),
      behavior: "smooth",
    });
  }, [pathname]);

  function renderItem(item: NavigationItem) {
    const active = isActivePath(pathname, item.href);
    const displayLabel = getSidebarLabel(item, financeMode);

    return (
      <Link
        key={item.href}
        ref={active ? activeItemRef : undefined}
        href={item.href}
        title={displayLabel}
        aria-current={active ? "page" : undefined}
        className={`group flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          active
            ? "bg-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)]"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white"
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
              active
                ? "bg-white/15 text-white"
                : "text-slate-400 group-hover:bg-white group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:bg-white/5 dark:group-hover:text-slate-200"
            }`}
          >
            <NavIcon label={item.label} />
          </span>
          <span className="truncate">{displayLabel}</span>
        </span>

        <span
          className={`text-lg leading-none transition ${
            active
              ? "opacity-100"
              : "translate-x-[-2px] opacity-0 group-hover:translate-x-0 group-hover:opacity-60"
          }`}
          aria-hidden="true"
        >
          ›
        </span>
      </Link>
    );
  }

  return (
    <nav
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Internal ERP navigation"
    >
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-5 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin]"
      >
        <div className="space-y-6">
          {sections.map((section, index) => (
            <div
              key={section.heading}
              className={
                index === 0
                  ? ""
                  : "border-t border-slate-200 pt-5 dark:border-white/10"
              }
            >
              <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
                {section.heading}
              </p>
              <div className="space-y-1.5">
                {section.items.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
