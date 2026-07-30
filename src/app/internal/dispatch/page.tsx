import Link from "next/link";
import {
  PhysicalCheckStatus,
  Prisma,
  type OrderStatus,
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
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderStatusLabel } from "@/lib/order-fulfillment";
import { hasAnyRole, hasPermission } from "@/lib/permissions";
import {
  approveCancellationRequestAction,
  completePhysicalCheckAction,
  rejectCancellationRequestAction,
  resolvePhysicalBlockerAction,
  startPhysicalCheckAction,
} from "./actions";

const PAGE_SIZE = 10;

const ACTIVE_ASSIGNMENT_STATUSES: PhysicalCheckStatus[] = [
  PhysicalCheckStatus.ASSIGNED,
  PhysicalCheckStatus.IN_PROGRESS,
  PhysicalCheckStatus.READY_FOR_QC,
  PhysicalCheckStatus.ISSUE_REPORTED,
  PhysicalCheckStatus.QC_REWORK,
  PhysicalCheckStatus.COMPLETED,
];

const FILTER_STATUS_MAP: Record<string, PhysicalCheckStatus[]> = {
  assigned: [PhysicalCheckStatus.ASSIGNED],
  active: [PhysicalCheckStatus.IN_PROGRESS],
  attention: [
    PhysicalCheckStatus.ISSUE_REPORTED,
    PhysicalCheckStatus.QC_REWORK,
  ],
  ready: [
    PhysicalCheckStatus.READY_FOR_QC,
    PhysicalCheckStatus.COMPLETED,
  ],
};

const queueFilters = [
  { key: "all", label: "All Work" },
  { key: "assigned", label: "New Assignments" },
  { key: "active", label: "In Progress" },
  { key: "attention", label: "Blockers & Rework" },
  { key: "ready", label: "Ready for QC" },
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

function getAssignmentStatusLabel(status: PhysicalCheckStatus) {
  const labels: Record<PhysicalCheckStatus, string> = {
    ASSIGNED: "Assigned",
    IN_PROGRESS: "Check in Progress",
    READY_FOR_QC: "Ready for QC",
    ISSUE_REPORTED: "Issue Reported",
    QC_REWORK: "QC Rework",
    COMPLETED: "QC Completed",
    CANCELLED: "Cancelled",
  };

  return labels[status];
}

function getAssignmentTone(status: PhysicalCheckStatus): OperationsTone {
  if (
    status === PhysicalCheckStatus.READY_FOR_QC ||
    status === PhysicalCheckStatus.COMPLETED
  ) {
    return "emerald";
  }
  if (
    status === PhysicalCheckStatus.ISSUE_REPORTED ||
    status === PhysicalCheckStatus.QC_REWORK
  ) {
    return "rose";
  }
  if (status === PhysicalCheckStatus.IN_PROGRESS) return "blue";
  return "amber";
}

function getOrderTone(status: OrderStatus): OperationsTone {
  if (status === "PHYSICAL_CHECK_ISSUE" || status === "QC_REWORK") {
    return "rose";
  }
  if (status === "PENDING_QC" || status === "QC_APPROVED") {
    return "emerald";
  }
  if (status === "PHYSICAL_CHECK_IN_PROGRESS") return "blue";
  if (status === "PHYSICAL_CHECK_ASSIGNED") return "violet";
  return "slate";
}

function getMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "check-started": {
      type: "success",
      title: "Physical check started",
      text: "The team assignment is now in progress.",
    },
    "check-completed": {
      type: "success",
      title: "Verification saved",
      text: "The complete check was saved. The order moves to QC when every assigned team is ready.",
    },
    "issue-reported": {
      type: "success",
      title: "Blocker reported",
      text: "Order Receiving and management have been notified. QC remains locked.",
    },
    "blocker-resolved": {
      type: "success",
      title: "Blocker resolved",
      text: "The old check was cleared. The Physical Team must restart the complete verification.",
    },
    "cancellation-approved": {
      type: "success",
      title: "Cancellation approved",
      text: "Reserved stock was released and the order was cancelled.",
    },
    "cancellation-rejected": {
      type: "success",
      title: "Cancellation rejected",
      text: "The exact previous workflow status has been restored.",
    },
  };
  const errorMessages: Record<string, TeamFeedbackMessage> = {
    "permission-denied": {
      type: "error",
      title: "Permission denied",
      text: "You do not have permission for this physical check.",
    },
    "missing-assignment": {
      type: "error",
      title: "Assignment missing",
      text: "Assignment id is missing.",
    },
    "assignment-not-found": {
      type: "error",
      title: "Assignment unavailable",
      text: "The assignment was not found or is not assigned to your team.",
    },
    "invalid-assignment-status": {
      type: "error",
      title: "Action unavailable",
      text: "This action is not available for the current assignment status.",
    },
    "invalid-check-quantity": {
      type: "error",
      title: "Check quantities",
      text: "Verified and damaged quantities must be valid whole numbers.",
    },
    "stock-changed": {
      type: "error",
      title: "Stock changed",
      text: "Complete stock is unavailable. QC and delivery assignment remain locked.",
    },
    "full-stock-required": {
      type: "error",
      title: "Complete stock required",
      text: "Add the complete ordered quantity before resolving this blocker.",
    },
    "resolution-note-required": {
      type: "error",
      title: "Resolution note required",
      text: "Explain how the complete stock blocker was resolved.",
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
      text: "This action is not allowed for the current order status.",
    },
    "cancellation-approval-note-too-long": {
      type: "error",
      title: "Note is too long",
      text: "The approval note must be 1,000 characters or fewer.",
    },
    "cancellation-rejection-reason-required": {
      type: "error",
      title: "Rejection reason required",
      text: "Enter a reason before rejecting the cancellation request.",
    },
    "cancellation-previous-status-missing": {
      type: "error",
      title: "Previous status missing",
      text: "Review Order Details and status history before continuing.",
    },
  };

  return (
    (success && successMessages[success]) ||
    (error && errorMessages[error]) ||
    null
  );
}

