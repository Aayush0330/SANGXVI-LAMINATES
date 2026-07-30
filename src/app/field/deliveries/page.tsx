import Link from "next/link";
import { OrderStatus, Prisma } from "@/generated/prisma/client";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { DeliveryProofGallery } from "@/components/delivery-proof-gallery";
import {
  DriverProofOptions,
  DRIVER_DELIVERY_SCROLL_KEY,
  MarkDeliveredForm,
  MarkOnTheWayForm,
} from "@/components/driver-delivery-actions";
import { ErpIcon } from "@/components/erp-icon";
import {
  OperationsEmptyState,
  OperationsMetricCard,
  OperationsStatusPill,
  type OperationsTone,
} from "@/components/operations-workspace-ui";
import { OrderStatusTimeline } from "@/components/order-status-timeline";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  getItemFulfillmentSummary,
  getOrderFulfillmentSummary,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";

const PAGE_SIZE = 8;

const DELIVERY_STATUSES: OrderStatus[] = [
  OrderStatus.TRANSPORT_ASSIGNED,
  OrderStatus.ON_THE_WAY,
  OrderStatus.DELIVERED,
  OrderStatus.INVOICE_UPLOADED,
];

const queueFilters = [
  { key: "all", label: "All Work" },
  { key: "ready", label: "Ready to Start" },
  { key: "route", label: "On Route" },
  { key: "proof", label: "Proof Pending" },
  { key: "complete", label: "Completed" },
] as const;

type DeliveryFilter = (typeof queueFilters)[number]["key"];

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

function getStatusTone(status: OrderStatus): OperationsTone {
  if (status === OrderStatus.TRANSPORT_ASSIGNED) return "amber";
  if (status === OrderStatus.ON_THE_WAY) return "blue";
  if (status === OrderStatus.DELIVERED) return "violet";
  if (status === OrderStatus.INVOICE_UPLOADED) return "emerald";
  return "slate";
}

function getFilterWhere(filter: DeliveryFilter): Prisma.OrderWhereInput {
  if (filter === "ready") {
    return { status: OrderStatus.TRANSPORT_ASSIGNED };
  }
  if (filter === "route") {
    return { status: OrderStatus.ON_THE_WAY };
  }
  if (filter === "proof") {
    return {
      status: OrderStatus.DELIVERED,
      signedInvoiceStatus: { not: "UPLOADED" },
    };
  }
  if (filter === "complete") {
    return { status: OrderStatus.INVOICE_UPLOADED };
  }

  return { status: { in: DELIVERY_STATUSES } };
}

function buildHref(
  params: {
    q?: string;
    status?: DeliveryFilter;
    page?: number;
    order?: string;
  },
  patch: Partial<{
    q: string;
    status: DeliveryFilter;
    page: number;
    order: string | null;
  }>,
) {
  const values = { ...params, ...patch };
  const next = new URLSearchParams();

  if (values.q) next.set("q", values.q);
  if (values.status && values.status !== "all") {
    next.set("status", values.status);
  }
  if (values.page && values.page > 1) next.set("page", String(values.page));
  if (values.order) next.set("order", values.order);

  const query = next.toString();
  return query ? `/field/deliveries?${query}` : "/field/deliveries";
}

