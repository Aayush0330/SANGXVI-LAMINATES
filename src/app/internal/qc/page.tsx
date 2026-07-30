import Link from "next/link";
import {
  OrderStatus,
  PhysicalCheckStatus,
  Prisma,
} from "@/generated/prisma/client";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { ErpIcon } from "@/components/erp-icon";
import {
  OperationsEmptyState,
  OperationsMetricCard,
  OperationsStatusPill,
  type OperationsTone,
} from "@/components/operations-workspace-ui";
import {
  QcTransportAssignmentForm,
  QC_SCROLL_STORAGE_KEY,
} from "@/components/qc-transport-assignment-form";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderStatusLabel } from "@/lib/order-fulfillment";
import { hasPermission } from "@/lib/permissions";
import { approveQcAction, requestQcReworkAction } from "./actions";

const PAGE_SIZE = 10;

const ACTIVE_QC_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_QC,
  OrderStatus.QC_REWORK,
  OrderStatus.QC_APPROVED,
  OrderStatus.TRANSPORT_ASSIGNED,
];

const FILTER_STATUS_MAP: Record<string, OrderStatus[]> = {
  review: [OrderStatus.PENDING_QC],
  rework: [OrderStatus.QC_REWORK],
  approved: [OrderStatus.QC_APPROVED],
  assigned: [OrderStatus.TRANSPORT_ASSIGNED],
};

const queueFilters = [
  { key: "all", label: "All QC Work" },
  { key: "review", label: "Awaiting Review" },
  { key: "rework", label: "In Rework" },
  { key: "approved", label: "Assign Delivery" },
  { key: "assigned", label: "Delivery Assigned" },
] as const;

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function compactDate(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function assignmentLabel(status: PhysicalCheckStatus) {
  const labels: Record<PhysicalCheckStatus, string> = {
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In Progress",
    READY_FOR_QC: "Ready for QC",
    ISSUE_REPORTED: "Issue Reported",
    QC_REWORK: "QC Rework",
    COMPLETED: "QC Approved",
    CANCELLED: "Cancelled",
  };
  return labels[status];
}

function assignmentTone(status: PhysicalCheckStatus): OperationsTone {
  if (
    status === PhysicalCheckStatus.READY_FOR_QC ||
    status === PhysicalCheckStatus.COMPLETED
  ) {
    return "emerald";
  }
  if (
    status === PhysicalCheckStatus.QC_REWORK ||
    status === PhysicalCheckStatus.ISSUE_REPORTED
  ) {
    return "rose";
  }
  if (status === PhysicalCheckStatus.IN_PROGRESS) return "blue";
  return "amber";
}

function orderTone(status: OrderStatus): OperationsTone {
  if (status === OrderStatus.PENDING_QC) return "violet";
  if (status === OrderStatus.QC_REWORK) return "rose";
  if (status === OrderStatus.QC_APPROVED) return "emerald";
  if (status === OrderStatus.TRANSPORT_ASSIGNED) return "blue";
  return "slate";
}

function getMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "qc-approved": {
      type: "success",
      title: "QC approved",
      text: "The complete order is approved. Transport and driver can now be assigned.",
    },
    "rework-requested": {
      type: "success",
      title: "Rework requested",
      text: "The responsible Physical Team received the QC correction request.",
    },
    "transport-assigned": {
      type: "success",
      title: "Delivery assigned",
      text: "Transport and driver are assigned. The delivery is now visible in the field portal.",
    },
  };
  const errorMessages: Record<string, TeamFeedbackMessage> = {
    "permission-denied": {
      type: "error",
      title: "Permission denied",
      text: "You do not have permission to manage QC.",
    },
    "missing-order": {
      type: "error",
      title: "Order missing",
      text: "Order id is missing.",
    },
    "order-not-found": {
      type: "error",
      title: "Order not found",
      text: "The selected order was not found.",
    },
    "invalid-status": {
      type: "error",
      title: "Action unavailable",
      text: "This order is not ready for QC approval.",
    },
    "physical-checks-incomplete": {
      type: "error",
      title: "Physical checks incomplete",
      text: "Every Physical Team assignment must be Ready for QC before approval.",
    },
    "full-quantity-required": {
      type: "error",
      title: "Complete quantity required",
      text: "QC and delivery assignment remain locked until every item is fully reserved and physically verified.",
    },
    "missing-assignment": {
      type: "error",
      title: "Assignment missing",
      text: "Physical assignment id is missing.",
    },
    "assignment-not-found": {
      type: "error",
      title: "Assignment not found",
      text: "The selected physical assignment was not found.",
    },
    "rework-note-required": {
      type: "error",
      title: "Rework note required",
      text: "Add a clear correction note before sending the team back.",
    },
    "invalid-rework-status": {
      type: "error",
      title: "Rework unavailable",
      text: "Only a team currently Ready for QC can be returned for rework.",
    },
    "missing-driver": {
      type: "error",
      title: "Driver required",
      text: "Select a driver.",
    },
    "missing-transport": {
      type: "error",
      title: "Transport required",
      text: "Select a transport option.",
    },
    "driver-not-found": {
      type: "error",
      title: "Driver unavailable",
      text: "The selected driver is inactive or no longer has delivery access.",
    },
    "transport-not-found": {
      type: "error",
      title: "Transport unavailable",
      text: "The selected transport option is disabled or missing.",
    },
    "transport-status-invalid": {
      type: "error",
      title: "Assignment unavailable",
      text: "QC must approve the order before delivery assignment.",
    },
  };

  return (
    (success && successMessages[success]) ||
    (error && errorMessages[error]) ||
    null
  );
}

