function getOrderStatusLabel(status: string | null) {
  if (!status) return "Start";

  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTimelineDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type TimelineItem = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  title: string;
  description: string | null;
  changedByName: string;
  changedByRole: string;
  createdAt: Date;
};

function TimelineRows({
  items,
  isLight,
}: {
  items: TimelineItem[];
  isLight: boolean;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-3 w-3 rounded-full ring-4 ${
                  isLast
                    ? isLight
                      ? "bg-cyan-500 ring-cyan-100"
                      : "bg-cyan-300 ring-cyan-300/10"
                    : isLight
                    ? "bg-slate-400 ring-slate-100"
                    : "bg-slate-500 ring-white/5"
                }`}
              />

              {!isLast ? (
                <span
                  className={`mt-2 h-full w-px flex-1 ${
                    isLight ? "bg-slate-300" : "bg-white/10"
                  }`}
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className={`text-sm font-extrabold ${
                    isLight ? "text-slate-950" : "text-white"
                  }`}
                >
                  {item.title}
                </p>

                <p
                  className={`text-[11px] font-bold ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {formatTimelineDate(item.createdAt)}
                </p>
              </div>

              <p
                className={`mt-1 text-xs font-semibold ${
                  isLight ? "text-slate-600" : "text-slate-300"
                }`}
              >
                {getOrderStatusLabel(item.fromStatus)} →{" "}
                {getOrderStatusLabel(item.toStatus)}
              </p>

              {item.description ? (
                <p
                  className={`mt-2 text-xs leading-5 ${
                    isLight ? "text-slate-700" : "text-slate-300"
                  }`}
                >
                  {item.description}
                </p>
              ) : null}

              <p
                className={`mt-2 text-[11px] font-medium ${
                  isLight ? "text-slate-500" : "text-slate-500"
                }`}
              >
                Updated by {item.changedByName} · {item.changedByRole}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OrderStatusTimeline({
  history,
  theme = "dark",
  visibleCount = 4,
}: {
  history: TimelineItem[];
  theme?: "dark" | "light";
  visibleCount?: number;
}) {
  const isLight = theme === "light";

  if (history.length === 0) {
    return (
      <div
        className={`mt-5 rounded-2xl border px-4 py-3 text-xs font-semibold ${
          isLight
            ? "border-slate-200 bg-slate-50 text-slate-700"
            : "border-white/10 bg-white/[0.04] text-slate-400"
        }`}
      >
        Status timeline will appear here for new order updates.
      </div>
    );
  }

  const safeVisibleCount = Math.max(1, visibleCount);
  const latestItems = history.slice(-safeVisibleCount);
  const olderItems = history.slice(0, Math.max(0, history.length - safeVisibleCount));
  const latestItem = history[history.length - 1];

  return (
    <div
      className={`mt-5 rounded-2xl border p-4 sm:p-5 ${
        isLight
          ? "border-slate-200 bg-slate-50 text-slate-950"
          : "border-white/10 bg-white/[0.04] text-white"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4
            className={`text-sm font-extrabold ${
              isLight ? "text-slate-950" : "text-white"
            }`}
          >
            Status Timeline
          </h4>

          <p
            className={`mt-1 text-xs font-semibold ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Latest: {latestItem.title}
          </p>
        </div>

        <span
          className={`w-fit rounded-full px-3 py-1 text-[11px] font-extrabold ${
            isLight
              ? "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200"
              : "bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-300/20"
          }`}
        >
          {history.length} updates
        </span>
      </div>

      {olderItems.length > 0 ? (
        <details className="group mt-4">
          <summary
            className={`flex cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold transition ${
              isLight
                ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
            }`}
          >
            <span>Show older updates ({olderItems.length})</span>

            <span className="transition group-open:rotate-180">⌄</span>
          </summary>

          <div
            className={`mt-4 max-h-[360px] overflow-y-auto rounded-2xl border p-4 ${
              isLight
                ? "border-slate-200 bg-white"
                : "border-white/10 bg-slate-950/30"
            }`}
          >
            <TimelineRows items={olderItems} isLight={isLight} />
          </div>
        </details>
      ) : null}

      <div className="mt-5">
        <TimelineRows items={latestItems} isLight={isLight} />
      </div>
    </div>
  );
}
