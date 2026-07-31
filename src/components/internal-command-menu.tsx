"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErpIcon, type ErpIconName } from "@/components/erp-icon";
import type { NavigationItem } from "@/lib/navigation";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getModuleGroup(item: NavigationItem) {
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
  if (
    item.href.includes("attendance") ||
    item.href.includes("payroll") ||
    item.href.includes("/hr") ||
    item.href.includes("/teams") ||
    item.href.includes("/tasks")
  ) {
    return "Workforce";
  }
  if (
    item.href.includes("inventory") ||
    item.href.includes("dispatch") ||
    item.href.includes("qc") ||
    item.href.includes("transport") ||
    item.href.includes("delivery") ||
    item.href.includes("collections") ||
    item.href.includes("field-location") ||
    item.href.includes("reorder")
  ) {
    return "Operations";
  }
  return "Administration";
}

function getModuleIcon(item: NavigationItem): ErpIconName {
  if (item.href.includes("inventory")) return "inventory";
  if (item.href.includes("order")) return "orders";
  if (item.href.includes("collection")) return "collection";
  if (item.href.includes("field-location")) return "delivery";
  if (item.href.includes("task")) return "tasks";
  if (item.href.includes("attendance") || item.href.includes("payroll")) {
    return "calendar";
  }
  if (item.href.includes("delivery") || item.href.includes("transport")) {
    return "delivery";
  }
  if (item.href.includes("qc")) return "quality";
  if (item.href.includes("alert")) return "alert";
  if (item.href.includes("team") || item.href.includes("user")) return "users";
  return "dashboard";
}

export function InternalCommandMenu({
  items,
  compact = false,
  enableShortcut = true,
}: {
  items: NavigationItem[];
  compact?: boolean;
  enableShortcut?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const filtered = queryWords.length
      ? items.filter((item) => {
          const searchableText = normalize(
            `${item.label} ${item.href.replaceAll("/", " ")} ${getModuleGroup(item)}`,
          );
          return queryWords.every((word) => searchableText.includes(word));
        })
      : items;

    return filtered.slice(0, 10);
  }, [items, query]);

  const openMenu = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        enableShortcut &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          openMenu();
        }
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [enableShortcut, open, openMenu]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function navigateTo(item: NavigationItem) {
    setOpen(false);
    router.push(item.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        className={`group flex items-center rounded-xl border border-slate-200 bg-slate-50 text-left font-medium text-slate-400 transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20 dark:hover:bg-slate-900 ${
          compact
            ? "h-10 w-10 justify-center"
            : "h-11 w-full max-w-[520px] gap-3 px-4 text-sm"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={compact ? "Open ERP command menu" : undefined}
      >
        <ErpIcon
          name="search"
          className="h-4.5 w-4.5 shrink-0 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-300"
        />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1 truncate">
              Search modules and commands
            </span>
            <span className="hidden items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] font-bold text-slate-400 sm:inline-flex dark:border-white/10 dark:bg-slate-950">
              Ctrl K
            </span>
          </>
        )}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[7vh] sm:px-4 sm:pt-[10vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ERP command menu"
            className="w-full max-w-[640px] overflow-hidden rounded-[24px] border border-white/20 bg-white shadow-[0_32px_100px_rgba(2,6,23,0.38)] ring-1 ring-slate-950/5 dark:border-white/10 dark:bg-slate-900 dark:ring-white/5"
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                  <ErpIcon name="search" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-black text-slate-950 dark:text-white">
                    Quick search
                  </p>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                    Jump to any module in your workspace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                aria-label="Close command menu"
              >
                <ErpIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-4 sm:px-6">
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-white/10 dark:bg-slate-950/70 dark:focus-within:border-blue-500/60 dark:focus-within:bg-slate-950">
                <ErpIcon name="search" className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((current) =>
                        Math.min(current + 1, Math.max(0, results.length - 1)),
                      );
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((current) => Math.max(0, current - 1));
                    }
                    if (event.key === "Enter" && results[activeIndex]) {
                      event.preventDefault();
                      navigateTo(results[activeIndex]);
                    }
                  }}
                  placeholder="Type a module, task or workflow..."
                  className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold text-slate-950 outline-none placeholder:font-medium placeholder:text-slate-400 dark:text-white"
                  role="combobox"
                  aria-label="Search authorized ERP modules"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls="erp-command-results"
                  aria-activedescendant={
                    results[activeIndex]
                      ? `erp-command-${activeIndex}`
                      : undefined
                  }
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveIndex(0);
                      inputRef.current?.focus();
                    }}
                    className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] font-bold text-slate-400 sm:inline-flex dark:border-white/10 dark:bg-slate-900">
                    ESC
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-slate-950/40">
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {query ? "Search results" : "Suggested destinations"}
                </p>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
                  {results.length} {results.length === 1 ? "result" : "results"}
                </span>
              </div>

              <div
                id="erp-command-results"
                role="listbox"
                className="max-h-[50vh] overflow-y-auto px-3 pb-3 sm:px-4"
              >
                {results.length === 0 ? (
                  <div className="mx-2 mb-2 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center dark:border-white/10 dark:bg-slate-900">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
                      <ErpIcon name="search" className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">
                      No module found
                    </p>
                    <p className="mx-auto mt-1 max-w-xs text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                      Try a shorter term such as orders, attendance, inventory or reports.
                    </p>
                  </div>
                ) : (
                  results.map((item, index) => {
                    const group = getModuleGroup(item);
                    const showGroup =
                      index === 0 || getModuleGroup(results[index - 1]) !== group;

                    return (
                      <div key={item.href}>
                        {showGroup ? (
                          <p className="px-3 pb-1.5 pt-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 first:pt-1">
                            {group}
                          </p>
                        ) : null}
                        <button
                          id={`erp-command-${index}`}
                          type="button"
                          role="option"
                          aria-selected={activeIndex === index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => navigateTo(item)}
                          className={`group/result flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                            activeIndex === index
                              ? "border-blue-200 bg-white text-blue-800 shadow-sm shadow-blue-100/70 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 dark:shadow-none"
                              : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-white dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5"
                          }`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                              activeIndex === index
                                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                                : "bg-slate-100 text-slate-500 group-hover/result:bg-blue-50 group-hover/result:text-blue-600 dark:bg-white/10 dark:text-slate-400 dark:group-hover/result:bg-blue-500/10 dark:group-hover/result:text-blue-300"
                            }`}
                          >
                            <ErpIcon name={getModuleIcon(item)} className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black">
                              {item.label}
                            </span>
                            <span className="mt-1 block truncate text-[11px] font-medium text-slate-400">
                              {group} · {item.href.replace("/internal/", "").replace("/account/", "").replaceAll("-", " ")}
                            </span>
                          </span>
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                              activeIndex === index
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                                : "text-slate-300 group-hover/result:bg-slate-100 group-hover/result:text-slate-600 dark:text-slate-600 dark:group-hover/result:bg-white/10 dark:group-hover/result:text-slate-300"
                            }`}
                          >
                            <ErpIcon name="chevron-right" className="h-4 w-4" />
                          </span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-[10px] font-bold text-slate-400 dark:border-white/10 dark:bg-slate-900 sm:px-6">
              <span>Only modules available to your role are shown</span>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono dark:border-white/10 dark:bg-white/5">↑↓</kbd>
                  Navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono dark:border-white/10 dark:bg-white/5">↵</kbd>
                  Open
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