function buildHref(
  params: {
    q?: string;
    status?: string;
    page?: number;
    assignment?: string;
  },
  patch: Partial<{
    q: string;
    status: string;
    page: number;
    assignment: string | null;
  }>,
) {
  const next = new URLSearchParams();
  const values = { ...params, ...patch };

  if (values.q) next.set("q", values.q);
  if (values.status && values.status !== "all") {
    next.set("status", values.status);
  }
  if (values.page && values.page > 1) next.set("page", String(values.page));
  if (values.assignment) next.set("assignment", values.assignment);

  const query = next.toString();
  return query ? `/internal/dispatch?${query}` : "/internal/dispatch";
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    q?: string;
    status?: string;
    page?: string;
    assignment?: string;
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
  const requestedAssignmentId = String(params?.assignment ?? "").trim();

  const { currentUser, hasAccess } = await checkPermission(
    "manage_dispatch",
    "/internal/dispatch",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Physical Checks Access Denied"
        description="Only Physical Team members and authorized management can access this verification workspace."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const isManagement = hasAnyRole(currentUser.roles, ["owner", "manager"]);
  const accessWhere: Prisma.OrderPhysicalAssignmentWhereInput = isManagement
    ? {}
    : {
        team: {
          members: {
            some: { userId: currentUser.id },
          },
        },
      };

  const visibleStatuses =
    status === "all"
      ? ACTIVE_ASSIGNMENT_STATUSES
      : FILTER_STATUS_MAP[status] ?? ACTIVE_ASSIGNMENT_STATUSES;

  const where: Prisma.OrderPhysicalAssignmentWhereInput = {
    ...accessWhere,
    status: { in: visibleStatuses },
    ...(q
      ? {
          OR: [
            {
              order: {
                orderNumber: { contains: q, mode: "insensitive" },
              },
            },
            {
              order: {
                dealer: {
                  name: { contains: q, mode: "insensitive" },
                },
              },
            },
            {
              team: {
                name: { contains: q, mode: "insensitive" },
              },
            },
            {
              items: {
                some: {
                  orderItem: {
                    product: {
                      OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { code: { contains: q, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const countWhere = (
    statuses: PhysicalCheckStatus[],
  ): Prisma.OrderPhysicalAssignmentWhereInput => ({
    ...accessWhere,
    status: { in: statuses },
  });

  const [
    totalMatching,
    assignedCount,
    inProgressCount,
    attentionCount,
    readyCount,
    cancellationCount,
    cancellationOrders,
  ] = await Promise.all([
    prisma.orderPhysicalAssignment.count({ where }),
    prisma.orderPhysicalAssignment.count({
      where: countWhere([PhysicalCheckStatus.ASSIGNED]),
    }),
    prisma.orderPhysicalAssignment.count({
      where: countWhere([PhysicalCheckStatus.IN_PROGRESS]),
    }),
    prisma.orderPhysicalAssignment.count({
      where: countWhere([
        PhysicalCheckStatus.ISSUE_REPORTED,
        PhysicalCheckStatus.QC_REWORK,
      ]),
    }),
    prisma.orderPhysicalAssignment.count({
      where: countWhere([
        PhysicalCheckStatus.READY_FOR_QC,
        PhysicalCheckStatus.COMPLETED,
      ]),
    }),
    isManagement
      ? prisma.order.count({ where: { status: "CANCELLATION_REQUESTED" } })
      : Promise.resolve(0),
    isManagement
      ? prisma.order.findMany({
          where: { status: "CANCELLATION_REQUESTED" },
          include: {
            dealer: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { updatedAt: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const assignments = await prisma.orderPhysicalAssignment.findMany({
    where,
    select: {
      id: true,
      status: true,
      assignedAt: true,
      updatedAt: true,
      issueType: true,
      issueNotes: true,
      qcNotes: true,
      team: { select: { name: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          dealer: { select: { name: true } },
        },
      },
      items: {
        select: {
          assignedQuantity: true,
          verifiedQuantity: true,
          damagedQuantity: true,
          shortQuantity: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { assignedAt: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const preferredAssignmentId =
    requestedAssignmentId || assignments[0]?.id || "";

  const selectedAssignmentInclude = {
    team: {
      include: {
        members: {
          where: { user: { status: "ACTIVE" } },
          include: {
            user: { select: { name: true, email: true } },
          },
          orderBy: [{ role: "asc" as const }, { createdAt: "asc" as const }],
        },
      },
    },
    order: {
      include: {
        dealer: { select: { name: true, email: true, phone: true } },
        physicalAssignments: {
          select: { id: true, status: true, team: { select: { name: true } } },
          orderBy: { assignedAt: "asc" as const },
        },
        statusHistory: {
          orderBy: { createdAt: "desc" as const },
          take: 6,
        },
      },
    },
    items: {
      include: {
        orderItem: {
          include: {
            product: {
              include: { category: true, brand: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" as const },
    },
  } satisfies Prisma.OrderPhysicalAssignmentInclude;

  let selectedAssignment = preferredAssignmentId
    ? await prisma.orderPhysicalAssignment.findFirst({
        where: {
          id: preferredAssignmentId,
          ...accessWhere,
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        },
        include: selectedAssignmentInclude,
      })
    : null;

  if (
    !selectedAssignment &&
    assignments[0] &&
    assignments[0].id !== preferredAssignmentId
  ) {
    selectedAssignment = await prisma.orderPhysicalAssignment.findFirst({
      where: {
        id: assignments[0].id,
        ...accessWhere,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      },
      include: selectedAssignmentInclude,
    });
  }

  const selectedAssignmentId = selectedAssignment?.id ?? "";
  const queryState = {
    q,
    status,
    page,
    assignment: selectedAssignmentId,
  };
  const allWorkCount =
    assignedCount + inProgressCount + attentionCount + readyCount;
  const filterCounts: Record<string, number> = {
    all: allWorkCount,
    assigned: assignedCount,
    active: inProgressCount,
    attention: attentionCount,
    ready: readyCount,
  };

  const metrics = [
    {
      label: "New Assignments",
      value: assignedCount,
      helper: "Waiting for the team to start",
      icon: "orders" as const,
      tone: "amber" as const,
    },
    {
      label: "Checks in Progress",
      value: inProgressCount,
      helper: "Active physical verification",
      icon: "activity" as const,
      tone: "blue" as const,
    },
    {
      label: "Blockers / Rework",
      value: attentionCount,
      helper: "Needs immediate resolution",
      icon: "alert" as const,
      tone: "rose" as const,
    },
    {
      label: "Ready / Completed",
      value: readyCount,
      helper: "Ready for or cleared by QC",
      icon: "quality" as const,
      tone: "emerald" as const,
    },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="relative px-5 py-6 sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-violet-100/80 blur-3xl dark:bg-violet-500/10" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-violet-600 dark:text-violet-300">
                  Stage 3 · Fulfilment Operations
                </p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">
                  Live queue
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Physical Check Control
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Verify complete assigned quantities, record damage or shortage,
                resolve blockers and release clean work to Quality Control.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isManagement ? (
                <Link
                  href="/internal/order-receiving"
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
                >
                  Workflow Control
                </Link>
              ) : null}
              {hasPermission(currentUser.roles, "manage_qc") ? (
                <Link
                  href="/internal/qc"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-500"
                >
                  Open QC & Delivery
                  <ErpIcon name="chevron-right" className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/account/tasks"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-500"
                >
                  Open My Tasks
                  <ErpIcon name="chevron-right" className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <TeamFeedbackToast message={message} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <OperationsMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      {cancellationCount > 0 ? (
        <section className="overflow-hidden rounded-[24px] border border-rose-200 bg-white shadow-sm shadow-rose-100/60 dark:border-rose-500/20 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-col gap-3 border-b border-rose-100 bg-rose-50/70 px-5 py-4 dark:border-rose-500/15 dark:bg-rose-500/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                <ErpIcon name="alert" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-black text-slate-950 dark:text-white">
                  Cancellation decision center
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {cancellationCount} request
                  {cancellationCount === 1 ? "" : "s"} require management
                  review. Rejection restores the exact previous workflow stage.
                </p>
              </div>
            </div>
            <OperationsStatusPill tone="rose">
              {cancellationCount} pending
            </OperationsStatusPill>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {cancellationOrders.map((order) => (
              <div
                key={order.id}
                className="grid gap-4 p-5 xl:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.25fr)] xl:items-center"
              >
                <div className="min-w-0">
                  <p className="font-black text-slate-950 dark:text-white">
                    {order.orderNumber}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {order.dealer.name} · {order._count.items} product line
                    {order._count.items === 1 ? "" : "s"}
                  </p>
                  <p className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                    Restore on rejection:{" "}
                    {order.cancellationPreviousStatus
                      ? getOrderStatusLabel(order.cancellationPreviousStatus)
                      : "Review required"}
                  </p>
                  {order.cancellationRequestReason ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Reason: {order.cancellationRequestReason}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <form
                    action={approveCancellationRequestAction}
                    className="grid gap-2 sm:grid-cols-[1fr_auto]"
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input
                      name="approvalNote"
                      aria-label={`Approval note for ${order.orderNumber}`}
                      maxLength={1000}
                      placeholder="Approval note (optional)"
                      className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      className="h-11 rounded-xl bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-700"
                    >
                      Approve cancellation
                    </button>
                  </form>
                  <form
                    action={rejectCancellationRequestAction}
                    className="grid gap-2 sm:grid-cols-[1fr_auto]"
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input
                      name="rejectionReason"
                      aria-label={`Rejection reason for ${order.orderNumber}`}
                      required
                      maxLength={1000}
                      placeholder="Rejection reason (required)"
                      className="h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
                    >
                      Reject & resume
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          {cancellationCount > cancellationOrders.length ? (
            <p className="border-t border-slate-100 px-5 py-3 text-xs font-bold text-slate-500 dark:border-white/5 dark:text-slate-400">
              Showing the 5 oldest requests. Complete a decision to load the
              next request.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(390px,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">
                  Team work queue
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {totalMatching} matching assignment
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
                <span className="sr-only">Search physical assignments</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Order, dealer, team or product..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-violet-500/40"
                />
              </label>
              <button
                type="submit"
                className="h-11 shrink-0 rounded-xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700"
              >
                Search
              </button>
              {q ? (
                <Link
                  href={buildHref(queryState, {
                    q: "",
                    page: 1,
                    assignment: null,
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
                      assignment: null,
                    })}
                    className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-black transition ${
                      active
                        ? "bg-slate-950 text-white dark:bg-violet-600"
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

          {assignments.length === 0 ? (
            <OperationsEmptyState
              icon="quality"
              title="No matching physical checks"
              description={
                q || status !== "all"
                  ? "Try a different search or clear the queue filters."
                  : "New assignments appear after Order Receiving assigns product lines to a Physical Team."
              }
              action={
                q || status !== "all" ? (
                  <Link
                    href="/internal/dispatch"
                    className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-violet-600"
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
                      {["Order & dealer", "Team", "Status", "Quantity", "Updated", ""].map(
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
                    {assignments.map((assignment) => {
                      const assignedQuantity = assignment.items.reduce(
                        (sum, item) => sum + item.assignedQuantity,
                        0,
                      );
                      const verifiedQuantity = assignment.items.reduce(
                        (sum, item) => sum + (item.verifiedQuantity ?? 0),
                        0,
                      );
                      const selected = assignment.id === selectedAssignmentId;

                      return (
                        <tr
                          key={assignment.id}
                          className={
                            selected
                              ? "bg-violet-50/80 dark:bg-violet-500/10"
                              : "transition hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                          }
                        >
                          <td className="px-4 py-4">
                            <Link
                              href={`${buildHref(queryState, {
                                assignment: assignment.id,
                              })}#assignment-detail`}
                              className="font-black text-slate-950 hover:text-violet-700 dark:text-white dark:hover:text-violet-300"
                            >
                              {assignment.order.orderNumber}
                            </Link>
                            <p className="mt-1 max-w-44 truncate text-xs text-slate-500 dark:text-slate-400">
                              {assignment.order.dealer.name}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                            {assignment.team.name}
                          </td>
                          <td className="px-4 py-4">
                            <OperationsStatusPill
                              tone={getAssignmentTone(assignment.status)}
                            >
                              {getAssignmentStatusLabel(assignment.status)}
                            </OperationsStatusPill>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                              {verifiedQuantity} / {assignedQuantity}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              verified
                            </p>
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                            {compactDate(assignment.updatedAt)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`${buildHref(queryState, {
                                assignment: assignment.id,
                              })}#assignment-detail`}
                              aria-label={`Open ${assignment.order.orderNumber} physical check`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
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
                {assignments.map((assignment) => {
                  const assignedQuantity = assignment.items.reduce(
                    (sum, item) => sum + item.assignedQuantity,
                    0,
                  );
                  const verifiedQuantity = assignment.items.reduce(
                    (sum, item) => sum + (item.verifiedQuantity ?? 0),
                    0,
                  );
                  const selected = assignment.id === selectedAssignmentId;

                  return (
                    <Link
                      key={assignment.id}
                      href={`${buildHref(queryState, {
                        assignment: assignment.id,
                      })}#assignment-detail`}
                      className={`block p-4 transition ${
                        selected
                          ? "bg-violet-50 dark:bg-violet-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950 dark:text-white">
                            {assignment.order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {assignment.order.dealer.name} ·{" "}
                            {assignment.team.name}
                          </p>
                        </div>
                        <ErpIcon
                          name="chevron-right"
                          className="h-4 w-4 shrink-0 text-slate-400"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <OperationsStatusPill
                          tone={getAssignmentTone(assignment.status)}
                        >
                          {getAssignmentStatusLabel(assignment.status)}
                        </OperationsStatusPill>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {verifiedQuantity}/{assignedQuantity} verified
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
                      assignment: null,
                    })}
                    aria-disabled={page <= 1}
                    className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-black ${
                      page <= 1
                        ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                        : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:text-slate-300"
                    }`}
                  >
                    Previous
                  </Link>
                  <Link
                    href={buildHref(queryState, {
                      page: Math.min(totalPages, page + 1),
                      assignment: null,
                    })}
                    aria-disabled={page >= totalPages}
                    className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-black ${
                      page >= totalPages
                        ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                        : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:text-slate-300"
                    }`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        <div id="assignment-detail" className="min-w-0 scroll-mt-24">
          {!selectedAssignment ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
              <OperationsEmptyState
                icon="orders"
                title="Select a physical assignment"
                description="Choose an item from the queue to review its products, team and available actions."
              />
            </div>
          ) : (
            <article className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              {(() => {
                const canStart = (
                  [
                    PhysicalCheckStatus.ASSIGNED,
                    PhysicalCheckStatus.QC_REWORK,
                  ] as PhysicalCheckStatus[]
                ).includes(selectedAssignment.status);
                const canComplete = (
                  [
                    PhysicalCheckStatus.IN_PROGRESS,
                    PhysicalCheckStatus.ISSUE_REPORTED,
                    PhysicalCheckStatus.QC_REWORK,
                  ] as PhysicalCheckStatus[]
                ).includes(selectedAssignment.status);
                const assignedQuantity = selectedAssignment.items.reduce(
                  (sum, item) => sum + item.assignedQuantity,
                  0,
                );
                const verifiedQuantity = selectedAssignment.items.reduce(
                  (sum, item) => sum + (item.verifiedQuantity ?? 0),
                  0,
                );
                const damagedQuantity = selectedAssignment.items.reduce(
                  (sum, item) => sum + item.damagedQuantity,
                  0,
                );
                const shortQuantity = selectedAssignment.items.reduce(
                  (sum, item) => sum + item.shortQuantity,
                  0,
                );
                const healthyLines = selectedAssignment.items.filter(
                  (item) =>
                    item.verifiedQuantity === item.assignedQuantity &&
                    item.damagedQuantity === 0 &&
                    item.shortQuantity === 0,
                ).length;

                return (
                  <>
                    <header className="relative overflow-hidden border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
                      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-100/70 blur-3xl dark:bg-violet-500/10" />
                      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Assignment detail
                          </p>
                          <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                            {selectedAssignment.order.orderNumber}
                          </h2>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {selectedAssignment.order.dealer.name} ·{" "}
                            {selectedAssignment.team.name}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <OperationsStatusPill
                            tone={getAssignmentTone(selectedAssignment.status)}
                          >
                            {getAssignmentStatusLabel(
                              selectedAssignment.status,
                            )}
                          </OperationsStatusPill>
                          <OperationsStatusPill
                            tone={getOrderTone(
                              selectedAssignment.order.status,
                            )}
                          >
                            {getOrderStatusLabel(
                              selectedAssignment.order.status,
                            )}
                          </OperationsStatusPill>
                        </div>
                      </div>
                    </header>

                    <div className="space-y-5 p-5 sm:p-6">
                      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Assigned", assignedQuantity, "slate"],
                          ["Verified", verifiedQuantity, "emerald"],
                          ["Damaged", damagedQuantity, "rose"],
                          ["Short", shortQuantity, "amber"],
                        ].map(([label, value, tone]) => (
                          <div
                            key={label}
                            className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100 dark:bg-slate-950/70 dark:ring-white/5"
                          >
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                              {label}
                            </p>
                            <p
                              className={`mt-2 text-2xl font-black ${
                                tone === "emerald"
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : tone === "rose"
                                    ? "text-rose-700 dark:text-rose-300"
                                    : tone === "amber"
                                      ? "text-amber-700 dark:text-amber-300"
                                      : "text-slate-950 dark:text-white"
                              }`}
                            >
                              {value}
                            </p>
                          </div>
                        ))}
                      </section>

                      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-black text-slate-950 dark:text-white">
                              Team & verification context
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              Assigned {formatDateTime(selectedAssignment.assignedAt)}
                              {" · "}by{" "}
                              {selectedAssignment.assignedByName || "System"}
                            </p>
                          </div>
                          <OperationsStatusPill
                            tone={
                              healthyLines === selectedAssignment.items.length &&
                              selectedAssignment.items.length > 0
                                ? "emerald"
                                : "amber"
                            }
                          >
                            {healthyLines}/{selectedAssignment.items.length} clean
                            lines
                          </OperationsStatusPill>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedAssignment.team.members.length > 0 ? (
                            selectedAssignment.team.members.map((member) => (
                              <span
                                key={member.id}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                                title={member.user.email}
                              >
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-50 text-[9px] font-black text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                                  {member.user.name
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join("")
                                    .toUpperCase()}
                                </span>
                                {member.user.name}
                              </span>
                            ))
                          ) : (
                            <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                              No active members are currently assigned.
                            </p>
                          )}
                        </div>
                      </section>

                      {selectedAssignment.qcNotes ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                          <p className="font-black">QC rework instruction</p>
                          <p className="mt-1 leading-6">
                            {selectedAssignment.qcNotes}
                          </p>
                        </div>
                      ) : null}

                      {selectedAssignment.issueNotes ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                          <p className="font-black">
                            Current blocker ·{" "}
                            {selectedAssignment.issueType
                              ?.replaceAll("_", " ")
                              .toLowerCase() || "Issue"}
                          </p>
                          <p className="mt-1 leading-6">
                            {selectedAssignment.issueNotes}
                          </p>
                        </div>
                      ) : null}

                      {isManagement &&
                      selectedAssignment.status ===
                        PhysicalCheckStatus.ISSUE_REPORTED ? (
                        <form
                          action={resolvePhysicalBlockerAction}
                          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10"
                        >
                          <input
                            type="hidden"
                            name="assignmentId"
                            value={selectedAssignment.id}
                          />
                          <h3 className="font-black text-amber-950 dark:text-amber-100">
                            Resolve complete-stock blocker
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200/80">
                            Use only after the complete ordered quantity is
                            available. This clears the old check and requires a
                            full restart.
                          </p>
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                              name="resolutionNote"
                              maxLength={500}
                              placeholder="Explain how the full stock blocker was resolved"
                              className="h-11 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-4 text-sm outline-none focus:border-amber-400 dark:border-amber-500/20 dark:bg-slate-950"
                              required
                            />
                            <button
                              type="submit"
                              className="h-11 rounded-xl bg-amber-600 px-5 text-sm font-black text-white transition hover:bg-amber-700"
                            >
                              Resolve & require restart
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {canStart ? (
                        <form
                          action={startPhysicalCheckAction}
                          className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <input
                            type="hidden"
                            name="assignmentId"
                            value={selectedAssignment.id}
                          />
                          <div>
                            <h3 className="font-black text-blue-950 dark:text-blue-100">
                              {selectedAssignment.status ===
                              PhysicalCheckStatus.QC_REWORK
                                ? "Restart the complete verification"
                                : "Ready to begin this assignment?"}
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-blue-800 dark:text-blue-200/80">
                              Quantities are saved only after the assignment is
                              actively checked and submitted.
                            </p>
                          </div>
                          <button
                            type="submit"
                            className="h-11 shrink-0 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700"
                          >
                            {selectedAssignment.status ===
                            PhysicalCheckStatus.QC_REWORK
                              ? "Start QC rework"
                              : "Start physical check"}
                          </button>
                        </form>
                      ) : null}

                      <form action={completePhysicalCheckAction}>
                        <input
                          type="hidden"
                          name="assignmentId"
                          value={selectedAssignment.id}
                        />
                        <div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <h3 className="text-lg font-black text-slate-950 dark:text-white">
                                Product verification
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                Verified quantity is the physically found
                                quantity. Damaged quantity must be part of the
                                verified quantity.
                              </p>
                            </div>
                            <span className="text-xs font-bold text-slate-400">
                              {selectedAssignment.items.length} line
                              {selectedAssignment.items.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            {selectedAssignment.items.map((item, index) => {
                              const product = item.orderItem.product;
                              return (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
                                        Line {index + 1} · {product.code}
                                      </p>
                                      <h4 className="mt-1 break-words font-black text-slate-950 dark:text-white">
                                        {product.name}
                                      </h4>
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {product.brand.name} ·{" "}
                                        {product.category.name} ·{" "}
                                        {item.assignedQuantity} {product.unit}{" "}
                                        assigned
                                      </p>
                                    </div>
                                    <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 dark:bg-white/5 dark:text-slate-300">
                                      System available: {product.quantity}
                                    </span>
                                  </div>

                                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[130px_130px_minmax(0,1fr)]">
                                    <label>
                                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                        Verified
                                      </span>
                                      <input
                                        name={`verifiedQuantity__${item.id}`}
                                        type="number"
                                        min={0}
                                        max={item.assignedQuantity}
                                        step={1}
                                        defaultValue={
                                          item.verifiedQuantity ??
                                          item.assignedQuantity
                                        }
                                        disabled={!canComplete}
                                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                                        required
                                      />
                                    </label>
                                    <label>
                                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                        Damaged
                                      </span>
                                      <input
                                        name={`damagedQuantity__${item.id}`}
                                        type="number"
                                        min={0}
                                        max={item.assignedQuantity}
                                        step={1}
                                        defaultValue={item.damagedQuantity}
                                        disabled={!canComplete}
                                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                                      />
                                    </label>
                                    <label>
                                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                        Product note
                                      </span>
                                      <input
                                        name={`notes__${item.id}`}
                                        defaultValue={item.notes ?? ""}
                                        disabled={!canComplete}
                                        placeholder="Condition, batch or mismatch note"
                                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {canComplete ? (
                          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50">
                            <h3 className="font-black text-slate-950 dark:text-white">
                              Final result
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              Leave the issue fields empty only when every
                              assigned product is fully available and physically
                              correct.
                            </p>
                            <div className="mt-4 grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
                              <label>
                                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                  Issue type
                                </span>
                                <select
                                  name="issueType"
                                  defaultValue=""
                                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-300 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                                >
                                  <option value="">No issue</option>
                                  <option value="SHORT_QUANTITY">
                                    Short Quantity
                                  </option>
                                  <option value="DAMAGED_PRODUCT">
                                    Damaged Product
                                  </option>
                                  <option value="WRONG_PRODUCT">
                                    Wrong Product
                                  </option>
                                  <option value="QUANTITY_MISMATCH">
                                    Quantity Mismatch
                                  </option>
                                  <option value="PRODUCT_UNAVAILABLE">
                                    Product Unavailable
                                  </option>
                                  <option value="OTHER">Other</option>
                                </select>
                              </label>
                              <label>
                                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                  Issue notes
                                </span>
                                <input
                                  name="issueNotes"
                                  maxLength={1000}
                                  placeholder="Explain the blocker clearly for receiving and management"
                                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-rose-300 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                                />
                              </label>
                            </div>

                            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                              <p className="max-w-lg text-xs leading-5 text-slate-500 dark:text-slate-400">
                                A clean result reserves the complete order
                                quantity. Any shortage or damage creates a
                                blocker and keeps QC locked.
                              </p>
                              <button
                                type="submit"
                                className="h-11 shrink-0 rounded-xl bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-700"
                              >
                                Save complete physical check
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                            {selectedAssignment.status ===
                              PhysicalCheckStatus.ASSIGNED ||
                            selectedAssignment.status ===
                              PhysicalCheckStatus.QC_REWORK
                              ? "Start the assignment before saving verification."
                              : "This assignment is already ready for QC or completed."}
                          </div>
                        )}
                      </form>

                      <section className="border-t border-slate-200 pt-5 dark:border-white/10">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-black text-slate-950 dark:text-white">
                              Recent order activity
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Latest workflow transitions for this order.
                            </p>
                          </div>
                          <Link
                            href={`/internal/orders?order=${selectedAssignment.order.id}`}
                            className="text-xs font-black text-violet-700 hover:text-violet-800 dark:text-violet-300"
                          >
                            Full order record
                          </Link>
                        </div>
                        <div className="mt-4 space-y-3">
                          {selectedAssignment.order.statusHistory.length > 0 ? (
                            selectedAssignment.order.statusHistory.map(
                              (event, index) => (
                                <div
                                  key={event.id}
                                  className="grid grid-cols-[18px_minmax(0,1fr)] gap-3"
                                >
                                  <div className="flex flex-col items-center">
                                    <span
                                      className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                                        index === 0
                                          ? "bg-violet-500"
                                          : "bg-slate-300 dark:bg-slate-600"
                                      }`}
                                    />
                                    {index <
                                    selectedAssignment.order.statusHistory
                                      .length -
                                      1 ? (
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
                              ),
                            )
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
