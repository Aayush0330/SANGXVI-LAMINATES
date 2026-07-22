import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { DeliveryProofGallery } from "@/components/delivery-proof-gallery";
import { ClickableOrderRow } from "@/components/clickable-order-row";
import { OrderDetailsDrawer } from "@/components/order-details-drawer";
import {
  OrderStatus,
  Prisma,
  UserRole,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderSourceLabel } from "@/lib/dealer-directory";
import {
  getLightOrderStatusClass,
  getOrderFulfillmentSummary,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";

const IST_TIME_ZONE = "Asia/Kolkata";
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

const ORDER_STATUS_OPTIONS = Object.values(OrderStatus).map((status) => ({
  value: status,
  label: getOrderStatusLabel(status),
}));

const QC_APPROVED_STATUSES: OrderStatus[] = [
  OrderStatus.QC_APPROVED,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.TRANSPORT_ASSIGNED,
  OrderStatus.ON_THE_WAY,
  OrderStatus.DELIVERED,
  OrderStatus.INVOICE_UPLOADED,
];

const CLOSED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.INVOICE_UPLOADED,
  OrderStatus.CANCELLED,
];

const ACTIVE_ORDER_STATUSES: OrderStatus[] = Object.values(OrderStatus).filter(
  (status) => !CLOSED_ORDER_STATUSES.includes(status),
);

const PROOF_ELIGIBLE_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.INVOICE_UPLOADED,
];

const RECEIVING_HANDOFF_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_TEAM_ASSIGNMENT,
  OrderStatus.PHYSICAL_CHECK_ASSIGNED,
];

const TRANSPORT_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.TRANSPORT_ASSIGNED,
  OrderStatus.ON_THE_WAY,
];

const DELIVERY_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.ON_THE_WAY,
];

type PageSearchParams = {
  q?: string;
  status?: string;
  dealer?: string;
  team?: string;
  qc?: string;
  driver?: string;
  proof?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
  order?: string;
};

type QueryValue = string | number | null | undefined;

function sanitizeValue(value?: string) {
  return value?.trim() ?? "";
}