function buildHref(
  params: { q?: string; status?: string; page?: number; order?: string },
  patch: Partial<{
    q: string;
    status: string;
    page: number;
    order: string | null;
  }>,
) {
  const next = new URLSearchParams();
  const values = { ...params, ...patch };

  if (values.q) next.set("q", values.q);
  if (values.status && values.status !== "all") {
    next.set("status", values.status);
  }
  if (values.page && values.page > 1) next.set("page", String(values.page));
  if (values.order) next.set("order", values.order);

  const query = next.toString();
  return query ? `/internal/qc?${query}` : "/internal/qc";
}

export default async function QcPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    q?: string;
    status?: string;
    page?: string;
    order?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const q = String(params?.q ?? "").trim();
  const status = queueFilters.some((item) => item.key === params?.status)
    ? String(params?.status)
    : "all";
  const requestedPage = Math.max(
    1,
    Number.parseInt(params?.page ?? "1", 10) || 1,
  );
  const requestedOrderId = String(params?.order ?? "").trim();
  const { currentUser, hasAccess } = await checkPermission(
    "manage_qc",
    "/internal/qc",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="QC & Delivery Access Denied"
        description="Your account does not have permission to review Quality Control or assign delivery."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const visibleStatuses =
    status === "all"
      ? ACTIVE_QC_STATUSES
      : FILTER_STATUS_MAP[status] ?? ACTIVE_QC_STATUSES;

  const where: Prisma.OrderWhereInput = {
    status: { in: visibleStatuses },
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            {
              dealer: {
                name: { contains: q, mode: "insensitive" },
              },
            },
            {
              assignedDriver: {
                name: { contains: q, mode: "insensitive" },
              },
            },
            {
              items: {
                some: {
                  product: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" } },
                      { code: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [
    totalMatching,
    waitingCount,
    reworkCount,
    approvedCount,
    assignedCount,
    drivers,
    transportOptions,
  ] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { status: OrderStatus.PENDING_QC } }),
    prisma.order.count({ where: { status: OrderStatus.QC_REWORK } }),
    prisma.order.count({ where: { status: OrderStatus.QC_APPROVED } }),
    prisma.order.count({ where: { status: OrderStatus.TRANSPORT_ASSIGNED } }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { role: "DRIVER_TRANSPORT" },
          { roleAssignments: { some: { role: "DRIVER_TRANSPORT" } } },
        ],
      },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.transportOption.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      updatedAt: true,
      dealer: { select: { name: true } },
      assignedDriver: { select: { name: true } },
      transportOption: { select: { name: true } },
      physicalAssignments: { select: { status: true } },
      _count: { select: { items: true, physicalAssignments: true } },
    },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const preferredOrderId = requestedOrderId || orders[0]?.id || "";
  const selectedOrderInclude = {
    dealer: { select: { name: true, email: true, phone: true } },
    assignedDriver: { select: { name: true, phone: true } },
    transportOption: true,
    items: {
      include: {
        product: { include: { category: true, brand: true } },
        physicalAssignmentItem: {
          include: {
            assignment: {
              include: { team: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" as const },
    },
    physicalAssignments: {
      include: {
        team: true,
        items: {
          include: {
            orderItem: {
              include: {
                product: { include: { category: true, brand: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" as const },
        },
      },
      orderBy: { assignedAt: "asc" as const },
    },
    statusHistory: {
      orderBy: { createdAt: "desc" as const },
      take: 6,
    },
  } satisfies Prisma.OrderInclude;

  let selectedOrder = preferredOrderId
    ? await prisma.order.findFirst({
        where: {
          id: preferredOrderId,
          status: { in: ACTIVE_QC_STATUSES },
        },
        include: selectedOrderInclude,
      })
    : null;

  if (!selectedOrder && orders[0] && orders[0].id !== preferredOrderId) {
    selectedOrder = await prisma.order.findFirst({
      where: {
        id: orders[0].id,
        status: { in: ACTIVE_QC_STATUSES },
      },
      include: selectedOrderInclude,
    });
  }

  const selectedOrderId = selectedOrder?.id ?? "";
  const queryState = { q, status, page, order: selectedOrderId };
  const allQcCount =
    waitingCount + reworkCount + approvedCount + assignedCount;
  const filterCounts: Record<string, number> = {
    all: allQcCount,
    review: waitingCount,
    rework: reworkCount,
    approved: approvedCount,
    assigned: assignedCount,
  };

  const metrics = [
    {
      label: "Awaiting QC",
      value: waitingCount,
      helper: "Ready for quality decision",
      icon: "quality" as const,
      tone: "violet" as const,
    },
    {
      label: "In Rework",
      value: reworkCount,
      helper: "Returned to a Physical Team",
      icon: "alert" as const,
      tone: "rose" as const,
    },
    {
      label: "Assign Delivery",
      value: approvedCount,
      helper: "QC clear, driver still pending",
      icon: "activity" as const,
      tone: "emerald" as const,
    },
    {
      label: "Delivery Assigned",
      value: assignedCount,
      helper: "Visible to field operations",
      icon: "delivery" as const,
      tone: "blue" as const,
    },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="relative px-5 py-6 sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-100/80 blur-3xl dark:bg-emerald-500/10" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-emerald-600 dark:text-emerald-300">
                  Stage 4 · Quality & Delivery
                </p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">
                  Controlled handoff
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                QC & Delivery Control
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Review complete physical checks, return only the responsible
                team for correction, then assign transport and driver after QC
                approval.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {hasPermission(currentUser.roles, "manage_dispatch") ? (
                <Link
                  href="/internal/dispatch"
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
                >
                  Physical Checks
                </Link>
              ) : null}
              <Link
                href="/internal/transport"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                Transport Options
                <ErpIcon name="chevron-right" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <TeamFeedbackToast
        message={message}
        restoreScrollKey={QC_SCROLL_STORAGE_KEY}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <OperationsMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(390px,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">
                  QC decision queue
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {totalMatching} matching order
                  {totalMatching === 1 ? "" : "s"}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-white/5 dark:text-slate-300">
                Page {page} / {totalPages}
              </span>
            </div>

            <form method="get" className="mt-4 flex gap-2">
              {status !== "all" ? (
                <input type="hidden" name="status" value={status} />
              ) : null}
              <label className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <ErpIcon name="search" className="h-4 w-4" />
                </span>
                <span className="sr-only">Search QC orders</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Order, dealer, driver or product..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500/40"
                />
              </label>
              <button
                type="submit"
                className="h-11 shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                Search
              </button>
              {q ? (
                <Link
                  href={buildHref(queryState, {
                    q: "",
                    page: 1,
                    order: null,
                  })}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 dark:border-white/10 dark:text-slate-300"
                >
                  Clear
                </Link>
              ) : null}
            </form>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {queueFilters.map((item) => {
                const active = status === item.key;
                return (
                  <Link
                    key={item.key}
                    href={buildHref(queryState, {
                      status: item.key,
                      page: 1,
                      order: null,
                    })}
                    className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-black transition ${
                      active
                        ? "bg-slate-950 text-white dark:bg-emerald-600"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active
                          ? "bg-white/15 text-white"
                          : "bg-white text-slate-500 dark:bg-slate-950 dark:text-slate-400"
                      }`}
                    >
                      {filterCounts[item.key]}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {orders.length === 0 ? (
            <OperationsEmptyState
              icon="quality"
              title="No matching QC work"
              description={
                q || status !== "all"
                  ? "Try another search or clear the queue filters."
                  : "Orders appear after every assigned Physical Team completes its check."
              }
              action={
                q || status !== "all" ? (
                  <Link
                    href="/internal/qc"
                    className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-emerald-600"
                  >
                    Clear all filters
                  </Link>
                ) : null
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left dark:border-white/10 dark:bg-slate-950/60">
                      {["Order & dealer", "Status", "Teams", "Products", "Updated", ""].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {orders.map((order) => {
                      const selected = order.id === selectedOrderId;
                      const readyTeams = order.physicalAssignments.filter(
                        (assignment) =>
                          (
                            [
                              PhysicalCheckStatus.READY_FOR_QC,
                              PhysicalCheckStatus.COMPLETED,
                            ] as PhysicalCheckStatus[]
                          ).includes(assignment.status),
                      ).length;

                      return (
                        <tr
                          key={order.id}
                          className={
                            selected
                              ? "bg-emerald-50/70 dark:bg-emerald-500/10"
                              : "transition hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                          }
                        >
                          <td className="px-4 py-4">
                            <Link
                              href={`${buildHref(queryState, {
                                order: order.id,
                              })}#qc-detail`}
                              className="font-black text-slate-950 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300"
                            >
                              {order.orderNumber}
                            </Link>
                            <p className="mt-1 max-w-44 truncate text-xs text-slate-500 dark:text-slate-400">
                              {order.dealer.name}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <OperationsStatusPill tone={orderTone(order.status)}>
                              {getOrderStatusLabel(order.status)}
                            </OperationsStatusPill>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                              {readyTeams}/{order._count.physicalAssignments}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              cleared
                            </p>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                            {order._count.items}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                            {compactDate(order.updatedAt)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`${buildHref(queryState, {
                                order: order.id,
                              })}#qc-detail`}
                              aria-label={`Open ${order.orderNumber} QC review`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                            >
                              <ErpIcon
                                name="chevron-right"
                                className="h-4 w-4"
                              />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden dark:divide-white/5">
                {orders.map((order) => {
                  const selected = order.id === selectedOrderId;
                  const readyTeams = order.physicalAssignments.filter(
                    (assignment) =>
                      (
                        [
                          PhysicalCheckStatus.READY_FOR_QC,
                          PhysicalCheckStatus.COMPLETED,
                        ] as PhysicalCheckStatus[]
                      ).includes(assignment.status),
                  ).length;

                  return (
                    <Link
                      key={order.id}
                      href={`${buildHref(queryState, {
                        order: order.id,
                      })}#qc-detail`}
                      className={`block p-4 transition ${
                        selected
                          ? "bg-emerald-50 dark:bg-emerald-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950 dark:text-white">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {order.dealer.name} · {order._count.items} products
                          </p>
                        </div>
                        <ErpIcon
                          name="chevron-right"
                          className="h-4 w-4 shrink-0 text-slate-400"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <OperationsStatusPill tone={orderTone(order.status)}>
                          {getOrderStatusLabel(order.status)}
                        </OperationsStatusPill>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {readyTeams}/{order._count.physicalAssignments} teams
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 dark:border-white/10">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, totalMatching)} of {totalMatching}
                </p>
                <div className="flex gap-2">
                  <Link
                    href={buildHref(queryState, {
                      page: Math.max(1, page - 1),
                      order: null,
                    })}
                    aria-disabled={page <= 1}
                    className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-black ${
                      page <= 1
                        ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                        : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:text-slate-300"
                    }`}
                  >
                    Previous
                  </Link>
                  <Link
                    href={buildHref(queryState, {
                      page: Math.min(totalPages, page + 1),
                      order: null,
                    })}
                    aria-disabled={page >= totalPages}
                    className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-black ${
                      page >= totalPages
                        ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                        : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:text-slate-300"
                    }`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        <div id="qc-detail" className="min-w-0 scroll-mt-24">
          {!selectedOrder ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
              <OperationsEmptyState
                icon="quality"
                title="Select an order for QC"
                description="Choose an item from the queue to review its quantity gates, team checks and available decision."
              />
            </div>
          ) : (
            <article className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              {(() => {
                const teamsCleared = selectedOrder.physicalAssignments.filter(
                  (assignment) =>
                    (
                      [
                        PhysicalCheckStatus.READY_FOR_QC,
                        PhysicalCheckStatus.COMPLETED,
                      ] as PhysicalCheckStatus[]
                    ).includes(assignment.status),
                ).length;
                const allTeamsReady =
                  selectedOrder.physicalAssignments.length > 0 &&
                  selectedOrder.physicalAssignments.every(
                    (assignment) =>
                      assignment.status === PhysicalCheckStatus.READY_FOR_QC,
                  );
                const reservedLines = selectedOrder.items.filter((item) => {
                  const ordered =
                    item.requestedQuantity > 0
                      ? item.requestedQuantity
                      : item.quantity;
                  return (
                    item.quantity === ordered &&
                    item.blockedQuantity === ordered &&
                    item.deliveredQuantity === 0 &&
                    item.cancelledQuantity === 0
                  );
                }).length;
                const verifiedLines = selectedOrder.items.filter((item) => {
                  const ordered =
                    item.requestedQuantity > 0
                      ? item.requestedQuantity
                      : item.quantity;
                  const physicalItem = item.physicalAssignmentItem;
                  return (
                    physicalItem?.verifiedQuantity === ordered &&
                    physicalItem.damagedQuantity === 0 &&
                    physicalItem.shortQuantity === 0
                  );
                }).length;
                const completeQuantityReady =
                  selectedOrder.items.length > 0 &&
                  reservedLines === selectedOrder.items.length &&
                  verifiedLines === selectedOrder.items.length;
                const canApprove = allTeamsReady && completeQuantityReady;

                return (
                  <>
                    <header className="relative overflow-hidden border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
                      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-100/70 blur-3xl dark:bg-emerald-500/10" />
                      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Quality review
                          </p>
                          <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                            {selectedOrder.orderNumber}
                          </h2>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {selectedOrder.dealer.name} ·{" "}
                            {selectedOrder.items.length} product line
                            {selectedOrder.items.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <OperationsStatusPill
                          tone={orderTone(selectedOrder.status)}
                        >
                          {getOrderStatusLabel(selectedOrder.status)}
                        </OperationsStatusPill>
                      </div>
                    </header>

                    <div className="space-y-5 p-5 sm:p-6">
                      <section>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <h3 className="font-black text-slate-950 dark:text-white">
                              Release gates
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              All three gates must be clear before QC approval
                              and delivery assignment.
                            </p>
                          </div>
                          <span className="text-xs font-bold text-slate-400">
                            Updated {compactDate(selectedOrder.updatedAt)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          {[
                            {
                              label: "Physical teams",
                              value: `${teamsCleared}/${selectedOrder.physicalAssignments.length}`,
                              helper: "Ready or QC completed",
                              clear:
                                teamsCleared ===
                                  selectedOrder.physicalAssignments.length &&
                                selectedOrder.physicalAssignments.length > 0,
                            },
                            {
                              label: "Stock reserved",
                              value: `${reservedLines}/${selectedOrder.items.length}`,
                              helper: "Complete ordered quantity",
                              clear:
                                reservedLines === selectedOrder.items.length &&
                                selectedOrder.items.length > 0,
                            },
                            {
                              label: "Clean verification",
                              value: `${verifiedLines}/${selectedOrder.items.length}`,
                              helper: "No shortage or damage",
                              clear:
                                verifiedLines === selectedOrder.items.length &&
                                selectedOrder.items.length > 0,
                            },
                          ].map((gate) => (
                            <div
                              key={gate.label}
                              className={`rounded-2xl border p-4 ${
                                gate.clear
                                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                                  : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                                    {gate.label}
                                  </p>
                                  <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                                    {gate.value}
                                  </p>
                                </div>
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                                    gate.clear
                                      ? "bg-emerald-600 text-white"
                                      : "bg-amber-500 text-white"
                                  }`}
                                >
                                  {gate.clear ? "✓" : "!"}
                                </span>
                              </div>
                              <p className="mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                {gate.helper}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-black text-slate-950 dark:text-white">
                              Physical team submissions
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Review each team independently before the final
                              order decision.
                            </p>
                          </div>
                          <span className="text-xs font-bold text-slate-400">
                            {selectedOrder.physicalAssignments.length} team
                            {selectedOrder.physicalAssignments.length === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {selectedOrder.physicalAssignments.map(
                            (assignment) => (
                              <div
                                key={assignment.id}
                                className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-black text-slate-950 dark:text-white">
                                        {assignment.team.name}
                                      </h4>
                                      <OperationsStatusPill
                                        tone={assignmentTone(assignment.status)}
                                      >
                                        {assignmentLabel(assignment.status)}
                                      </OperationsStatusPill>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                      Completed{" "}
                                      {formatDateTime(assignment.completedAt)}
                                      {assignment.completedByName
                                        ? ` · ${assignment.completedByName}`
                                        : ""}
                                    </p>
                                  </div>
                                  <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 dark:bg-white/5 dark:text-slate-300">
                                    {assignment.items.length} line
                                    {assignment.items.length === 1 ? "" : "s"}
                                  </span>
                                </div>

                                {assignment.issueNotes ? (
                                  <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                                    Physical issue: {assignment.issueNotes}
                                  </div>
                                ) : null}
                                {assignment.qcNotes ? (
                                  <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                                    QC note: {assignment.qcNotes}
                                  </div>
                                ) : null}

                                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
                                  <table className="w-full min-w-[560px] border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 text-left dark:bg-slate-950/60">
                                        {[
                                          "Product",
                                          "Assigned",
                                          "Verified",
                                          "Damaged",
                                          "Short",
                                        ].map((heading) => (
                                          <th
                                            key={heading}
                                            className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400"
                                          >
                                            {heading}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                      {assignment.items.map((item) => (
                                        <tr key={item.id}>
                                          <td className="px-3 py-3">
                                            <p className="max-w-56 truncate text-xs font-black text-slate-800 dark:text-slate-100">
                                              {item.orderItem.product.name}
                                            </p>
                                            <p className="mt-1 text-[10px] text-slate-400">
                                              {item.orderItem.product.code}
                                            </p>
                                          </td>
                                          <td className="px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {item.assignedQuantity}
                                          </td>
                                          <td className="px-3 py-3 text-xs font-black text-emerald-700 dark:text-emerald-300">
                                            {item.verifiedQuantity ?? 0}
                                          </td>
                                          <td className="px-3 py-3 text-xs font-black text-rose-700 dark:text-rose-300">
                                            {item.damagedQuantity}
                                          </td>
                                          <td className="px-3 py-3 text-xs font-black text-amber-700 dark:text-amber-300">
                                            {item.shortQuantity}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {selectedOrder.status ===
                                  OrderStatus.PENDING_QC &&
                                assignment.status ===
                                  PhysicalCheckStatus.READY_FOR_QC ? (
                                  <form
                                    action={requestQcReworkAction}
                                    className="mt-4 grid gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/20 dark:bg-rose-500/10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                                  >
                                    <input
                                      type="hidden"
                                      name="assignmentId"
                                      value={assignment.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="focusOrderId"
                                      value={selectedOrder.id}
                                    />
                                    <label>
                                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700 dark:text-rose-200">
                                        Team correction note
                                      </span>
                                      <input
                                        name="qcNotes"
                                        required
                                        maxLength={1000}
                                        placeholder="Describe exactly what this team must recheck"
                                        className="mt-2 h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-rose-400 dark:border-rose-500/20 dark:bg-slate-950 dark:text-slate-100"
                                      />
                                    </label>
                                    <button
                                      type="submit"
                                      className="h-11 rounded-xl border border-rose-300 bg-white px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-200"
                                    >
                                      Return this team
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      </section>

                      {selectedOrder.status === OrderStatus.PENDING_QC ? (
                        <form
                          action={approveQcAction}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                        >
                          <input
                            type="hidden"
                            name="orderId"
                            value={selectedOrder.id}
                          />
                          <input
                            type="hidden"
                            name="focusOrderId"
                            value={selectedOrder.id}
                          />
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="font-black text-emerald-950 dark:text-emerald-100">
                                Final QC decision
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-200/80">
                                Approval locks all team submissions and unlocks
                                transport and driver assignment.
                              </p>
                            </div>
                            <OperationsStatusPill
                              tone={canApprove ? "emerald" : "amber"}
                            >
                              {canApprove ? "All gates clear" : "Gate blocked"}
                            </OperationsStatusPill>
                          </div>
                          <label className="mt-4 block">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">
                              QC approval note
                            </span>
                            <input
                              name="qcNotes"
                              maxLength={1000}
                              placeholder="Optional final quality note"
                              className="mt-2 h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 dark:border-emerald-500/20 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                          <div className="mt-4 flex flex-col gap-3 border-t border-emerald-200 pt-4 dark:border-emerald-500/20 sm:flex-row sm:items-center sm:justify-between">
                            <p className="max-w-lg text-xs leading-5 text-emerald-800 dark:text-emerald-200/80">
                              {!allTeamsReady
                                ? "Every team must be Ready for QC."
                                : !completeQuantityReady
                                  ? "Every ordered unit must be reserved and verified with zero damage or shortage."
                                  : "The complete order is eligible for QC approval."}
                            </p>
                            <button
                              type="submit"
                              disabled={!canApprove}
                              className="h-11 shrink-0 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                            >
                              Approve complete order
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {selectedOrder.status === OrderStatus.QC_REWORK ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                          <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                              <ErpIcon name="alert" className="h-5 w-5" />
                            </span>
                            <div>
                              <h3 className="font-black text-rose-950 dark:text-rose-100">
                                Physical rework in progress
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-rose-800 dark:text-rose-200/80">
                                The rejected Physical Team must restart and
                                submit a complete clean verification. QC actions
                                unlock after the order returns to this queue.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {selectedOrder.status === OrderStatus.QC_APPROVED ? (
                        <QcTransportAssignmentForm
                          orderId={selectedOrder.id}
                          drivers={drivers}
                          transportOptions={transportOptions}
                        />
                      ) : null}

                      {selectedOrder.status ===
                      OrderStatus.TRANSPORT_ASSIGNED ? (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-500/20 dark:bg-blue-500/10">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                                <ErpIcon
                                  name="delivery"
                                  className="h-5 w-5"
                                />
                              </span>
                              <div>
                                <h3 className="font-black text-blue-950 dark:text-blue-100">
                                  Delivery handoff complete
                                </h3>
                                <p className="mt-1 text-xs leading-5 text-blue-800 dark:text-blue-200/80">
                                  The assigned driver can now access this
                                  delivery in the field portal.
                                </p>
                              </div>
                            </div>
                            <OperationsStatusPill tone="blue">
                              Field ready
                            </OperationsStatusPill>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-white p-4 ring-1 ring-blue-100 dark:bg-slate-950/70 dark:ring-blue-500/20">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                                Transport
                              </p>
                              <p className="mt-2 font-black text-slate-950 dark:text-white">
                                {selectedOrder.transportOption?.name ||
                                  selectedOrder.transportLabel ||
                                  "Not recorded"}
                              </p>
                            </div>
                            <div className="rounded-xl bg-white p-4 ring-1 ring-blue-100 dark:bg-slate-950/70 dark:ring-blue-500/20">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                                Driver
                              </p>
                              <p className="mt-2 font-black text-slate-950 dark:text-white">
                                {selectedOrder.assignedDriver?.name ||
                                  "Not recorded"}
                              </p>
                              {selectedOrder.assignedDriver?.phone ? (
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {selectedOrder.assignedDriver.phone}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <section className="border-t border-slate-200 pt-5 dark:border-white/10">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-black text-slate-950 dark:text-white">
                              Recent order activity
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Latest recorded workflow transitions.
                            </p>
                          </div>
                          <Link
                            href={`/internal/orders?order=${selectedOrder.id}`}
                            className="text-xs font-black text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                          >
                            Full order record
                          </Link>
                        </div>
                        <div className="mt-4 space-y-3">
                          {selectedOrder.statusHistory.length > 0 ? (
                            selectedOrder.statusHistory.map((event, index) => (
                              <div
                                key={event.id}
                                className="grid grid-cols-[18px_minmax(0,1fr)] gap-3"
                              >
                                <div className="flex flex-col items-center">
                                  <span
                                    className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                                      index === 0
                                        ? "bg-emerald-500"
                                        : "bg-slate-300 dark:bg-slate-600"
                                    }`}
                                  />
                                  {index <
                                  selectedOrder.statusHistory.length - 1 ? (
                                    <span className="mt-1 h-full w-px bg-slate-200 dark:bg-white/10" />
                                  ) : null}
                                </div>
                                <div className="pb-2">
                                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                      {event.title}
                                    </p>
                                    <span className="text-[11px] text-slate-400">
                                      {compactDate(event.createdAt)}
                                    </span>
                                  </div>
                                  {event.description ? (
                                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                      {event.description}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                              No status history has been recorded yet.
                            </p>
                          )}
                        </div>
                      </section>
                    </div>
                  </>
                );
              })()}
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
