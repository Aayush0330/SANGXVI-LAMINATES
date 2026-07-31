import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { AccountantFinanceDashboard } from "@/components/accountant-finance-dashboard";
import { ErpIcon, type ErpIconName } from "@/components/erp-icon";
import { checkPermission } from "@/lib/auth-guards";
import {
  calculatePercentageChange,
  DASHBOARD_RANGE_OPTIONS,
  formatIndiaDateInput,
  formatStageAge,
  getGreeting,
  parseDashboardRange,
  type WorkflowStageId,
} from "@/lib/dashboard-insights";
import {
  getInternalDashboardSnapshot,
  type DashboardActionItem,
  type DashboardRecentOrder,
  type DashboardStockRisk,
  type InternalDashboardSnapshot,
} from "@/lib/internal-dashboard-data";
import {
  getPortalLandingLabel,
  getPortalLandingPath,
  type AppUser,
} from "@/lib/current-user";
import {
  getLightOrderStatusClass,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";
import { hasPermission, roleLabels } from "@/lib/permissions";

type PageSearchParams = {
  range?: string | string[];
};

type MetricTone = "blue" | "emerald" | "amber" | "rose" | "violet";

type DashboardMetric = {
  label: string;
  value: string;
  helper: string;
  eyebrow: string;
  href: string;
  icon: ErpIconName;
  tone: MetricTone;
  change?: {
    label: string;
    direction: "up" | "down" | "flat" | "new";
  };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: value >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(Math.round(value));
}

function formatFullCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatShortDate(value: Date | null) {
  if (!value) return "No required date";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function formatRelativeTime(value: Date, now: Date) {
  const elapsed = Math.max(0, now.getTime() - value.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function createChange(currentValue: number, previousValue: number) {
  const percentage = calculatePercentageChange(currentValue, previousValue);

  if (percentage === null) {
    return { label: "New activity", direction: "new" as const };
  }

  if (Math.abs(percentage) < 0.05) {
    return { label: "No change", direction: "flat" as const };
  }

  return {
    label: `${Math.abs(percentage).toFixed(0)}% vs previous`,
    direction: percentage > 0 ? ("up" as const) : ("down" as const),
  };
}

function countStatuses(
  statusCounts: Record<string, number>,
  statuses: readonly string[],
) {
  return statuses.reduce(
    (total, status) => total + (statusCounts[status] ?? 0),
    0,
  );
}

function getWorkflowHref(
  stageId: WorkflowStageId,
  currentUser: AppUser,
) {
  const destinationByStage: Record<
    WorkflowStageId,
    { href: string; permission: Parameters<typeof hasPermission>[1] }
  > = {
    receiving: {
      href: "/internal/order-receiving",
      permission: "manage_order_receiving",
    },
    physical: {
      href: "/internal/dispatch",
      permission: "manage_dispatch",
    },
    stock: {
      href: "/internal/inventory",
      permission: "manage_inventory",
    },
    quality: {
      href: "/internal/qc",
      permission: "manage_qc",
    },
    dispatch: {
      href: "/internal/qc",
      permission: "manage_qc",
    },
    delivery: {
      href: "/internal/delivery-proofs",
      permission: "manage_delivery_proofs",
    },
  };
  const destination = destinationByStage[stageId];

  return hasPermission(currentUser.roles, destination.permission)
    ? destination.href
    : "/internal/orders";
}

function getDashboardMetrics(
  snapshot: InternalDashboardSnapshot,
  currentUser: AppUser,
): DashboardMetric[] {
  const { summary, statusCounts, rangeDays } = snapshot;
  const isSupervisor = currentUser.roles.some((role) =>
    ["owner", "manager"].includes(role),
  );

  if (isSupervisor) {
    return [
      {
        label: "Order Value",
        value: formatCurrency(summary.periodOrderValue),
        helper: `${summary.periodOrderCount.toLocaleString("en-IN")} orders created`,
        eyebrow: `Last ${rangeDays} days`,
        href: `/internal/orders?from=${formatIndiaDateInput(snapshot.rangeStart)}`,
        icon: "revenue",
        tone: "blue",
        change: createChange(
          summary.periodOrderValue,
          summary.previousOrderValue,
        ),
      },
      {
        label: "Open Orders",
        value: summary.openOrderCount.toLocaleString("en-IN"),
        helper:
          summary.pastRequiredDateCount > 0
            ? `${summary.pastRequiredDateCount} past required date`
            : `${summary.deliveredInPeriodCount} delivered in period`,
        eyebrow: "Live workload",
        href: "/internal/orders",
        icon: "orders",
        tone: summary.pastRequiredDateCount > 0 ? "amber" : "violet",
      },
      {
        label: "Stock at Risk",
        value: summary.riskProductCount.toLocaleString("en-IN"),
        helper: `${summary.blockedUnits.toLocaleString("en-IN")} units currently blocked`,
        eyebrow: `${summary.activeProductCount} active products`,
        href: "/internal/inventory",
        icon: "inventory",
        tone: summary.riskProductCount > 0 ? "rose" : "emerald",
      },
      {
        label: "Collections Outstanding",
        value: formatCurrency(summary.outstandingCollectionAmount),
        helper:
          summary.overdueCollectionAmount > 0
            ? `${formatCurrency(summary.overdueCollectionAmount)} overdue`
            : "No overdue collections",
        eyebrow: `${summary.openCollectionCount} open collections`,
        href: "/internal/collections",
        icon: "collection",
        tone: summary.overdueCollectionCount > 0 ? "rose" : "emerald",
      },
    ];
  }

  if (currentUser.roles.includes("qc_team")) {
    return [
      {
        label: "Awaiting QC",
        value: (statusCounts.PENDING_QC ?? 0).toLocaleString("en-IN"),
        helper: "Ready for quality review",
        eyebrow: "Current queue",
        href: "/internal/qc",
        icon: "quality",
        tone: "violet",
      },
      {
        label: "QC Rework",
        value: (statusCounts.QC_REWORK ?? 0).toLocaleString("en-IN"),
        helper: "Orders requiring another check",
        eyebrow: "Exceptions",
        href: "/internal/qc",
        icon: "alert",
        tone: (statusCounts.QC_REWORK ?? 0) > 0 ? "rose" : "emerald",
      },
      {
        label: "Ready for Dispatch",
        value: countStatuses(statusCounts, [
          "QC_APPROVED",
          "READY_FOR_DISPATCH",
        ]).toLocaleString("en-IN"),
        helper: "Approved and ready for transport",
        eyebrow: "Next action",
        href: "/internal/qc",
        icon: "delivery",
        tone: "blue",
      },
      {
        label: "In Transit",
        value: (statusCounts.ON_THE_WAY ?? 0).toLocaleString("en-IN"),
        helper: `${snapshot.summary.deliveredInPeriodCount} delivered in period`,
        eyebrow: `Last ${rangeDays} days`,
        href: "/internal/orders?status=ON_THE_WAY",
        icon: "activity",
        tone: "emerald",
      },
    ];
  }

  if (currentUser.roles.includes("dispatch_team")) {
    return [
      {
        label: "Physical Queue",
        value: countStatuses(statusCounts, [
          "PHYSICAL_CHECK_ASSIGNED",
          "PHYSICAL_CHECK_IN_PROGRESS",
          "PHYSICAL_CHECK_ISSUE",
        ]).toLocaleString("en-IN"),
        helper: "Assigned or in progress",
        eyebrow: "Current workload",
        href: "/internal/dispatch",
        icon: "inventory",
        tone: "blue",
      },
      {
        label: "Blocked Checks",
        value: countStatuses(statusCounts, [
          "PHYSICAL_CHECK_ISSUE",
          "BACKORDERED",
        ]).toLocaleString("en-IN"),
        helper: "Physical or stock issues",
        eyebrow: "Needs attention",
        href: "/internal/dispatch",
        icon: "alert",
        tone:
          countStatuses(statusCounts, [
            "PHYSICAL_CHECK_ISSUE",
            "BACKORDERED",
          ]) > 0
            ? "rose"
            : "emerald",
      },
      {
        label: "Overdue Tasks",
        value: snapshot.summary.overdueTaskCount.toLocaleString("en-IN"),
        helper: `${snapshot.summary.openTaskCount} open tasks`,
        eyebrow: "My workload",
        href: "/account/tasks",
        icon: "tasks",
        tone: snapshot.summary.overdueTaskCount > 0 ? "amber" : "emerald",
      },
      {
        label: "Delivered",
        value: snapshot.summary.deliveredInPeriodCount.toLocaleString("en-IN"),
        helper: `${snapshot.summary.periodOrderCount} orders created`,
        eyebrow: `Last ${rangeDays} days`,
        href: "/internal/orders?status=DELIVERED",
        icon: "delivery",
        tone: "emerald",
      },
    ];
  }

  return [
    {
      label: "New Orders",
      value: (statusCounts.NEW_ORDER ?? 0).toLocaleString("en-IN"),
      helper: "Waiting to be received",
      eyebrow: "Current queue",
      href: "/internal/order-receiving",
      icon: "orders",
      tone: "blue",
    },
    {
      label: "Team Assignment",
      value: (statusCounts.PENDING_TEAM_ASSIGNMENT ?? 0).toLocaleString(
        "en-IN",
      ),
      helper: "Orders waiting for a physical team",
      eyebrow: "Next action",
      href: "/internal/order-receiving",
      icon: "users",
      tone: "violet",
    },
    {
      label: "High Priority",
      value: snapshot.summary.highPriorityOpenCount.toLocaleString("en-IN"),
      helper: "Open high-priority orders",
      eyebrow: "Priority queue",
      href: "/internal/orders",
      icon: "alert",
      tone:
        snapshot.summary.highPriorityOpenCount > 0 ? "amber" : "emerald",
    },
    {
      label: "Past Required Date",
      value: snapshot.summary.pastRequiredDateCount.toLocaleString("en-IN"),
      helper: `${snapshot.summary.openOrderCount} open orders`,
      eyebrow: "Delivery commitment",
      href: "/internal/orders",
      icon: "calendar",
      tone:
        snapshot.summary.pastRequiredDateCount > 0 ? "rose" : "emerald",
    },
  ];
}

function metricToneClasses(tone: MetricTone) {
  if (tone === "emerald") {
    return {
      icon: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
      line: "bg-emerald-500",
    };
  }
  if (tone === "amber") {
    return {
      icon: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
      line: "bg-amber-500",
    };
  }
  if (tone === "rose") {
    return {
      icon: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
      line: "bg-rose-500",
    };
  }
  if (tone === "violet") {
    return {
      icon: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
      line: "bg-violet-500",
    };
  }
  return {
    icon: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
    line: "bg-blue-600",
  };
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const tone = metricToneClasses(metric.tone);

  return (
    <Link
      href={metric.href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20 dark:hover:shadow-black/20"
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${tone.line}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            {metric.eyebrow}
          </p>
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            {metric.label}
          </p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}
        >
          <ErpIcon name={metric.icon} />
        </span>
      </div>

      <p className="mt-5 text-[2rem] font-black leading-none tracking-[-0.04em] text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">
        {metric.value}
      </p>

      <div className="mt-4 flex min-h-5 items-center justify-between gap-3">
        <p className="line-clamp-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          {metric.helper}
        </p>
        {metric.change ? (
          <span
            className={`shrink-0 text-[11px] font-bold ${
              metric.change.direction === "up"
                ? "text-emerald-700 dark:text-emerald-300"
                : metric.change.direction === "down"
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {metric.change.direction === "up"
              ? "↑ "
              : metric.change.direction === "down"
                ? "↓ "
                : ""}
            {metric.change.label}
          </span>
        ) : (
          <ErpIcon
            name="chevron-right"
            className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-600"
          />
        )}
      </div>
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
            {eyebrow}
          </p>
        ) : null}
        <h2 className={`${eyebrow ? "mt-2" : ""} text-lg font-black tracking-tight text-slate-950 sm:text-xl dark:text-white`}>
          {title}
        </h2>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500 sm:text-sm dark:text-slate-400">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function ActionItem({
  item,
  now,
}: {
  item: DashboardActionItem;
  now: Date;
}) {
  const severity =
    item.severity === "critical"
      ? {
          label: "Critical",
          dot: "bg-rose-500",
          badge:
            "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20",
        }
      : item.severity === "warning"
        ? {
            label: "Warning",
            dot: "bg-amber-500",
            badge:
              "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
          }
        : {
            label: "Attention",
            dot: "bg-blue-500",
            badge:
              "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20",
          };

  return (
    <Link
      href={item.href}
      className="group grid gap-3 border-b border-slate-100 py-4 last:border-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center dark:border-white/10"
    >
      <span className={`hidden h-2.5 w-2.5 rounded-full sm:block ${severity.dot}`} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ring-1 ring-inset sm:hidden ${severity.badge}`}
          >
            {severity.label}
          </span>
          <p className="truncate text-sm font-bold text-slate-900 transition group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
            {item.title}
          </p>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
          {item.detail}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          {item.meta}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span
          className={`hidden rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ring-1 ring-inset sm:inline-flex ${severity.badge}`}
        >
          {severity.label}
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {formatRelativeTime(item.occurredAt, now)}
        </span>
        <ErpIcon
          name="chevron-right"
          className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-600"
        />
      </div>
    </Link>
  );
}

function StockRiskItem({ product }: { product: DashboardStockRisk }) {
  const threshold = Math.max(1, product.minimumStock);
  const percentage = Math.min(
    100,
    Math.max(0, Math.round((product.available / threshold) * 100)),
  );
  const isOut = product.available <= 0;

  return (
    <Link
      href="/internal/inventory"
      className="group block rounded-xl border border-slate-200/80 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/30 dark:border-white/10 dark:hover:border-blue-400/30 dark:hover:bg-blue-400/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
            {product.name}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
            {product.code} · {product.stack}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
            isOut
              ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
          }`}
        >
          {product.available} available
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${isOut ? "bg-rose-500" : "bg-amber-500"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-[10px] font-semibold text-slate-400">
        <span>Minimum {product.minimumStock}</span>
        <span>{product.blocked} blocked</span>
      </div>
    </Link>
  );
}

function QueueHealth({
  snapshot,
}: {
  snapshot: InternalDashboardSnapshot;
}) {
  const items = [
    {
      label: "Open orders",
      value: snapshot.summary.openOrderCount,
      helper: "Current active workload",
      href: "/internal/orders",
      tone: "bg-blue-500",
    },
    {
      label: "High priority",
      value: snapshot.summary.highPriorityOpenCount,
      helper: "Requires faster handling",
      href: "/internal/orders",
      tone: "bg-amber-500",
    },
    {
      label: "Past required date",
      value: snapshot.summary.pastRequiredDateCount,
      helper: "Delivery commitment at risk",
      href: "/internal/orders",
      tone: "bg-rose-500",
    },
    {
      label: "Overdue tasks",
      value: snapshot.summary.overdueTaskCount,
      helper: `${snapshot.summary.openTaskCount} tasks currently open`,
      href: "/account/tasks",
      tone: "bg-violet-500",
    },
  ];

  return (
    <div className="mt-5 space-y-2.5">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200/80 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/30 dark:border-white/10 dark:hover:border-blue-400/30 dark:hover:bg-blue-400/5"
        >
          <span className={`h-8 w-1 rounded-full ${item.tone}`} />
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-800 group-hover:text-blue-700 dark:text-slate-200 dark:group-hover:text-blue-300">
              {item.label}
            </span>
            <span className="mt-1 block truncate text-[10px] font-semibold text-slate-400">
              {item.helper}
            </span>
          </span>
          <span className="text-xl font-black text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">
            {item.value.toLocaleString("en-IN")}
          </span>
        </Link>
      ))}
    </div>
  );
}

function RecentOrderRow({
  order,
  now,
}: {
  order: DashboardRecentOrder;
  now: Date;
}) {
  const isPastRequiredDate = Boolean(
    order.requiredBy &&
      order.requiredBy < now &&
      !["DELIVERED", "INVOICE_UPLOADED", "CANCELLED"].includes(order.status),
  );

  return (
    <Link
      href={order.href}
      className="group grid gap-3 border-b border-slate-100 px-1 py-4 last:border-0 sm:grid-cols-[minmax(180px,1fr)_150px_190px] sm:items-center dark:border-white/10"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-bold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
            {order.orderNumber}
          </p>
          {order.priority !== "NORMAL" ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
              {order.priority}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
          {order.dealerName}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
          {order.productSummary}
        </p>
      </div>

      <div>
        <p className="text-sm font-black text-slate-900 [font-variant-numeric:tabular-nums] dark:text-white">
          {formatFullCurrency(order.totalValue)}
        </p>
        <p
          className={`mt-1 text-[10px] font-semibold ${
            isPastRequiredDate
              ? "text-rose-600 dark:text-rose-300"
              : "text-slate-400"
          }`}
        >
          {order.requiredBy
            ? `Required ${formatShortDate(order.requiredBy)}`
            : "Required date not set"}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_16px] items-center gap-3">
        <span
          className={`justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black ${getLightOrderStatusClass(order.status)}`}
        >
          {getOrderStatusLabel(order.status)}
        </span>
        <ErpIcon
          name="chevron-right"
          className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-600"
        />
      </div>
    </Link>
  );
}

export default async function InternalDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const { hasAccess, currentUser } = await checkPermission(
    "view_internal_dashboard",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Dashboard Access Denied"
        description="Your current role does not have permission to access the Internal ERP dashboard."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const isAccountantFocused =
    currentUser.roles.includes("accountant") &&
    !currentUser.roles.some((role) =>
      ["owner", "manager", "dispatch_team", "order_team", "qc_team"].includes(
        role,
      ),
    );

  if (isAccountantFocused) {
    return <AccountantFinanceDashboard currentUser={currentUser} />;
  }

  const params = (await searchParams) ?? {};
  const rangeDays = parseDashboardRange(params.range);
  const snapshot = await getInternalDashboardSnapshot({
    currentUser,
    rangeDays,
  });
  const metrics = getDashboardMetrics(snapshot, currentUser);
  const workflowMax = Math.max(
    1,
    ...snapshot.workflow.map((stage) => stage.count),
  );
  const trendMax = Math.max(
    1,
    ...snapshot.trend.map((point) =>
      snapshot.summary.periodOrderValue > 0
        ? point.orderValue
        : point.orderCount,
    ),
  );
  const firstName = currentUser.name.split(/\s+/)[0] || currentUser.name;
  const canManageInventory = hasPermission(
    currentUser.roles,
    "manage_inventory",
  );

  const quickActions: Array<{
    label: string;
    href: string;
    primary?: boolean;
  }> = [];

  if (hasPermission(currentUser.roles, "manage_inventory_inquiries")) {
    quickActions.push({
      label: "New Inquiry",
      href: "/internal/inquiries",
      primary: true,
    });
  }
  if (hasPermission(currentUser.roles, "view_order_journey")) {
    quickActions.push({
      label: "View Orders",
      href: "/internal/orders",
      primary: quickActions.length === 0,
    });
  }
  if (
    quickActions.length < 2 &&
    hasPermission(currentUser.roles, "manage_inventory")
  ) {
    quickActions.push({
      label: "Open Inventory",
      href: "/internal/inventory",
      primary: quickActions.length === 0,
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-950 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:shadow-none">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Operational data
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {roleLabels[currentUser.role]}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-[-0.035em] sm:text-3xl">
              {getGreeting(snapshot.generatedAt)}, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
              Here is the operational picture across orders, stock, collections
              and team workload.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <ErpIcon name="calendar" className="h-4 w-4" />
                {formatDate(snapshot.generatedAt)}
              </span>
              <span className="inline-flex items-center gap-2">
                <ErpIcon name="activity" className="h-4 w-4" />
                Updated {formatDateTime(snapshot.generatedAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div
              className="inline-flex rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:ring-white/10"
              aria-label="Dashboard date range"
            >
              {DASHBOARD_RANGE_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={`/internal/dashboard?range=${option}`}
                  aria-current={rangeDays === option ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    rangeDays === option
                      ? "bg-white text-blue-700 shadow-sm dark:text-slate-950"
                      : "text-slate-500 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                  }`}
                >
                  {option}D
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.slice(0, 2).map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                    action.primary
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15"
                  }`}
                >
                  {action.primary ? (
                    <ErpIcon name="plus" className="h-4 w-4" />
                  ) : null}
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="Key performance indicators"
        className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
          <SectionHeading
            eyebrow="Priority queue"
            title="Action Center"
            description="The most urgent decisions and operational exceptions."
            action={
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {snapshot.actions.length} open
              </span>
            }
          />

          <div className="mt-3">
            {snapshot.actions.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-400/20 dark:bg-emerald-400/5">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <ErpIcon name="quality" />
                </span>
                <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                  No urgent actions
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Critical operational queues are currently clear.
                </p>
              </div>
            ) : (
              snapshot.actions.map((item) => (
                <ActionItem
                  key={item.id}
                  item={item}
                  now={snapshot.generatedAt}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
          <SectionHeading
            eyebrow="Order execution"
            title="Workflow Pipeline"
            description="Live order counts derived from the actual workflow status."
            action={
              <Link
                href="/internal/orders"
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-300"
              >
                View all
              </Link>
            }
          />

          <div className="mt-5 space-y-2">
            {snapshot.workflow.map((stage, index) => {
              const width =
                stage.count > 0
                  ? Math.max(8, Math.round((stage.count / workflowMax) * 100))
                  : 0;

              return (
                <Link
                  key={stage.id}
                  href={getWorkflowHref(stage.id, currentUser)}
                  className="group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-700 dark:bg-white/10 dark:text-slate-300 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-bold text-slate-800 group-hover:text-blue-700 dark:text-slate-200 dark:group-hover:text-blue-300">
                        {stage.label}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-400">
                        {formatStageAge(
                          stage.oldestAt,
                          snapshot.generatedAt,
                        )}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          stage.pastRequiredDateCount > 0
                            ? "bg-amber-500"
                            : "bg-blue-600"
                        }`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                  <div className="min-w-10 text-right">
                    <p className="text-base font-black text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">
                      {stage.count}
                    </p>
                    {stage.pastRequiredDateCount > 0 ? (
                      <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300">
                        {stage.pastRequiredDateCount} late
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
          <SectionHeading
            eyebrow="Business trend"
            title="Order Momentum"
            description={`Order value and volume across the last ${rangeDays} days.`}
            action={
              <div className="text-right">
                <p className="text-base font-black text-slate-950 dark:text-white">
                  {formatFullCurrency(snapshot.summary.periodOrderValue)}
                </p>
                <p className="text-[10px] font-semibold text-slate-400">
                  Total order value
                </p>
              </div>
            }
          />

          <div
            className="mt-7 grid h-56 items-end gap-2"
            style={{
              gridTemplateColumns: `repeat(${snapshot.trend.length}, minmax(0, 1fr))`,
            }}
            role="img"
            aria-label={`Order trend for the last ${rangeDays} days`}
          >
            {snapshot.trend.map((point) => {
              const scaleValue =
                snapshot.summary.periodOrderValue > 0
                  ? point.orderValue
                  : point.orderCount;
              const height =
                scaleValue > 0
                  ? Math.max(6, Math.round((scaleValue / trendMax) * 100))
                  : 2;

              return (
                <div
                  key={point.bucketIndex}
                  className="group flex h-full min-w-0 flex-col justify-end"
                  title={point.accessibleLabel}
                  aria-label={point.accessibleLabel}
                >
                  <div className="relative flex min-h-0 flex-1 items-end rounded-t-lg bg-slate-50 px-1 dark:bg-slate-950">
                    <div
                      className="w-full rounded-t-md bg-blue-500/80 transition group-hover:bg-blue-600 dark:bg-blue-400/70 dark:group-hover:bg-blue-300"
                      style={{ height: `${height}%` }}
                    />
                    <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-bold text-white shadow-lg group-hover:block dark:bg-white dark:text-slate-950">
                      {point.orderCount} orders
                    </span>
                  </div>
                  <p className="mt-2 truncate text-center text-[9px] font-semibold text-slate-400">
                    {point.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {canManageInventory ? (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
            <SectionHeading
              eyebrow="Inventory health"
              title="Stock Risk"
              description="Products with the largest availability gap."
              action={
                <Link
                  href="/internal/inventory"
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-300"
                >
                  Inventory
                </Link>
              }
            />

            <div className="mt-5 space-y-2.5">
              {snapshot.stockRisks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center text-xs font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/5 dark:text-emerald-300">
                  All active products are above minimum stock.
                </div>
              ) : (
                snapshot.stockRisks.slice(0, 4).map((product) => (
                  <StockRiskItem key={product.id} product={product} />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
            <SectionHeading
              eyebrow="Workload control"
              title="Queue Health"
              description="Operational pressure across orders and assigned work."
            />
            <QueueHealth snapshot={snapshot} />
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
          <SectionHeading
            eyebrow="Latest movement"
            title="Recent Orders"
            description="Latest updated orders with value, commitment and status."
            action={
              <Link
                href="/internal/orders"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-300"
              >
                All orders
                <ErpIcon name="chevron-right" className="h-3.5 w-3.5" />
              </Link>
            }
          />

          <div className="mt-3">
            {snapshot.recentOrders.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                No orders have been created yet.
              </div>
            ) : (
              snapshot.recentOrders.map((order) => (
                <RecentOrderRow
                  key={order.id}
                  order={order}
                  now={snapshot.generatedAt}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 dark:border-white/10 dark:bg-slate-900">
          <SectionHeading
            eyebrow="Audit trail"
            title="Order Activity"
            description="Real workflow events with actor and timestamp."
          />

          <div className="mt-5 space-y-1">
            {snapshot.activities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                No order activity has been recorded yet.
              </div>
            ) : (
              snapshot.activities.map((activity, index) => (
                <Link
                  key={activity.id}
                  href={activity.href}
                  className="group grid grid-cols-[20px_minmax(0,1fr)] gap-3 rounded-xl px-1 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50 dark:bg-blue-400 dark:ring-blue-400/10" />
                    {index < snapshot.activities.length - 1 ? (
                      <span className="mt-2 min-h-7 w-px flex-1 bg-slate-200 dark:bg-white/10" />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-xs font-bold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
                        {activity.title}
                      </p>
                      <span className="shrink-0 text-[9px] font-semibold text-slate-400">
                        {formatRelativeTime(
                          activity.createdAt,
                          snapshot.generatedAt,
                        )}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-slate-500 dark:text-slate-400">
                      {activity.orderNumber} · {activity.dealerName}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      {activity.actor}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
