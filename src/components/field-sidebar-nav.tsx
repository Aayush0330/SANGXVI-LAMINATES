"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FieldNavigationIcon } from "@/components/field-navigation-icon";
import type { NavigationItem } from "@/lib/navigation";

const sectionOrder = ["Field Work", "Customers", "Workspace", "Workforce"] as const;

const itemOrder = [
  "/field/dashboard",
  "/field/deliveries",
  "/field/collections",
  "/field/visits",
  "/field/location",
  "/internal/dealers",
  "/internal/inquiries",
  "/account/tasks",
  "/account/attendance",
  "/account/attendance/payslips",
] as const;

function getSection(item: NavigationItem) {
  if (item.href.startsWith("/field/")) return "Field Work";
  if (
    item.href === "/internal/dealers" ||
    item.href === "/internal/inquiries"
  ) {
    return "Customers";
  }
  if (item.href === "/account/tasks") return "Workspace";
  return "Workforce";
}

function isActivePath(pathname: string, href: string) {
  if (href === "/account/attendance") {
    return (
      pathname === href ||
      pathname.startsWith("/account/attendance/advance") ||
      pathname.startsWith("/account/attendance/corrections") ||
      pathname.startsWith("/account/attendance/leave")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FieldSidebarNav({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const rankedItems = [...items].sort((left, right) => {
    const leftIndex = itemOrder.indexOf(
      left.href as (typeof itemOrder)[number],
    );
    const rightIndex = itemOrder.indexOf(
      right.href as (typeof itemOrder)[number],
    );
    const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return safeLeft - safeRight;
  });

  const sections = sectionOrder
    .map((heading) => ({
      heading,
      items: rankedItems.filter((item) => getSection(item) === heading),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <nav
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Field Portal navigation"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-5 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin]">
        <div className="space-y-6">
          {sections.map((section, sectionIndex) => (
            <section
              key={section.heading}
              className={
                sectionIndex === 0
                  ? ""
                  : "border-t border-slate-200 pt-5 dark:border-white/10"
              }
            >
              <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
                {section.heading}
              </p>
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
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
                          <FieldNavigationIcon href={item.href} />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`text-lg leading-none transition ${
                          active
                            ? "opacity-100"
                            : "-translate-x-0.5 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"
                        }`}
                      >
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </nav>
  );
}
