import Link from "next/link";
import type { ReactNode } from "react";
import { OrderStatus, PhysicalCheckStatus } from "@/generated/prisma/client";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  getDarkOrderStatusClass,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";
import {
  assignPhysicalTeamsAction,
  confirmOrderReceivedAction,
} from "./actions";

const PAGE_SIZE = 10;

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.NEW_ORDER,
  OrderStatus.PENDING_TEAM_ASSIGNMENT,
  OrderStatus.PHYSICAL_CHECK_ASSIGNED,
  OrderStatus.PHYSICAL_CHECK_IN_PROGRESS,
  OrderStatus.PHYSICAL_CHECK_ISSUE,
  OrderStatus.QC_REWORK,
  OrderStatus.PENDING_STOCK_CHECK,
  OrderStatus.STOCK_CHECKED,
  OrderStatus.STOCK_BLOCKED,
  OrderStatus.BACKORDERED,
  OrderStatus.PENDING_QC,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.QC_APPROVED,
  OrderStatus.TRANSPORT_ASSIGNED,
];

const STAGE_STATUS_MAP: Record<string, OrderStatus[]> = {
  receiving: [OrderStatus.NEW_ORDER, OrderStatus.PENDING_TEAM_ASSIGNMENT],
  assignment: [OrderStatus.PHYSICAL_CHECK_ASSIGNED],
  physical: [
    OrderStatus.PHYSICAL_CHECK_IN_PROGRESS,
    OrderStatus.PHYSICAL_CHECK_ISSUE,
    OrderStatus.QC_REWORK,
    OrderStatus.PENDING_STOCK_CHECK,
    OrderStatus.STOCK_CHECKED,
    OrderStatus.STOCK_BLOCKED,
      OrderStatus.BACKORDERED,
  ],
  qc: [OrderStatus.PENDING_QC, OrderStatus.READY_FOR_DISPATCH],
  ready: [OrderStatus.QC_APPROVED, OrderStatus.TRANSPORT_ASSIGNED],
};

const stageFilters = [
  { key: "all", label: "All Active" },
  { key: "receiving", label: "Receiving" },
  { key: "assignment", label: "Team Assignment" },
  { key: "physical", label: "Physical Check" },
  { key: "qc", label: "QC Review" },
  { key: "ready", label: "Ready for Delivery" },
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

function getMessage(error?: string, success?: string) {
  const successMessages: Record<string, string> = {
    "order-received":
      "Order confirmed. Assign every product to a Physical Team to continue.",
    "receiving-updated": "Receiving notes updated successfully.",
    "teams-assigned":
      "Physical Teams assigned. The order is now visible to the selected teams.",
  };

  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission to manage order receiving.",
    "missing-order": "Order id is missing.",
    "order-not-found": "Selected order was not found.",
    "invalid-status": "Only a new order can be confirmed here.",
    "assignment-status-locked":
      "This order has moved beyond the team-assignment stage.",
    "assignment-already-started":
      "Physical checking has started, so team assignments are locked.",
    "no-order-items": "No products were found in this order.",
    "all-products-require-team": "Select a Physical Team for every product.",
    "invalid-physical-team":
      "Select only active Physical Teams that have at least one active member.",
  };

  if (success && successMessages[success]) {
    return { type: "success" as const, text: successMessages[success] };
  }

  if (error && errorMessages[error]) {
    return { type: "error" as const, text: errorMessages[error] };
  }

  return null;
}

