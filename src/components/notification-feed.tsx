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
      <div className="flex items-center justify-between gap-4 bg-white px-5 py-4 dark:bg-slate-950">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-xl font-black tracking-[-0.03em] text-[#20243a] dark:text-slate-50">
            Notifications
          </p>

          <label className="relative inline-flex items-center">
            <span className="sr-only">Filter notifications</span>
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as NotificationFilter)
              }
              className="cursor-pointer appearance-none bg-transparent py-1 pl-1 pr-7 text-lg font-bold tracking-[-0.03em] text-slate-400 outline-none transition hover:text-slate-600 focus:text-blue-600 dark:hover:text-slate-200 dark:focus:text-blue-300"
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute right-0 h-4 w-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </label>
        </div>

        {markAllControl}
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
