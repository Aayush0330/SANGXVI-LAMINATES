"use client";

import { useState, type ReactNode } from "react";

type NotificationFilter = "all" | "unread" | "read";

type NotificationFeedItem = {
  id: string;
  isUnread: boolean;
  content: ReactNode;
};

const filterLabels: Record<NotificationFilter, string> = {
  all: "All",
  unread: "Unread",
  read: "Read",
};

function FilteredEmptyState({ filter }: { filter: NotificationFilter }) {
  const label = filterLabels[filter].toLowerCase();

  return (
    <div className="px-6 py-10 text-center">
      <p className="text-base font-black text-slate-800 dark:text-slate-100">
        No {label} notifications
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Choose another filter to view your notifications.
      </p>
    </div>
  );
}

export function NotificationFeed({
  items,
  allEmptyState,
  markAllControl,
  footerActions,
  readCount,
}: {
  items: NotificationFeedItem[];
  allEmptyState: ReactNode;
  markAllControl: ReactNode;
  footerActions: ReactNode;
  readCount: number;
}) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const visibleItems = items.filter((item) => {
    if (filter === "unread") {
      return item.isUnread;
    }

    if (filter === "read") {
      return !item.isUnread;
    }

    return true;
  });

  return (
    <div className="max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-white/10 dark:bg-slate-950 dark:shadow-black/40">
      <div className="border-b border-slate-100 bg-white px-5 pb-3 pt-4 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xl font-black tracking-[-0.03em] text-[#20243a] dark:text-slate-50">
            Notifications
          </p>

          {markAllControl}
        </div>

        <div
          role="group"
          aria-label="Filter notifications"
          className="mt-3 grid grid-cols-3 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]"
        >
          {(Object.keys(filterLabels) as NotificationFilter[]).map(
            (filterOption) => {
              const isActive = filter === filterOption;

              return (
                <button
                  key={filterOption}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setFilter(filterOption)}
                  className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                    isActive
                      ? "bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-300"
                      : "text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
                  }`}
                >
                  {filterLabels[filterOption]}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="max-h-[26rem] overflow-y-auto bg-white dark:bg-slate-950">
        {visibleItems.length > 0
          ? visibleItems.map((item) => (
              <div key={item.id}>{item.content}</div>
            ))
          : filter === "all"
            ? allEmptyState
            : <FilteredEmptyState filter={filter} />}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            Showing {visibleItems.length} {filterLabels[filter].toLowerCase()}.{" "}
            {readCount} read saved.
          </p>

          {footerActions}
        </div>
      </div>
    </div>
  );
}