function getDealerAddress(
  profile:
    | {
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
      }
    | null
    | undefined,
) {
  if (!profile) return "";

  return [
    profile.addressLine1,
    profile.addressLine2,
    profile.city,
    profile.state,
    profile.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function getDeliveryMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "on-the-way": {
      type: "success",
      title: "Route started",
      text: "The order is now marked as On The Way.",
    },
    delivered: {
      type: "success",
      title: "Delivery completed",
      text: "The complete quantity is delivered. Record the signed proof next.",
    },
    "proof-uploaded": {
      type: "success",
      title: "Delivery proof uploaded",
      text: "The signed proof and uploader attribution were saved successfully.",
    },
    "proof-help-requested": {
      type: "success",
      title: "Manager request sent",
      text: "A manager can now upload the proof on your behalf.",
    },
    "proof-help-cancelled": {
      type: "success",
      title: "Manager request cancelled",
      text: "The assistance request is closed. You can upload the proof yourself.",
    },
  };
  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission to update delivery status.",
    "missing-order": "The order reference is missing.",
    "driver-not-found": "Your driver account was not found.",
    "order-not-found": "The selected order was not found.",
    "not-your-delivery": "This delivery is not assigned to your account.",
    "invalid-status": "This action is not allowed for the current delivery status.",
    "complete-quantity-required":
      "Every ordered item must be fully reserved before delivery can be completed.",
    "missing-proof": "Choose a signed delivery proof photo or PDF.",
    "invalid-proof-type": "Only JPG, PNG, WebP, or PDF files are allowed.",
    "proof-too-large": "The proof file must be 3 MB or smaller.",
    "invalid-proof-content": "The selected file content does not match its file type.",
    "proof-note-too-long": "The note must be 500 characters or less.",
    "proof-not-allowed": "Proof can be added only after delivery is completed.",
    "proof-already-uploaded": "Delivery proof is already uploaded for this order.",
    "proof-help-already-requested":
      "A manager assistance request is already pending for this order.",
    "proof-help-not-requested":
      "There is no pending manager assistance request to cancel.",
  };

  if (success && successMessages[success]) return successMessages[success];
  if (error && errorMessages[error]) {
    return {
      type: "error",
      title: "Delivery action failed",
      text: errorMessages[error],
    };
  }

  return null;
}

function getDeliveryStep(status: OrderStatus) {
  if (status === OrderStatus.TRANSPORT_ASSIGNED) return 0;
  if (status === OrderStatus.ON_THE_WAY) return 1;
  if (status === OrderStatus.DELIVERED) return 2;
  if (status === OrderStatus.INVOICE_UPLOADED) return 3;
  return 0;
}