function getStageMeta(status: OrderStatus) {
  if (status === OrderStatus.NEW_ORDER) {
    return { label: "Awaiting receipt", tone: "blue", step: 0 };
  }
  if (status === OrderStatus.PENDING_TEAM_ASSIGNMENT) {
    return { label: "Assign physical teams", tone: "indigo", step: 1 };
  }
  if (status === OrderStatus.PHYSICAL_CHECK_ASSIGNED) {
    return { label: "Assigned to teams", tone: "violet", step: 2 };
  }
  if (
    ([
      OrderStatus.PHYSICAL_CHECK_IN_PROGRESS,
      OrderStatus.PENDING_STOCK_CHECK,
      OrderStatus.STOCK_CHECKED,
      OrderStatus.STOCK_BLOCKED,
      OrderStatus.BACKORDERED,
    ] as OrderStatus[]).includes(status)
  ) {
    return { label: "Physical verification", tone: "amber", step: 2 };
  }
  if (
    ([OrderStatus.PHYSICAL_CHECK_ISSUE, OrderStatus.QC_REWORK] as OrderStatus[]).includes(status)
  ) {
    return { label: "Blocked / rework", tone: "rose", step: 2 };
  }
  if (
    ([OrderStatus.PENDING_QC, OrderStatus.READY_FOR_DISPATCH] as OrderStatus[]).includes(status)
  ) {
    return { label: "Waiting for QC", tone: "purple", step: 3 };
  }
  if (
    ([OrderStatus.QC_APPROVED, OrderStatus.TRANSPORT_ASSIGNED] as OrderStatus[]).includes(status)
  ) {
    return { label: "Ready for delivery", tone: "emerald", step: 4 };
  }

  return { label: getOrderStatusLabel(status), tone: "slate", step: 0 };
}

function stagePill(tone: string) {
  const map: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/20",
    indigo:
      "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-500/20",
    violet:
      "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20",
    amber:
      "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20",
    rose: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/20",
    purple:
      "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-200 dark:ring-purple-500/20",
    emerald:
      "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20",
    slate:
      "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10",
  };

  return map[tone] ?? map.slate;
}

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    receive: (
      <>
        <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
        <path d="M4 7.5V16l8 5 8-5V7.5" />
        <path d="M12 12v9" />
      </>
    ),
    team: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    check: (
      <>
        <path d="M9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    qc: (
      <>
        <path d="M9 3h6" />
        <path d="M10 9h4" />
        <path d="M10 3v5.5L5.5 17a2.5 2.5 0 0 0 2.2 4h8.6a2.5 2.5 0 0 0 2.2-4L14 8.5V3" />
      </>
    ),
    truck: (
      <>
        <path d="M10 17h4V5H2v12h3" />
        <path d="M14 9h4l4 4v4h-3" />
        <circle cx="7.5" cy="17.5" r="2.5" />
        <circle cx="16.5" cy="17.5" r="2.5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    close: (
      <>
        <path d="m18 6-12 12" />
        <path d="m6 6 12 12" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] ?? paths.check}
    </svg>
  );
}

function buildHref(
  params: { q?: string; stage?: string; page?: number; order?: string },
  patch: Partial<{ q: string; stage: string; page: number; order: string | null }>,
) {
  const next = new URLSearchParams();
  const values = { ...params, ...patch };

  if (values.q) next.set("q", values.q);
  if (values.stage && values.stage !== "all") next.set("stage", values.stage);
  if (values.page && values.page > 1) next.set("page", String(values.page));
  if (values.order) next.set("order", values.order);

  const query = next.toString();
  return query ? `/internal/order-receiving?${query}` : "/internal/order-receiving";
}

function progressForStatus(status: OrderStatus) {
  const { step } = getStageMeta(status);
  return [12, 28, 52, 76, 100][step] ?? 12;
}