function parsePage(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function parsePageSize(value?: string) {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : 20;
}

function parseDateStart(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST_TIME_ZONE,
  }).format(value);
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: IST_TIME_ZONE,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildHref(
  pathname: string,
  params: PageSearchParams,
  updates: Record<string, QueryValue>,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      query.delete(key);
    } else {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function getQcState(status: OrderStatus) {
  if (status === OrderStatus.QC_REWORK) {
    return {
      label: "Rework Required",
      className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
    };
  }

  if (status === OrderStatus.PENDING_QC) {
    return {
      label: "QC Pending",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  if (QC_APPROVED_STATUSES.includes(status)) {
    return {
      label: "QC Approved",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    };
  }

  return {
    label: "Not Started",
    className: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  };
}

function getProofState(order: {
  status: OrderStatus;
  deliveryProofAssistanceStatus: string;
  deliveryProofs: { id: string }[];
}) {
  if (order.deliveryProofs.length > 0) {
    return {
      label: "Uploaded",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    };
  }

  if (order.deliveryProofAssistanceStatus === "REQUESTED") {
    return {
      label: "Manager Requested",
      className:
        "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200",
    };
  }

  if (PROOF_ELIGIBLE_STATUSES.includes(order.status)) {
    return {
      label: "Pending",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  return {
    label: "Not Required",
    className: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  };
}

function getCurrentPhysicalTeam(
  assignments: {
    status: string;
    team: { id: string; name: string };
    assignedAt: Date;
  }[],
) {
  return (
    [...assignments]
      .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())
      .find((assignment) => assignment.status !== "CANCELLED")?.team ?? null
  );
}

function SummaryIcon({ type }: { type: "orders" | "progress" | "qc" | "done" | "proof" }) {
  const paths = {
    orders: <path d="M4 6h16l-1.5 9h-13L4 6Zm3 13h.01M17 19h.01M2 3h2l1 3" />,
    progress: <><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="8" /></>,
    qc: <><path d="M9 3h6M10 3v5l-4 8a3 3 0 0 0 2.7 4h6.6a3 3 0 0 0 2.7-4l-4-8V3" /><path d="M8 15h8" /></>,
    done: <path d="m5 12 4 4L19 6" />,
    proof: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths[type]}
    </svg>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
      >
        {children}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex max-w-full whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.05em] ${getLightOrderStatusClass(
        status,
      )} dark:bg-white/10 dark:text-slate-100`}
    >
      {getOrderStatusLabel(status)}
    </span>
  );
}

function TimelineStep({
  label,
  date,
  done,
  current,
  note,
}: {
  label: string;
  date?: Date | null;
  done: boolean;
  current?: boolean;
  note?: string | null;
}) {
  return (
    <div className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 pb-3.5 last:pb-0">
      <div className="relative flex justify-center">
        <span
          className={`relative z-10 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 text-[8px] font-black ${
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : current
                ? "border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-200"
                : "border-slate-300 bg-white text-slate-400 dark:border-white/20 dark:bg-slate-900"
          }`}
        >
          {done ? "✓" : current ? "•" : ""}
        </span>
        <span className="absolute bottom-[-14px] top-4 w-px bg-slate-200 last:hidden dark:bg-white/10" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className={`text-[10px] font-black ${done || current ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
            {label}
          </p>
          <p className={`text-[8px] font-bold ${current && !date ? "text-amber-600 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>
            {date ? formatDateTime(date) : current ? "Pending" : "Not started"}
          </p>
        </div>
        {note ? <p className="mt-0.5 text-[8px] leading-3.5 text-slate-500 dark:text-slate-400">{note}</p> : null}
      </div>
    </div>
  );
}

export default async function OrderJourneyHubPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const { hasAccess } = await checkPermission(
    "view_order_journey",
    "/internal/orders",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Order journey access denied"
        description="You do not have permission to view the complete order journey."
      />
    );
  }

  const params = (await searchParams) ?? {};
  const q = sanitizeValue(params.q);
  const statusFilter = sanitizeValue(params.status);
  const dealerFilter = sanitizeValue(params.dealer);
  const teamFilter = sanitizeValue(params.team);
  const qcFilter = sanitizeValue(params.qc);
  const driverFilter = sanitizeValue(params.driver);
  const proofFilter = sanitizeValue(params.proof);
  const fromDate = parseDateStart(params.from);
  const toDate = parseDateEnd(params.to);
  const requestedPage = parsePage(params.page);
  const pageSize = parsePageSize(params.pageSize);

  const conditions: Prisma.OrderWhereInput[] = [];

  if (q) {
    conditions.push({
      OR: [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { dealer: { is: { name: { contains: q, mode: "insensitive" } } } },
        { dealer: { is: { email: { contains: q, mode: "insensitive" } } } },
        {
          items: {
            some: {
              product: {
                is: {
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
    });
  }

  if (ORDER_STATUS_OPTIONS.some((option) => option.value === statusFilter)) {
    conditions.push({ status: statusFilter as OrderStatus });
  }

  if (dealerFilter) conditions.push({ dealerId: dealerFilter });
  if (driverFilter) conditions.push({ assignedDriverId: driverFilter });
  if (teamFilter) {
    conditions.push({ physicalAssignments: { some: { teamId: teamFilter } } });
  }

  if (qcFilter === "pending") {
    conditions.push({ status: OrderStatus.PENDING_QC });
  } else if (qcFilter === "approved") {
    conditions.push({ status: { in: QC_APPROVED_STATUSES } });
  } else if (qcFilter === "rework") {
    conditions.push({ status: OrderStatus.QC_REWORK });
  } else if (qcFilter === "not-started") {
    conditions.push({
      status: {
        notIn: [
          OrderStatus.PENDING_QC,
          OrderStatus.QC_REWORK,
          ...QC_APPROVED_STATUSES,
        ],
      },
    });
  }

  if (proofFilter === "uploaded") {
    conditions.push({ deliveryProofs: { some: { isActive: true } } });
  } else if (proofFilter === "requested") {
    conditions.push({ deliveryProofAssistanceStatus: "REQUESTED" });
  } else if (proofFilter === "pending") {
    conditions.push({
      status: { in: PROOF_ELIGIBLE_STATUSES },
      deliveryProofs: { none: { isActive: true } },
    });
  } else if (proofFilter === "not-required") {
    conditions.push({
      status: { notIn: PROOF_ELIGIBLE_STATUSES },
      deliveryProofs: { none: { isActive: true } },
    });
  }

  if (fromDate || toDate) {
    conditions.push({
      createdAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    });
  }

  const where: Prisma.OrderWhereInput =
    conditions.length > 0 ? { AND: conditions } : {};

  const [
    totalOrders,
    inProgressOrders,
    waitingForQc,
    deliveredOrders,
    proofPendingOrders,
    filteredCount,
    dealers,
    physicalTeams,
    drivers,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES } } }),
    prisma.order.count({
      where: { status: { in: [OrderStatus.PENDING_QC, OrderStatus.QC_REWORK] } },
    }),
    prisma.order.count({
      where: { status: { in: [OrderStatus.DELIVERED, OrderStatus.INVOICE_UPLOADED] } },
    }),
    prisma.order.count({
      where: {
        status: { in: PROOF_ELIGIBLE_STATUSES },
        deliveryProofs: { none: { isActive: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.user.findMany({
      where: { dealerOrders: { some: {} } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.workTeam.findMany({
      where: { isActive: true, teamType: "PHYSICAL_DISPATCH" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { role: UserRole.DRIVER_TRANSPORT },
          { roleAssignments: { some: { role: UserRole.DRIVER_TRANSPORT } } },
        ],
      },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const skip = (page - 1) * pageSize;

  const orders = await prisma.order.findMany({
    where,
    include: {
      dealer: { select: { id: true, name: true, email: true, phone: true } },
      assignedDriver: { select: { id: true, name: true, phone: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              stack: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      physicalAssignments: {
        include: { team: { select: { id: true, name: true } } },
        orderBy: { assignedAt: "asc" },
      },
      deliveryProofs: { where: { isActive: true }, select: { id: true }, orderBy: { uploadedAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
    skip,
    take: pageSize,
  });

  const selectedOrderId = params.order || null;
  const selectedOrder = selectedOrderId
    ? await prisma.order.findUnique({
        where: { id: selectedOrderId },
        include: {
          dealer: { select: { id: true, name: true, email: true, phone: true } },
          assignedDriver: { select: { id: true, name: true, phone: true } },
          deliveredBy: { select: { id: true, name: true, email: true } },
          deliveryProofRequestedBy: { select: { id: true, name: true } },
          deliveryProofCompletedBy: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
          transportOption: { select: { id: true, name: true, description: true } },
          items: {
            include: {
              product: {
                include: {
                  category: { select: { name: true } },
                  brand: { select: { name: true } },
                },
              },
              physicalAssignmentItem: {
                include: {
                  assignment: {
                    include: { team: { select: { id: true, name: true } } },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          physicalAssignments: {
            include: {
              team: {
                include: {
                  members: {
                    where: { user: { status: "ACTIVE" } },
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { createdAt: "asc" },
                  },
                },
              },
              items: {
                include: {
                  orderItem: {
                    include: { product: { select: { code: true, name: true } } },
                  },
                },
              },
            },
            orderBy: { assignedAt: "asc" },
          },
          statusHistory: { orderBy: { createdAt: "asc" } },
          deliveryProofs: {
            where: { isActive: true },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              note: true,
              uploadMode: true,
              deliveredByName: true,
              uploadedAt: true,
              uploadedBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { uploadedAt: "desc" },
          },
        },
      })
    : null;

  const selectedSummary = selectedOrder
    ? getOrderFulfillmentSummary(selectedOrder.items)
    : null;
  const selectedPricing = selectedOrder
    ? selectedOrder.items.reduce(
        (summary, item) => ({
          subtotal: summary.subtotal + Number(item.lineSubtotal),
          tax: summary.tax + Number(item.taxAmount),
          total: summary.total + Number(item.lineTotal),
        }),
        { subtotal: 0, tax: 0, total: 0 },
      )
    : null;
  const selectedTeam = selectedOrder
    ? getCurrentPhysicalTeam(selectedOrder.physicalAssignments)
    : null;

  const receiveHistory = selectedOrder?.statusHistory.find((history) =>
    RECEIVING_HANDOFF_STATUSES.includes(history.toStatus),
  );
  const physicalCompleted = selectedOrder?.physicalAssignments
    .filter((assignment) => assignment.completedAt)
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
    )[0];
  const qcHistory = selectedOrder?.statusHistory.find((history) =>
    QC_APPROVED_STATUSES.includes(history.toStatus),
  );
  const transportHistory = selectedOrder?.statusHistory.find((history) =>
    TRANSPORT_ACTIVE_STATUSES.includes(history.toStatus),
  );
  const latestProof = selectedOrder?.deliveryProofs[0] ?? null;
  const selectedProofState = selectedOrder ? getProofState(selectedOrder) : null;
  const selectedQcState = selectedOrder ? getQcState(selectedOrder.status) : null;

  const issues =
    selectedOrder?.physicalAssignments.filter(
      (assignment) =>
        assignment.issueType ||
        assignment.issueNotes ||
        assignment.qcNotes ||
        ["ISSUE_REPORTED", "QC_REWORK"].includes(assignment.status),
    ) ?? [];

  const startItem = filteredCount === 0 ? 0 : skip + 1;
  const endItem = Math.min(filteredCount, skip + pageSize);

  const summaryCards = [
    {
      label: "Total Orders",
      value: totalOrders,
      note: "All time",
      percentage: null,
      type: "orders" as const,
      iconClass: "bg-blue-600 text-white dark:bg-blue-500 dark:text-white",
      accentClass: "text-slate-400 dark:text-slate-500",
    },
    {
      label: "In Progress",
      value: inProgressOrders,
      note: "of total orders",
      percentage: totalOrders > 0 ? (inProgressOrders / totalOrders) * 100 : 0,
      type: "progress" as const,
      iconClass: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
      accentClass: "text-amber-600 dark:text-amber-300",
    },
    {
      label: "Waiting for QC",
      value: waitingForQc,
      note: "of total orders",
      percentage: totalOrders > 0 ? (waitingForQc / totalOrders) * 100 : 0,
      type: "qc" as const,
      iconClass: "bg-violet-600 text-white dark:bg-violet-500 dark:text-white",
      accentClass: "text-violet-600 dark:text-violet-300",
    },
    {
      label: "Delivered",
      value: deliveredOrders,
      note: "of total orders",
      percentage: totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0,
      type: "done" as const,
      iconClass: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white",
      accentClass: "text-emerald-600 dark:text-emerald-300",
    },
    {
      label: "Proof Pending",
      value: proofPendingOrders,
      note: "of total orders",
      percentage: totalOrders > 0 ? (proofPendingOrders / totalOrders) * 100 : 0,
      type: "proof" as const,
      iconClass: "bg-sky-600 text-white dark:bg-sky-500 dark:text-white",
      accentClass: "text-sky-600 dark:text-sky-300",
    },
  ];

  const closeOrderHref = buildHref("/internal/orders", params, { order: null });
  const hasSelectedOrder = Boolean(
    selectedOrder && selectedSummary && selectedProofState && selectedQcState,
  );

  return (
    <div
      className={`-mx-1 space-y-4 sm:mx-0 ${
        hasSelectedOrder ? "xl:pr-[382px] 2xl:pr-[410px]" : ""
      }`}
    >
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-black tracking-[-0.035em] text-slate-950 sm:text-[30px] dark:text-white">
              Order Journey Hub
            </h1>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 12 2 2 4-4" />
                <circle cx="12" cy="12" r="8" />
              </svg>
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-500 dark:text-slate-400">
            Track every order from purchase to delivery proof in one place.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
            {filteredCount.toLocaleString("en-IN")} matching
          </span>
          <span className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:inline-flex dark:border-white/10 dark:bg-slate-900">
            Live ERP data
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${card.iconClass}`}>
                <SummaryIcon type={card.type} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {card.label}
                </p>
                <p className="mt-0.5 text-xl font-black leading-none text-slate-950 dark:text-white">
                  {card.value.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
            <p className={`mt-2 truncate text-[10px] font-bold ${card.accentClass}`}>
              {card.percentage === null
                ? card.note
                : `${card.percentage.toFixed(1)}% ${card.note}`}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <form method="get" className="space-y-2.5">
          <input type="hidden" name="pageSize" value={pageSize} />

          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))]">
            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
                Search
              </span>
              <div className="relative">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Order, dealer or product..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[12px] font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/10"
                />
              </div>
            </label>

            <FilterSelect label="Order Status" name="status" defaultValue={statusFilter}>
              <option value="">All statuses</option>
              {ORDER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </FilterSelect>

            <FilterSelect label="Dealer" name="dealer" defaultValue={dealerFilter}>
              <option value="">All dealers</option>
              {dealers.map((dealer) => (
                <option key={dealer.id} value={dealer.id}>{dealer.name}</option>
              ))}
            </FilterSelect>

            <FilterSelect label="Physical Team" name="team" defaultValue={teamFilter}>
              <option value="">All teams</option>
              {physicalTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </FilterSelect>
          </div>

          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.05fr)_minmax(0,1.05fr)_auto]">
            <FilterSelect label="QC Status" name="qc" defaultValue={qcFilter}>
              <option value="">All QC states</option>
              <option value="not-started">Not started</option>
              <option value="pending">QC pending</option>
              <option value="rework">Rework required</option>
              <option value="approved">QC approved</option>
            </FilterSelect>

            <FilterSelect label="Driver" name="driver" defaultValue={driverFilter}>
              <option value="">All drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </FilterSelect>

            <FilterSelect label="Proof Status" name="proof" defaultValue={proofFilter}>
              <option value="">All proof states</option>
              <option value="uploaded">Uploaded</option>
              <option value="pending">Pending</option>
              <option value="requested">Manager requested</option>
              <option value="not-required">Not required yet</option>
            </FilterSelect>

            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
                From Date
              </span>
              <input
                type="date"
                name="from"
                defaultValue={params.from ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
                To Date
              </span>
              <input
                type="date"
                name="to"
                defaultValue={params.to ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-1">
              <button
                type="submit"
                className="inline-flex h-9 min-w-[96px] flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-3 text-[12px] font-black leading-none text-white transition hover:bg-blue-700"
              >
                Apply Filters
              </button>
              <Link
                href="/internal/orders"
                className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 px-3 text-[12px] font-black leading-none text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <div>
            <h2 className="text-[15px] font-black text-slate-950 dark:text-white">All Orders</h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Select any order to inspect its complete Order Details record.
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Showing {startItem}–{endItem} of {filteredCount.toLocaleString("en-IN")}
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-white/10">
              <SummaryIcon type="orders" />
            </div>
            <h3 className="mt-3 text-base font-black text-slate-950 dark:text-white">No matching orders</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Change or reset the filters to view more orders.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[890px] border-collapse text-left">
              <thead className="bg-slate-50/90 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 dark:bg-slate-950/70 dark:text-slate-400">
                <tr>
                  <th className="w-[108px] px-3 py-2.5">Order No.</th>
                  <th className="w-[140px] px-3 py-2.5">Dealer</th>
                  <th className="w-[76px] px-3 py-2.5">Products</th>
                  <th className="w-[118px] px-3 py-2.5">Current Stage</th>
                  <th className="w-[104px] px-3 py-2.5">Physical Team</th>
                  <th className="w-[92px] px-3 py-2.5">QC</th>
                  <th className="w-[86px] px-3 py-2.5">Driver</th>
                  <th className="w-[82px] px-3 py-2.5">Proof</th>
                  <th className="w-[132px] px-3 py-2.5">Updated At</th>
                  <th className="w-[42px] px-2 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {orders.map((order) => {
                  const team = getCurrentPhysicalTeam(order.physicalAssignments);
                  const qcState = getQcState(order.status);
                  const proofState = getProofState(order);
                  const isSelected = order.id === selectedOrder?.id;
                  const orderHref = buildHref("/internal/orders", params, { order: order.id });

                  return (
                    <ClickableOrderRow
                      key={order.id}
                      href={orderHref}
                      className={
                        isSelected
                          ? "cursor-pointer bg-blue-50/90 outline-none ring-1 ring-inset ring-blue-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:bg-blue-500/10 dark:ring-blue-500/20"
                          : "cursor-pointer outline-none transition hover:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-white/[0.035]"
                      }
                    >
                      <td className="px-3 py-2.5">
                        <Link href={orderHref} className="whitespace-nowrap text-[11px] font-black text-blue-600 hover:underline dark:text-blue-300">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="max-w-[140px] truncate text-[11px] font-bold text-slate-800 dark:text-slate-200">{order.dealer.name}</p>
                        <p className="mt-0.5 max-w-[140px] truncate text-[9px] font-semibold text-slate-400">{getOrderSourceLabel(order.source)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="whitespace-nowrap text-[11px] font-semibold text-slate-700 dark:text-slate-300">{order.items.length} item{order.items.length === 1 ? "" : "s"}</p>
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={order.status} /></td>
                      <td className="px-3 py-2.5"><p className="max-w-[104px] truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">{team?.name ?? "—"}</p></td>
                      <td className="px-3 py-2.5"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-black ${qcState.className}`}>{qcState.label}</span></td>
                      <td className="px-3 py-2.5"><p className="max-w-[86px] truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">{order.assignedDriver?.name ?? "—"}</p></td>
                      <td className="px-3 py-2.5"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-black ${proofState.className}`}>{proofState.label}</span></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{formatDateTime(order.updatedAt)}</td>
                      <td className="px-2 py-2.5 text-center">
                        <Link
                          href={orderHref}
                          aria-label={`View ${order.orderNumber} details`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-base font-black leading-none text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                        >
                          ···
                        </Link>
                      </td>
                    </ClickableOrderRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Showing {startItem}–{endItem} of {filteredCount.toLocaleString("en-IN")} orders
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <div className="flex items-center gap-1">
              <Link
                aria-disabled={page <= 1}
                href={page > 1 ? buildHref("/internal/orders", params, { page: page - 1, order: null }) : "#"}
                className={`inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-[11px] font-black ${
                  page <= 1
                    ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                }`}
              >
                ‹
              </Link>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 text-[11px] font-black text-white">
                {page}
              </span>
              <span className="px-1 text-[11px] font-bold text-slate-400">of {pageCount}</span>
              <Link
                aria-disabled={page >= pageCount}
                href={page < pageCount ? buildHref("/internal/orders", params, { page: page + 1, order: null }) : "#"}
                className={`inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-[11px] font-black ${
                  page >= pageCount
                    ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                }`}
              >
                ›
              </Link>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-slate-950">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <Link
                  key={size}
                  href={buildHref("/internal/orders", params, { pageSize: size, page: 1, order: null })}
                  className={`rounded-md px-2 py-1 text-[10px] font-black ${
                    pageSize === size
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                  }`}
                >
                  {size}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {hasSelectedOrder && selectedOrder && selectedSummary && selectedProofState && selectedQcState ? (
        <OrderDetailsDrawer closeHref={closeOrderHref}>
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-black text-slate-950 dark:text-white">Order Details</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Complete order journey</p>
                </div>
                <Link
                  href={closeOrderHref}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-lg leading-none text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Close Order Details"
                >
                  ×
                </Link>
              </div>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-white/10">
              <section className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-black tracking-tight text-slate-950 dark:text-white">{selectedOrder.orderNumber}</h2>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="mt-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Placed {formatDateTime(selectedOrder.createdAt)}
                </p>
              </section>

              {selectedPricing ? (
                <section className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-white/10">
                  <div className="px-4 py-3"><p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Subtotal</p><p className="mt-1 text-[12px] font-black text-slate-950 dark:text-white">{formatMoney(selectedPricing.subtotal)}</p></div>
                  <div className="px-4 py-3"><p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">GST</p><p className="mt-1 text-[12px] font-black text-slate-950 dark:text-white">{formatMoney(selectedPricing.tax)}</p></div>
                  <div className="px-4 py-3"><p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Order Total</p><p className="mt-1 text-[12px] font-black text-blue-600 dark:text-blue-300">{formatMoney(selectedPricing.total)}</p></div>
                </section>
              ) : null}

              <section className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
                <div className="px-4 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Dealer</p>
                  <p className="mt-1 truncate text-[13px] font-black text-blue-600 dark:text-blue-300">{selectedOrder.dealer.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{selectedOrder.dealer.phone || selectedOrder.dealer.email}</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
                  <div className="px-3 py-3">
                    <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Total Qty</p>
                    <p className="mt-1 text-[15px] font-black text-slate-950 dark:text-white">{selectedSummary.requested}</p>
                  </div>
                  <div className="px-3 py-3">
                    <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Delivered</p>
                    <p className="mt-1 text-[15px] font-black text-emerald-600 dark:text-emerald-300">{selectedSummary.delivered}</p>
                  </div>
                </div>
              </section>

              <section className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-black text-slate-950 dark:text-white">Products ({selectedOrder.items.length})</h3>
                  <p className="text-[9px] font-semibold text-slate-400">Requested · Verified · Delivered</p>
                </div>
                <div className="mt-2.5 divide-y divide-slate-100 dark:divide-white/5">
                  {selectedOrder.items.map((item, index) => {
                    const verified = item.physicalAssignmentItem?.verifiedQuantity ?? null;

                    return (
                      <article key={item.id} className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-2 py-2.5 first:pt-0 last:pb-0">
                        <span className="pt-0.5 text-[10px] font-black text-slate-400">{index + 1}.</span>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-200">{item.product.name}</p>
                          <p className="mt-0.5 truncate text-[9px] text-slate-400">{item.product.code} · {item.product.brand.name} · {item.product.unit}</p>
                          <p className="mt-1 truncate text-[9px] font-semibold text-slate-500 dark:text-slate-400">{formatMoney(Number(item.unitPrice))} each · GST {Number(item.gstRate).toFixed(2)}% · {getOrderStatusLabel(String(item.priceSource))}</p>
                          <p className="mt-1 text-[10px] font-black text-blue-600 dark:text-blue-300">Line total {formatMoney(Number(item.lineTotal))}</p>
                        </div>
                        <div className="grid min-w-[96px] grid-cols-3 gap-1 text-center">
                          {[item.requestedQuantity || item.quantity, verified ?? "—", item.deliveredQuantity].map((value, valueIndex) => (
                            <div key={`${item.id}-${valueIndex}`}>
                              <p className="text-[8px] font-black text-slate-700 dark:text-slate-300">{value}</p>
                              <p className="mt-0.5 text-[7px] uppercase tracking-[0.06em] text-slate-400">{["Ord", "Ver", "Del"][valueIndex]}</p>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
                <div className="px-4 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Physical Team</p>
                  <p className="mt-1 truncate text-[12px] font-black text-blue-600 dark:text-blue-300">{selectedTeam?.name ?? "Not assigned"}</p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500 dark:text-slate-400">
                    {selectedOrder.physicalAssignments
                      .flatMap((assignment) => assignment.team.members.map((member) => member.user.name))
                      .slice(0, 3)
                      .join(", ") || "No active members"}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Driver</p>
                  <p className="mt-1 truncate text-[12px] font-black text-blue-600 dark:text-blue-300">{selectedOrder.assignedDriver?.name ?? "Not assigned"}</p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500 dark:text-slate-400">
                    {selectedOrder.transportOption?.name || selectedOrder.transportLabel || selectedOrder.assignedDriver?.phone || "Transport pending"}
                  </p>
                </div>
              </section>

              <section className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-black text-slate-950 dark:text-white">Order Journey</h3>
                  <span className="text-[9px] font-bold text-slate-400">{selectedOrder.statusHistory.length} updates</span>
                </div>
                <div className="mt-3">
                  <TimelineStep label="Order Placed" date={selectedOrder.createdAt} done />
                  <TimelineStep label="Order Receiving" date={selectedOrder.receivedAt ?? receiveHistory?.createdAt} done={Boolean(selectedOrder.receivedAt || receiveHistory)} current={!selectedOrder.receivedAt && !receiveHistory} note={selectedOrder.receivedBy ? `Received by ${selectedOrder.receivedBy.name}` : null} />
                  <TimelineStep label="Physical Verification" date={physicalCompleted?.completedAt} done={Boolean(physicalCompleted?.completedAt)} current={!physicalCompleted?.completedAt && selectedOrder.physicalAssignments.length > 0} note={physicalCompleted?.completedByName ? `Completed by ${physicalCompleted.completedByName}` : selectedTeam ? `Assigned to ${selectedTeam.name}` : null} />
                  <TimelineStep label={selectedOrder.status === OrderStatus.QC_REWORK ? "QC Rework" : "QC Approved"} date={qcHistory?.createdAt} done={Boolean(qcHistory)} current={selectedOrder.status === OrderStatus.PENDING_QC || selectedOrder.status === OrderStatus.QC_REWORK} note={selectedQcState.label} />
                  <TimelineStep label="Driver Assigned" date={transportHistory?.createdAt} done={Boolean(selectedOrder.assignedDriverId)} current={!selectedOrder.assignedDriverId && QC_APPROVED_STATUSES.includes(selectedOrder.status)} note={selectedOrder.assignedDriver ? `${selectedOrder.assignedDriver.name}${selectedOrder.transportOption?.name ? ` · ${selectedOrder.transportOption.name}` : ""}` : null} />
                  <TimelineStep label="Delivered" date={selectedOrder.deliveredAt} done={Boolean(selectedOrder.deliveredAt)} current={DELIVERY_ACTIVE_STATUSES.includes(selectedOrder.status)} note={selectedOrder.deliveredByName ? `Delivered by ${selectedOrder.deliveredByName}` : null} />
                  <TimelineStep label="Proof Uploaded" date={latestProof?.uploadedAt} done={Boolean(latestProof)} current={PROOF_ELIGIBLE_STATUSES.includes(selectedOrder.status) && !latestProof} note={selectedProofState.label} />
                </div>
              </section>

              <section className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-black text-slate-950 dark:text-white">Proof</h3>
                  <span className={`rounded-full px-2 py-1 text-[8px] font-black ${selectedProofState.className}`}>{selectedProofState.label}</span>
                </div>

                {selectedOrder.deliveryProofs.length === 0 ? (
                  <p className="mt-2.5 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-[10px] font-semibold text-slate-500 dark:border-white/15 dark:text-slate-400">No delivery proof uploaded yet.</p>
                ) : (
                  <DeliveryProofGallery
                    compact
                    orderNumber={selectedOrder.orderNumber}
                    proofs={selectedOrder.deliveryProofs.map((proof) => ({
                      id: proof.id,
                      fileUrl: `/field/deliveries/proof/${proof.id}`,
                      fileName: proof.fileName,
                      mimeType: proof.mimeType,
                      uploadedAtLabel: formatDate(proof.uploadedAt),
                      uploadSourceLabel:
                        proof.uploadMode === "MANAGER_ASSISTED"
                          ? "Manager assisted"
                          : proof.uploadMode === "INTERNAL_UPLOAD"
                            ? "Internal replacement"
                            : "Driver upload",
                      uploadedByLabel: proof.uploadedBy?.name ?? null,
                    }))}
                  />
                )}
              </section>

              <section className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-black text-slate-950 dark:text-white">Issues / Blockers</h3>
                  <span className={`rounded-full px-2 py-1 text-[8px] font-black ${issues.length > 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"}`}>{issues.length} open</span>
                </div>
                {issues.length === 0 ? (
                  <p className="mt-2.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">No physical verification or QC blockers recorded.</p>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {issues.map((issue) => (
                      <article key={issue.id} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-500/20 dark:bg-rose-500/10">
                        <p className="text-[10px] font-black text-rose-700 dark:text-rose-200">
                          {issue.issueType
                            ? issue.issueType.split("_").map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" ")
                            : issue.status === "QC_REWORK"
                              ? "QC Rework"
                              : "Issue reported"}
                        </p>
                        <p className="mt-0.5 text-[9px] leading-4 text-rose-600/90 dark:text-rose-200/80">{issue.issueNotes || issue.qcNotes || "No additional notes."}</p>
                        <p className="mt-1 text-[8px] font-bold text-rose-500 dark:text-rose-300">{issue.team.name} · {formatDateTime(issue.qcRejectedAt || issue.updatedAt)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-black text-slate-950 dark:text-white">Recent Activity</h3>
                  <span className="text-[9px] font-bold text-slate-400">Latest 4</span>
                </div>
                <div className="mt-2.5 divide-y divide-slate-100 dark:divide-white/5">
                  {selectedOrder.statusHistory.slice(-4).reverse().map((history) => (
                    <article key={history.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-[10px] font-black text-slate-800 dark:text-slate-200">{history.title}</p>
                        <p className="shrink-0 text-[8px] font-semibold text-slate-400">{formatDate(history.createdAt)}</p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-slate-500 dark:text-slate-400">{history.description || `${getOrderStatusLabel(history.fromStatus ?? history.toStatus)} → ${getOrderStatusLabel(history.toStatus)}`}</p>
                    </article>
                  ))}
                  {selectedOrder.statusHistory.length === 0 ? <p className="text-[10px] text-slate-500 dark:text-slate-400">No status history recorded yet.</p> : null}
                </div>
              </section>
            </div>
        </OrderDetailsDrawer>
      ) : null}
    </div>
  );
}