export default async function FieldDeliveriesPage({
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
  const q = String(params?.q ?? "").trim();
  const status = queueFilters.some((item) => item.key === params?.status)
    ? (params?.status as DeliveryFilter)
    : "all";
  const requestedPage = Math.max(
    1,
    Number.parseInt(params?.page ?? "1", 10) || 1,
  );
  const requestedOrderId = String(params?.order ?? "").trim();
  const message = getDeliveryMessage(params?.error, params?.success);
  const { currentUser, hasAccess } = await checkPermission(
    "view_assigned_deliveries",
    "/field/deliveries",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Delivery Access Denied"
        description="Your current role does not have permission to view assigned deliveries."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const driver = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!driver) {
    return (
      <AccessDeniedCard
        title="Driver Account Not Found"
        description="Your driver account was not found in the database."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const baseWhere: Prisma.OrderWhereInput = {
    assignedDriverId: driver.id,
  };
  const searchWhere: Prisma.OrderWhereInput = q
    ? {
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" } },
          { dealer: { name: { contains: q, mode: "insensitive" } } },
          { dealer: { email: { contains: q, mode: "insensitive" } } },
          { dealer: { phone: { contains: q, mode: "insensitive" } } },
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
    : {};
  const where: Prisma.OrderWhereInput = {
    AND: [baseWhere, getFilterWhere(status), searchWhere],
  };

  const [
    totalMatching,
    readyCount,
    routeCount,
    proofCount,
    completedCount,
  ] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({
      where: { ...baseWhere, status: OrderStatus.TRANSPORT_ASSIGNED },
    }),
    prisma.order.count({
      where: { ...baseWhere, status: OrderStatus.ON_THE_WAY },
    }),
    prisma.order.count({
      where: {
        ...baseWhere,
        status: OrderStatus.DELIVERED,
        signedInvoiceStatus: { not: "UPLOADED" },
      },
    }),
    prisma.order.count({
      where: { ...baseWhere, status: OrderStatus.INVOICE_UPLOADED },
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
      signedInvoiceStatus: true,
      deliveryProofAssistanceStatus: true,
      updatedAt: true,
      dealer: { select: { name: true } },
      assignedDriver: { select: { name: true } },
      transportOption: { select: { name: true } },
      transportLabel: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const selectedOrderInclude = {
    dealer: {
      select: {
        name: true,
        email: true,
        phone: true,
        dealerProfile: {
          select: {
            businessName: true,
            contactPerson: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
          },
        },
      },
    },
    assignedDriver: { select: { name: true, phone: true } },
    transportOption: { select: { name: true, description: true } },
    items: {
      include: {
        product: {
          select: {
            name: true,
            code: true,
            stack: true,
            unit: true,
          },
        },
      },
      orderBy: { createdAt: "asc" as const },
    },
    statusHistory: { orderBy: { createdAt: "asc" as const } },
    deliveryProofs: {
      where: {
        proofType: "SIGNED_DUPLICATE_INVOICE",
        isActive: true,
      },
      include: {
        uploadedBy: { select: { name: true } },
      },
      orderBy: { uploadedAt: "desc" as const },
    },
  } satisfies Prisma.OrderInclude;

  const preferredOrderId = requestedOrderId || orders[0]?.id || "";
  let selectedOrder = preferredOrderId
    ? await prisma.order.findFirst({
        where: {
          id: preferredOrderId,
          assignedDriverId: driver.id,
          status: { in: DELIVERY_STATUSES },
        },
        include: selectedOrderInclude,
      })
    : null;

  if (!selectedOrder && orders[0] && orders[0].id !== preferredOrderId) {
    selectedOrder = await prisma.order.findFirst({
      where: {
        id: orders[0].id,
        assignedDriverId: driver.id,
        status: { in: DELIVERY_STATUSES },
      },
      include: selectedOrderInclude,
    });
  }

  const selectedOrderId = selectedOrder?.id ?? "";
  const queryState = { q, status, page, order: selectedOrderId };
  const allCount = readyCount + routeCount + proofCount + completedCount;
  const filterCounts: Record<DeliveryFilter, number> = {
    all: allCount,
    ready: readyCount,
    route: routeCount,
    proof: proofCount,
    complete: completedCount,
  };
  const metrics = [
    {
      label: "Ready to Start",
      value: readyCount,
      helper: "Assigned and waiting for departure",
      icon: "delivery" as const,
      tone: "amber" as const,
    },
    {
      label: "On Route",
      value: routeCount,
      helper: "Currently out for delivery",
      icon: "activity" as const,
      tone: "blue" as const,
    },
    {
      label: "Proof Pending",
      value: proofCount,
      helper: "Delivered, signed proof required",
      icon: "alert" as const,
      tone: "violet" as const,
    },
    {
      label: "Completed",
      value: completedCount,
      helper: "Delivery and proof both recorded",
      icon: "quality" as const,
      tone: "emerald" as const,
    },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:px-7">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-blue-100/90 blur-3xl dark:bg-blue-500/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-300">
                Stage 5 · Delivery & Proof
              </p>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-500/20">
                Mobile operations
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              My Delivery Route
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Start assigned routes, confirm complete delivery and record the
              signed proof without leaving your driver workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-white/10 dark:bg-slate-950">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Signed in as
              </p>
              <p className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">
                {driver.name}
              </p>
            </div>
            <Link
              href="/field/dashboard"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Field Dashboard
              <ErpIcon name="chevron-right" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <TeamFeedbackToast
        message={message}
        restoreScrollKey={DRIVER_DELIVERY_SCROLL_KEY}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <OperationsMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(350px,0.72fr)_minmax(0,1.28fr)]">
        <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
          <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">
                  Delivery queue
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
                <span className="sr-only">Search assigned deliveries</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Order, dealer or product..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500/40"
                />
              </label>
              <button
                type="submit"
                className="h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700"
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
                        ? "bg-slate-950 text-white dark:bg-blue-600"
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
              icon="delivery"
              title="No matching deliveries"
              description={
                q || status !== "all"
                  ? "Try another search or clear the queue filters."
                  : "New deliveries appear here after QC assigns you and a transport option."
              }
              action={
                q || status !== "all" ? (
                  <Link
                    href="/field/deliveries"
                    className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-blue-600"
                  >
                    Clear all filters
                  </Link>
                ) : null
              }
            />
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {orders.map((order) => {
                  const selected = order.id === selectedOrderId;
                  const proofPending =
                    order.status === OrderStatus.DELIVERED &&
                    order.signedInvoiceStatus !== "UPLOADED";

                  return (
                    <Link
                      key={order.id}
                      href={`${buildHref(queryState, {
                        order: order.id,
                      })}#delivery-detail`}
                      className={`block p-4 transition sm:p-5 ${
                        selected
                          ? "bg-blue-50/80 dark:bg-blue-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950 dark:text-white">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {order.dealer.name} · {order._count.items} product
                            {order._count.items === 1 ? "" : "s"}
                          </p>
                        </div>
                        <ErpIcon
                          name="chevron-right"
                          className="h-4 w-4 shrink-0 text-slate-400"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <OperationsStatusPill tone={getStatusTone(order.status)}>
                          {getOrderStatusLabel(order.status)}
                        </OperationsStatusPill>
                        {proofPending ? (
                          <OperationsStatusPill tone="violet">
                            Proof required
                          </OperationsStatusPill>
                        ) : null}
                        {order.deliveryProofAssistanceStatus === "REQUESTED" ? (
                          <OperationsStatusPill tone="amber">
                            Manager requested
                          </OperationsStatusPill>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                        <span className="truncate">
                          {order.transportOption?.name ||
                            order.transportLabel ||
                            "Transport assigned"}
                        </span>
                        <span className="shrink-0">
                          {compactDate(order.updatedAt)}
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
                        : "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"
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
                        : "border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"
                    }`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        <div id="delivery-detail" className="min-w-0 scroll-mt-28">
          {!selectedOrder ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
              <OperationsEmptyState
                icon="delivery"
                title="Select a delivery"
                description="Choose an assignment from the queue to view its route, products and available action."
              />
            </div>
          ) : (
            <article className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              {(() => {
                const summary = getOrderFulfillmentSummary(selectedOrder.items);
                const address = getDealerAddress(
                  selectedOrder.dealer.dealerProfile,
                );
                const currentStep = getDeliveryStep(selectedOrder.status);
                const steps = [
                  "Assigned",
                  "On The Way",
                  "Delivered",
                  "Proof Recorded",
                ];

                return (
                  <>
                    <header className="relative overflow-hidden border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
                      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-100/80 blur-3xl dark:bg-blue-500/10" />
                      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Assigned delivery
                          </p>
                          <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                            {selectedOrder.orderNumber}
                          </h2>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            {selectedOrder.dealer.dealerProfile?.businessName ||
                              selectedOrder.dealer.name}{" "}
                            · {selectedOrder.items.length} product line
                            {selectedOrder.items.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <OperationsStatusPill
                          tone={getStatusTone(selectedOrder.status)}
                        >
                          {getOrderStatusLabel(selectedOrder.status)}
                        </OperationsStatusPill>
                      </div>

                      <div className="relative mt-5 grid grid-cols-4 gap-1 sm:gap-2">
                        {steps.map((step, index) => {
                          const complete = index <= currentStep;
                          return (
                            <div key={step} className="min-w-0">
                              <div className="flex items-center">
                                <span
                                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black ring-4 ${
                                    complete
                                      ? "bg-blue-600 text-white ring-blue-100 dark:ring-blue-500/15"
                                      : "bg-slate-100 text-slate-400 ring-white dark:bg-white/5 dark:ring-slate-900"
                                  }`}
                                >
                                  {complete ? "✓" : index + 1}
                                </span>
                                {index < steps.length - 1 ? (
                                  <span
                                    className={`h-0.5 flex-1 ${
                                      index < currentStep
                                        ? "bg-blue-500"
                                        : "bg-slate-200 dark:bg-white/10"
                                    }`}
                                  />
                                ) : null}
                              </div>
                              <p
                                className={`mt-2 truncate text-[9px] font-black uppercase tracking-[0.08em] sm:text-[10px] ${
                                  complete
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-slate-400"
                                }`}
                              >
                                {step}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </header>

                    <div className="space-y-5 p-4 sm:p-6">
                      <section className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/70">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            Dealer & destination
                          </p>
                          <h3 className="mt-2 font-black text-slate-950 dark:text-white">
                            {selectedOrder.dealer.dealerProfile?.businessName ||
                              selectedOrder.dealer.name}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            Contact:{" "}
                            {selectedOrder.dealer.dealerProfile?.contactPerson ||
                              selectedOrder.dealer.name}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {address || "Delivery address is not recorded."}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {selectedOrder.dealer.phone ? (
                              <a
                                href={`tel:${selectedOrder.dealer.phone}`}
                                className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-blue-600 dark:bg-blue-600"
                              >
                                Call Dealer
                              </a>
                            ) : null}
                            {address ? (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:text-slate-200"
                              >
                                Open in Maps
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/70">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            Delivery assignment
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-slate-400">Driver</p>
                              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                                {selectedOrder.assignedDriver?.name ||
                                  driver.name}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Transport</p>
                              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                                {selectedOrder.transportOption?.name ||
                                  selectedOrder.transportLabel ||
                                  "Assigned"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Ordered</p>
                              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                                {summary.requested} units
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Delivered</p>
                              <p className="mt-1 text-sm font-black text-emerald-700 dark:text-emerald-300">
                                {summary.delivered} units
                              </p>
                            </div>
                          </div>
                          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            Assigned record updated{" "}
                            {formatDateTime(selectedOrder.updatedAt)}
                          </p>
                        </div>
                      </section>

                      {selectedOrder.notes ? (
                        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
                          <strong>Order note:</strong> {selectedOrder.notes}
                        </section>
                      ) : null}

                      <section>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-black text-slate-950 dark:text-white">
                              Product manifest
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Complete-order delivery only; partial completion is
                              not available.
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-white/5 dark:text-slate-300">
                            {selectedOrder.items.length} lines
                          </span>
                        </div>

                        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block dark:border-white/10">
                          <table className="w-full min-w-[620px] border-collapse text-left">
                            <thead className="bg-slate-50 dark:bg-slate-950/60">
                              <tr>
                                {[
                                  "Product",
                                  "Stack",
                                  "Ordered",
                                  "Ready",
                                  "Delivered",
                                ].map((heading) => (
                                  <th
                                    key={heading}
                                    className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400"
                                  >
                                    {heading}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                              {selectedOrder.items.map((item) => {
                                const itemSummary =
                                  getItemFulfillmentSummary(item);
                                return (
                                  <tr key={item.id}>
                                    <td className="px-4 py-4">
                                      <p className="font-black text-slate-900 dark:text-white">
                                        {item.product.name}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-400">
                                        {item.product.code} · {item.product.unit}
                                      </p>
                                    </td>
                                    <td className="px-4 py-4 text-sm font-bold text-slate-600 dark:text-slate-300">
                                      {item.product.stack}
                                    </td>
                                    <td className="px-4 py-4 text-sm font-black text-slate-800 dark:text-slate-100">
                                      {itemSummary.requested}
                                    </td>
                                    <td className="px-4 py-4 text-sm font-black text-blue-600 dark:text-blue-300">
                                      {itemSummary.blocked}
                                    </td>
                                    <td className="px-4 py-4 text-sm font-black text-emerald-700 dark:text-emerald-300">
                                      {itemSummary.delivered}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-4 grid gap-3 md:hidden">
                          {selectedOrder.items.map((item) => {
                            const itemSummary = getItemFulfillmentSummary(item);
                            return (
                              <article
                                key={item.id}
                                className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                              >
                                <p className="font-black text-slate-950 dark:text-white">
                                  {item.product.name}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  {item.product.code} · {item.product.stack}
                                </p>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                  {[
                                    ["Ordered", itemSummary.requested],
                                    ["Ready", itemSummary.blocked],
                                    ["Delivered", itemSummary.delivered],
                                  ].map(([label, value]) => (
                                    <div
                                      key={String(label)}
                                      className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-white/5"
                                    >
                                      <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                        {label}
                                      </p>
                                      <p className="mt-1 text-sm font-black text-slate-800 dark:text-white">
                                        {value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>

                      <section className="rounded-[22px] border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-400/20 dark:bg-blue-500/5 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                              Current action
                            </p>
                            <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                              {selectedOrder.status ===
                              OrderStatus.TRANSPORT_ASSIGNED
                                ? "Start this delivery route"
                                : selectedOrder.status === OrderStatus.ON_THE_WAY
                                  ? "Confirm complete delivery"
                                  : selectedOrder.status === OrderStatus.DELIVERED
                                    ? "Record signed delivery proof"
                                    : "Delivery record complete"}
                            </h3>
                          </div>
                          <OperationsStatusPill
                            tone={getStatusTone(selectedOrder.status)}
                          >
                            Step {currentStep + 1} of 4
                          </OperationsStatusPill>
                        </div>

                        {selectedOrder.status ===
                        OrderStatus.TRANSPORT_ASSIGNED ? (
                          <div className="mt-4">
                            <p className="mb-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                              Start only when the complete order is loaded and
                              you are ready to leave for the dealer.
                            </p>
                            <MarkOnTheWayForm orderId={selectedOrder.id} />
                          </div>
                        ) : null}

                        {selectedOrder.status === OrderStatus.ON_THE_WAY ? (
                          <div className="mt-4">
                            <p className="mb-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                              This confirms every ordered item was delivered and
                              consumes the complete reserved stock.
                            </p>
                            <MarkDeliveredForm orderId={selectedOrder.id} />
                          </div>
                        ) : null}

                        {selectedOrder.status === OrderStatus.DELIVERED &&
                        selectedOrder.deliveryProofs.length === 0 ? (
                          <DriverProofOptions
                            orderId={selectedOrder.id}
                            assistanceRequested={
                              selectedOrder.deliveryProofAssistanceStatus ===
                              "REQUESTED"
                            }
                          />
                        ) : null}

                        {selectedOrder.deliveryProofs.length > 0 ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-400/20 dark:bg-slate-950/70">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-black text-emerald-800 dark:text-emerald-200">
                                  Signed proof recorded
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                  Delivered by{" "}
                                  {selectedOrder.deliveredByName ||
                                    selectedOrder.assignedDriver?.name ||
                                    driver.name}
                                  . Proof attribution is preserved below.
                                </p>
                              </div>
                              <OperationsStatusPill tone="emerald">
                                Complete
                              </OperationsStatusPill>
                            </div>
                            <DeliveryProofGallery
                              orderNumber={selectedOrder.orderNumber}
                              proofs={selectedOrder.deliveryProofs.map(
                                (proof) => ({
                                  id: proof.id,
                                  fileUrl: `/field/deliveries/proof/${proof.id}`,
                                  fileName: proof.fileName,
                                  mimeType: proof.mimeType,
                                  uploadedAtLabel: formatDateTime(
                                    proof.uploadedAt,
                                  ),
                                  uploadSourceLabel:
                                    proof.uploadMode === "MANAGER_ASSISTED"
                                      ? "Manager Assisted"
                                      : proof.uploadMode === "INTERNAL_UPLOAD"
                                        ? "Internal Replacement"
                                        : "Driver Self Upload",
                                  uploadedByLabel:
                                    proof.uploadedBy?.name || "Recorded user",
                                }),
                              )}
                            />
                          </div>
                        ) : null}

                        {selectedOrder.status ===
                          OrderStatus.INVOICE_UPLOADED &&
                        selectedOrder.deliveryProofs.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                            The order is complete, but its active proof record is
                            unavailable. Contact your manager for review.
                          </div>
                        ) : null}
                      </section>

                      <OrderStatusTimeline
                        history={selectedOrder.statusHistory}
                        theme="light"
                        visibleCount={5}
                      />
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