export default async function OrderReceivingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    q?: string;
    stage?: string;
    page?: string;
    order?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const q = String(params?.q ?? "").trim();
  const stage = stageFilters.some((item) => item.key === params?.stage)
    ? String(params?.stage)
    : "all";
  const page = Math.max(1, Number.parseInt(params?.page ?? "1", 10) || 1);
  const selectedOrderId = String(params?.order ?? "").trim();

  const { hasAccess } = await checkPermission(
    "manage_order_receiving",
    "/internal/order-receiving",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Workflow Control Access Denied"
        description="Only authorized Order Receiving users can receive orders and assign Physical Teams."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const stageStatuses = stage === "all" ? ACTIVE_STATUSES : STAGE_STATUS_MAP[stage] ?? ACTIVE_STATUSES;
  const searchWhere = q
    ? {
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" as const } },
          {
            dealer: {
              is: {
                name: { contains: q, mode: "insensitive" as const },
              },
            },
          },
          {
            items: {
              some: {
                product: {
                  is: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" as const } },
                      { code: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                },
              },
            },
          },
        ],
      }
    : {};

  const orderInclude = {
    dealer: { select: { name: true, email: true, phone: true } },
    assignedDriver: { select: { name: true, phone: true } },
    transportOption: { select: { name: true } },
    items: {
      include: {
        product: {
          include: {
            category: true,
            brand: true,
          },
        },
        physicalAssignmentItem: {
          include: {
            assignment: {
              include: {
                team: true,
              },
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
              include: { product: true },
            },
          },
        },
      },
      orderBy: { assignedAt: "asc" as const },
    },
    statusHistory: {
      orderBy: { createdAt: "desc" as const },
      take: 8,
    },
  };

  const where = {
    status: { in: stageStatuses },
    ...searchWhere,
  };

  const [
    totalMatching,
    physicalTeams,
    newCount,
    physicalCount,
    qcCount,
    blockedCount,
    readyCount,
  ] = await Promise.all([
    prisma.order.count({ where }),
    prisma.workTeam.findMany({
      where: {
        isActive: true,
        teamType: "PHYSICAL_DISPATCH",
        members: { some: { user: { status: "ACTIVE" } } },
      },
      include: {
        members: {
          where: { user: { status: "ACTIVE" } },
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.order.count({ where: { status: OrderStatus.NEW_ORDER } }),
    prisma.order.count({
      where: {
        status: {
          in: [
            OrderStatus.PHYSICAL_CHECK_ASSIGNED,
            OrderStatus.PHYSICAL_CHECK_IN_PROGRESS,
            OrderStatus.PENDING_STOCK_CHECK,
            OrderStatus.STOCK_CHECKED,
            OrderStatus.STOCK_BLOCKED,
                  OrderStatus.BACKORDERED,
          ],
        },
      },
    }),
    prisma.order.count({
      where: {
        status: { in: [OrderStatus.PENDING_QC, OrderStatus.READY_FOR_DISPATCH] },
      },
    }),
    prisma.order.count({
      where: {
        status: { in: [OrderStatus.PHYSICAL_CHECK_ISSUE, OrderStatus.QC_REWORK] },
      },
    }),
    prisma.order.count({
      where: {
        status: { in: [OrderStatus.QC_APPROVED, OrderStatus.TRANSPORT_ASSIGNED] },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const [orders, selectedOrder] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    selectedOrderId
      ? prisma.order.findUnique({
          where: { id: selectedOrderId },
          include: orderInclude,
        })
      : Promise.resolve(null),
  ]);

  const queryState = { q, stage, page: safePage, order: selectedOrderId };

  const metricCards = [
    {
      label: "New Orders",
      value: newCount,
      helper: "Waiting to be received",
      icon: "receive",
      tone: "blue",
    },
    {
      label: "Physical Checks",
      value: physicalCount,
      helper: "Assigned or in progress",
      icon: "check",
      tone: "amber",
    },
    {
      label: "Waiting for QC",
      value: qcCount,
      helper: "Ready for quality review",
      icon: "qc",
      tone: "purple",
    },
    {
      label: "Blocked / Rework",
      value: blockedCount,
      helper: "Needs immediate attention",
      icon: "alert",
      tone: "rose",
    },
    {
      label: "Ready for Delivery",
      value: readyCount,
      helper: "QC approved orders",
      icon: "truck",
      tone: "emerald",
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="relative px-5 py-6 sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-blue-600 dark:text-blue-300">
                Phase 2 Operations
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Order Workflow Control
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Receive dealer orders, assign product lines to Physical Teams, monitor verification, QC and delivery readiness from one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/internal/teams"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
              >
                <Icon name="team" className="h-4 w-4" />
                Physical Teams
              </Link>
              <Link
                href="/internal/dispatch"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Open Team Work
                <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl border px-5 py-4 text-sm font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  {card.label}
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">
                  {card.value}
                </p>
              </div>
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${stagePill(card.tone)}`}>
                <Icon name={card.icon} className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-slate-400 dark:text-slate-500">
              {card.helper}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">
              Live Order Journey
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The next stage unlocks only after the previous stage is completed.
            </p>
          </div>
          <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 sm:inline-flex dark:bg-blue-500/15 dark:text-blue-200">
            {physicalTeams.length} active physical teams
          </span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {[
            ["1", "Order Receiving", "Confirm order details", "receive", "blue"],
            ["2", "Team Assignment", "Assign every product", "team", "indigo"],
            ["3", "Physical Verification", "Qty, damage & shortage", "check", "amber"],
            ["4", "QC Review", "Approve or return rework", "qc", "purple"],
            ["5", "Delivery Ready", "Assign transport & driver", "truck", "emerald"],
          ].map(([number, title, helper, icon, tone], index) => (
            <div key={title} className="relative">
              {index < 4 ? (
                <span className="absolute left-[calc(50%+30px)] top-6 hidden h-px w-[calc(100%-60px)] bg-slate-200 lg:block dark:bg-white/10" />
              ) : null}
              <div className="relative rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/70">
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${stagePill(tone)}`}>
                    <Icon name={icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Stage {number}
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-950 dark:text-white">
                      {title}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {helper}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {physicalTeams.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black">Physical Team required</h2>
              <p className="mt-1 text-sm leading-6 opacity-80">
                Create at least one active Physical Team with members before assigning order products.
              </p>
            </div>
            <Link
              href="/internal/teams#create-team"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-black text-white"
            >
              Create Physical Team
            </Link>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">
                Active Workflow Queue
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {totalMatching} matching order{totalMatching === 1 ? "" : "s"}. Select any row to open the workflow drawer.
              </p>
            </div>

            <form method="get" className="flex w-full flex-col gap-2 sm:flex-row xl:max-w-2xl">
              {stage !== "all" ? <input type="hidden" name="stage" value={stage} /> : null}
              <label className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Icon name="search" className="h-4 w-4" />
                </span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search order, dealer or product..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500/40"
                />
              </label>
              <button className="h-11 shrink-0 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700">
                Search
              </button>
              {q ? (
                <Link
                  href={buildHref(queryState, { q: "", page: 1, order: null })}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 dark:border-white/10 dark:text-slate-300"
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {stageFilters.map((item) => {
              const active = stage === item.key;
              return (
                <Link
                  key={item.key}
                  href={buildHref(queryState, { stage: item.key, page: 1, order: null })}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${
                    active
                      ? "bg-slate-950 text-white dark:bg-blue-600"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1080px] w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left dark:border-white/10 dark:bg-slate-950/60">
                {[
                  "Order",
                  "Dealer",
                  "Products",
                  "Current Stage",
                  "Physical Teams",
                  "Issues",
                  "Updated",
                  "",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {orders.map((order) => {
                const stageMeta = getStageMeta(order.status);
                const issues = order.physicalAssignments.filter(
                  (assignment) =>
                    assignment.issueType ||
                    assignment.status === PhysicalCheckStatus.ISSUE_REPORTED ||
                    assignment.status === PhysicalCheckStatus.QC_REWORK,
                );
                const teamNames = Array.from(
                  new Set(order.physicalAssignments.map((assignment) => assignment.team.name)),
                );
                const selected = order.id === selectedOrderId;

                return (
                  <tr
                    key={order.id}
                    className={`group transition ${
                      selected
                        ? "bg-blue-50/80 dark:bg-blue-500/10"
                        : "hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                    }`}
                  >
                    <td className="px-4 py-4 align-middle">
                      <Link
                        href={buildHref(queryState, { order: order.id })}
                        className="block"
                      >
                        <p className="text-sm font-black text-blue-700 dark:text-blue-300">
                          {order.orderNumber}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {compactDate(order.createdAt)}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <p className="max-w-[180px] truncate text-sm font-bold text-slate-900 dark:text-white">
                        {order.dealer.name}
                      </p>
                      <p className="mt-1 max-w-[180px] truncate text-xs text-slate-400">
                        {order.dealer.phone || order.dealer.email}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        {order.items.length} line{order.items.length === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 max-w-[175px] truncate text-xs text-slate-400">
                        {order.items.map((item) => item.product.name).join(", ")}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ring-1 ${stagePill(stageMeta.tone)}`}>
                        {stageMeta.label}
                      </span>
                      <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${progressForStatus(order.status)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      {teamNames.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {teamNames.slice(0, 2).map((name) => (
                            <span
                              key={name}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300"
                            >
                              {name}
                            </span>
                          ))}
                          {teamNames.length > 2 ? (
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 dark:bg-white/5 dark:text-slate-400">
                              +{teamNames.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      {issues.length ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20">
                          <Icon name="alert" className="h-3.5 w-3.5" />
                          {issues.length} issue{issues.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Clear
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-middle text-xs font-medium text-slate-500 dark:text-slate-400">
                      {compactDate(order.updatedAt)}
                    </td>
                    <td className="px-4 py-4 text-right align-middle">
                      <Link
                        href={buildHref(queryState, { order: order.id })}
                        aria-label={`Open ${order.orderNumber}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition group-hover:border-blue-200 group-hover:text-blue-700 dark:border-white/10 dark:text-slate-300 dark:group-hover:border-blue-500/30 dark:group-hover:text-blue-200"
                      >
                        <Icon name="arrow" className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/5 lg:hidden">
          {orders.map((order) => {
            const stageMeta = getStageMeta(order.status);
            const issues = order.physicalAssignments.filter(
              (assignment) => assignment.issueType || assignment.status === PhysicalCheckStatus.ISSUE_REPORTED,
            ).length;
            return (
              <Link
                key={order.id}
                href={buildHref(queryState, { order: order.id })}
                className="block p-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.035]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-blue-700 dark:text-blue-300">
                      {order.orderNumber}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">
                      {order.dealer.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {order.items.length} product line{order.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Icon name="arrow" className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${stagePill(stageMeta.tone)}`}>
                    {stageMeta.label}
                  </span>
                  {issues ? (
                    <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                      {issues} issue{issues === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>

        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
              <Icon name="search" className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">
              No matching workflow orders
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Change the stage filter or search term to see more orders.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Showing {orders.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safePage * PAGE_SIZE, totalMatching)} of {totalMatching}
          </p>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={safePage <= 1}
              href={safePage <= 1 ? "#" : buildHref(queryState, { page: safePage - 1, order: null })}
              className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-black ${
                safePage <= 1
                  ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                  : "border-slate-200 text-slate-600 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"
              }`}
            >
              Previous
            </Link>
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-slate-950 px-3 text-xs font-black text-white dark:bg-blue-600">
              {safePage} / {totalPages}
            </span>
            <Link
              aria-disabled={safePage >= totalPages}
              href={safePage >= totalPages ? "#" : buildHref(queryState, { page: safePage + 1, order: null })}
              className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-black ${
                safePage >= totalPages
                  ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                  : "border-slate-200 text-slate-600 hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      </section>

      {selectedOrder ? (
        <>
          <Link
            href={buildHref(queryState, { order: null })}
            aria-label="Close workflow drawer"
            className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[2px] lg:left-72 lg:top-[88px]"
          />
          <aside
            className="fixed bottom-0 right-0 top-0 z-[80] overflow-y-auto border-l border-slate-200 bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-slate-950"
            style={{ width: "min(520px, 100vw)" }}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600 dark:text-blue-300">
                    Workflow Order
                  </p>
                  <h2 className="mt-2 truncate text-2xl font-black text-slate-950 dark:text-white">
                    {selectedOrder.orderNumber}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${getDarkOrderStatusClass(selectedOrder.status)}`}>
                      {getOrderStatusLabel(selectedOrder.status)}
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      Updated {compactDate(selectedOrder.updatedAt)}
                    </span>
                  </div>
                </div>
                <Link
                  href={buildHref(queryState, { order: null })}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:text-rose-600 dark:border-white/10 dark:text-slate-300"
                  aria-label="Close"
                >
                  <Icon name="close" className="h-5 w-5" />
                </Link>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Dealer</p>
                  <p className="mt-2 truncate text-sm font-black text-slate-950 dark:text-white">
                    {selectedOrder.dealer.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {selectedOrder.dealer.phone || selectedOrder.dealer.email}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Products</p>
                  <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                    {selectedOrder.items.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Product lines in this order
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-950 dark:text-white">Order Journey</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Live stage progress</p>
                  </div>
                  <span className="text-xs font-black text-blue-600 dark:text-blue-300">
                    {progressForStatus(selectedOrder.status)}%
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500"
                    style={{ width: `${progressForStatus(selectedOrder.status)}%` }}
                  />
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    {
                      title: "Order placed",
                      done: true,
                      detail: formatDateTime(selectedOrder.createdAt),
                    },
                    {
                      title: "Order received",
                      done: Boolean(selectedOrder.receivedAt),
                      detail: selectedOrder.receivedAt
                        ? `${selectedOrder.receivedByName ?? "Receiving team"} · ${formatDateTime(selectedOrder.receivedAt)}`
                        : "Waiting for receiving confirmation",
                    },
                    {
                      title: "Physical Teams assigned",
                      done: selectedOrder.physicalAssignments.length > 0,
                      detail: selectedOrder.physicalAssignments.length
                        ? `${selectedOrder.physicalAssignments.length} team assignment(s)`
                        : "Every product requires a team",
                    },
                    {
                      title: "Physical verification",
                      done:
                        selectedOrder.physicalAssignments.length > 0 &&
                        selectedOrder.physicalAssignments.every((assignment) =>
                          ([PhysicalCheckStatus.READY_FOR_QC, PhysicalCheckStatus.COMPLETED] as PhysicalCheckStatus[]).includes(assignment.status),
                        ),
                      detail:
                        selectedOrder.status === OrderStatus.PHYSICAL_CHECK_ISSUE
                          ? "Issue reported — blocker resolution required"
                          : "Quantity, damage and shortage check",
                    },
                    {
                      title: "QC approval & delivery readiness",
                      done: ([OrderStatus.QC_APPROVED, OrderStatus.TRANSPORT_ASSIGNED] as OrderStatus[]).includes(selectedOrder.status),
                      detail: selectedOrder.assignedDriver
                        ? `${selectedOrder.assignedDriver.name} · ${selectedOrder.transportOption?.name ?? selectedOrder.transportLabel ?? "Transport assigned"}`
                        : "QC approval unlocks driver assignment",
                    },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          item.done
                            ? "bg-emerald-500 text-white"
                            : "border-2 border-slate-200 bg-white text-slate-300 dark:border-white/15 dark:bg-slate-950 dark:text-slate-600"
                        }`}
                      >
                        {item.done ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-950 dark:text-white">Products & Team Responsibility</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Product-wise assignment and verification</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedOrder.items.map((item) => {
                    const assignmentItem = item.physicalAssignmentItem;
                    const assignment = assignmentItem?.assignment;
                    const requested = item.requestedQuantity || item.quantity;
                    return (
                      <div key={item.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950 dark:text-white">{item.product.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.product.code} · {item.product.brand.name} · {item.product.unit}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-black text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                            {requested.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                            <p className="text-slate-400">Physical Team</p>
                            <p className="mt-1 truncate font-black text-slate-800 dark:text-slate-100">
                              {assignment?.team.name ?? "Not assigned"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                            <p className="text-slate-400">Verified</p>
                            <p className="mt-1 font-black text-slate-800 dark:text-slate-100">
                              {assignmentItem?.verifiedQuantity ?? "—"}
                              {assignmentItem?.damagedQuantity || assignmentItem?.shortQuantity
                                ? ` · ${assignmentItem.damagedQuantity} damaged · ${assignmentItem.shortQuantity} short`
                                : ""}
                            </p>
                          </div>
                        </div>
                        {assignment?.issueType || assignment?.issueNotes ? (
                          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                            {assignment.issueType?.replaceAll("_", " ") ?? "Issue"}: {assignment.issueNotes || "No note provided"}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              {selectedOrder.status === OrderStatus.NEW_ORDER ? (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                  <h3 className="text-sm font-black text-blue-950 dark:text-blue-100">Step 1 — Confirm Order Received</h3>
                  <p className="mt-1 text-xs leading-5 text-blue-700/80 dark:text-blue-200/70">
                    Confirm the order before assigning products to Physical Teams.
                  </p>
                  <form action={confirmOrderReceivedAction} className="mt-4">
                    <input type="hidden" name="orderId" value={selectedOrder.id} />
                    <textarea
                      name="receivingNotes"
                      rows={3}
                      placeholder="Optional receiving note"
                      className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-blue-500/20 dark:bg-slate-950 dark:text-white"
                    />
                    <button className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700">
                      Confirm Order Received
                    </button>
                  </form>
                </section>
              ) : null}

              {selectedOrder.status !== OrderStatus.NEW_ORDER ? (() => {
                const assignmentLocked = selectedOrder.physicalAssignments.some(
                  (assignment) => assignment.status !== PhysicalCheckStatus.ASSIGNED,
                );
                const canAssign =
                  !assignmentLocked &&
                  ([
                    OrderStatus.PENDING_TEAM_ASSIGNMENT,
                    OrderStatus.PHYSICAL_CHECK_ASSIGNED,
                    OrderStatus.PENDING_STOCK_CHECK,
                    OrderStatus.STOCK_CHECKED,
                    OrderStatus.STOCK_BLOCKED,
                                  OrderStatus.BACKORDERED,
                    OrderStatus.READY_FOR_DISPATCH,
                  ] as OrderStatus[]).includes(selectedOrder.status);

                return canAssign ? (
                  <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                    <h3 className="text-sm font-black text-indigo-950 dark:text-indigo-100">Step 2 — Product-wise Team Assignment</h3>
                    <p className="mt-1 text-xs leading-5 text-indigo-700/80 dark:text-indigo-200/70">
                      Assign every product line. One order may use multiple Physical Teams.
                    </p>
                    <form action={assignPhysicalTeamsAction} className="mt-4 space-y-3">
                      <input type="hidden" name="orderId" value={selectedOrder.id} />
                      {selectedOrder.items.map((item) => (
                        <label key={item.id} className="block rounded-xl bg-white p-3 dark:bg-slate-950">
                          <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-100">
                            {item.product.name}
                          </span>
                          <select
                            name={`teamId__${item.id}`}
                            defaultValue={item.physicalAssignmentItem?.assignment.teamId ?? ""}
                            required
                            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="">Select Physical Team</option>
                            {physicalTeams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name} · {team.members.length} member(s)
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <button
                        disabled={physicalTeams.length === 0}
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {selectedOrder.physicalAssignments.length ? "Update Team Assignments" : "Assign Products to Teams"}
                      </button>
                    </form>
                  </section>
                ) : null;
              })() : null}

              <section className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/internal/dispatch"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-amber-200 hover:text-amber-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                >
                  Physical Checks
                  <Icon name="arrow" className="h-4 w-4" />
                </Link>
                <Link
                  href="/internal/qc"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-purple-600 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  QC & Delivery
                  <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </section>

              {selectedOrder.statusHistory.length ? (
                <section className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">Recent Workflow Activity</h3>
                  <div className="mt-4 space-y-4">
                    {selectedOrder.statusHistory.map((history) => (
                      <div key={history.id} className="flex gap-3">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-100">{history.title}</p>
                            <p className="shrink-0 text-[10px] text-slate-400">{compactDate(history.createdAt)}</p>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {history.description || `Status changed by ${history.changedByName}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
