import Link from "next/link";
import {
  DeliveryProofAssistanceStatus,
  OrderStatus,
  Prisma,
} from "@/generated/prisma/client";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { DeliveryProofGallery } from "@/components/delivery-proof-gallery";
import { ErpIcon } from "@/components/erp-icon";
import {
  ManagerProofUploadForm,
  MANAGER_PROOF_SCROLL_KEY,
  ReplaceDeliveryProofForm,
} from "@/components/manager-proof-upload-form";
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

const PAGE_SIZE = 10;

const PROOF_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.INVOICE_UPLOADED,
];

const queueFilters = [
  { key: "all", label: "All Delivery Records" },
  { key: "requests", label: "Manager Requests" },
  { key: "pending", label: "Proof Pending" },
  { key: "uploaded", label: "Proof Uploaded" },
  { key: "replaced", label: "Replaced Proofs" },
] as const;

type ProofFilter = (typeof queueFilters)[number]["key"];

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

function getIndiaDayBounds() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const start = new Date(
    `${values.year}-${values.month}-${values.day}T00:00:00+05:30`,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

function getUploadModeLabel(uploadMode: string) {
  if (uploadMode === "MANAGER_ASSISTED") return "Manager Assisted";
  if (uploadMode === "INTERNAL_UPLOAD") return "Internal Replacement";
  return "Driver Self Upload";
}

function getUploadModeTone(uploadMode: string): OperationsTone {
  if (uploadMode === "MANAGER_ASSISTED") return "violet";
  if (uploadMode === "INTERNAL_UPLOAD") return "amber";
  return "blue";
}

function getFilterWhere(filter: ProofFilter): Prisma.OrderWhereInput {
  if (filter === "requests") {
    return {
      status: { in: PROOF_ORDER_STATUSES },
      deliveryProofAssistanceStatus:
        DeliveryProofAssistanceStatus.REQUESTED,
      signedInvoiceStatus: { not: "UPLOADED" },
    };
  }
  if (filter === "pending") {
    return {
      status: OrderStatus.DELIVERED,
      signedInvoiceStatus: { not: "UPLOADED" },
    };
  }
  if (filter === "uploaded") {
    return {
      status: { in: PROOF_ORDER_STATUSES },
      signedInvoiceStatus: "UPLOADED",
    };
  }
  if (filter === "replaced") {
    return {
      status: { in: PROOF_ORDER_STATUSES },
      deliveryProofs: {
        some: {
          proofType: "SIGNED_DUPLICATE_INVOICE",
          isActive: false,
        },
      },
    };
  }

  return { status: { in: PROOF_ORDER_STATUSES } };
}

function buildHref(
  params: {
    q?: string;
    status?: ProofFilter;
    page?: number;
    order?: string;
  },
  patch: Partial<{
    q: string;
    status: ProofFilter;
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
  return query
    ? `/internal/delivery-proofs?${query}`
    : "/internal/delivery-proofs";
}

function getMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "manager-proof-uploaded": {
      type: "success",
      title: "Delivery proof uploaded",
      text: "The proof, delivery attribution and manager audit record were saved.",
    },
    "proof-replaced": {
      type: "success",
      title: "Delivery proof replaced",
      text: "The corrected proof is active and the previous version remains archived.",
    },
  };
  const errors: Record<string, string> = {
    "missing-order": "The order reference is missing.",
    "order-not-found": "The selected order no longer exists.",
    "assistance-not-requested":
      "The driver has not requested manager assistance for this order.",
    "proof-already-uploaded": "Delivery proof is already uploaded for this order.",
    "proof-not-allowed":
      "Proof cannot be uploaded for the current delivery status.",
    "missing-proof": "Select a proof photo or PDF.",
    "invalid-proof-type": "Only JPG, PNG, WebP, or PDF files are allowed.",
    "proof-too-large": "The proof file must be 3 MB or smaller.",
    "invalid-proof-content": "The selected file content does not match its file type.",
    "proof-note-too-long": "The upload note must be 500 characters or less.",
    "replacement-reason-required":
      "Enter a replacement reason of at least 10 characters.",
    "replacement-reason-too-long":
      "The replacement reason must be 500 characters or less.",
    "proof-not-found-for-replacement":
      "No active proof is available to replace for this order.",
    "replacement-file-unchanged":
      "Choose a different corrected file; it matches the active proof.",
    "replacement-upload-conflict":
      "Another proof update completed at the same time. Refresh and try again.",
  };

  if (success && successMessages[success]) return successMessages[success];
  if (error && errors[error]) {
    return {
      type: "error",
      title: "Proof action failed",
      text: errors[error],
    };
  }

  return null;
}

export default async function DeliveryProofAssistancePage({
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
    ? (params?.status as ProofFilter)
    : "all";
  const requestedPage = Math.max(
    1,
    Number.parseInt(params?.page ?? "1", 10) || 1,
  );
  const requestedOrderId = String(params?.order ?? "").trim();
  const { hasAccess } = await checkPermission(
    "manage_delivery_proofs",
    "/internal/delivery-proofs",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Delivery Proof Access Denied"
        description="Your account does not have permission to manage delivery proof records."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const searchWhere: Prisma.OrderWhereInput = q
    ? {
        OR: [
          { orderNumber: { contains: q, mode: "insensitive" } },
          { dealer: { name: { contains: q, mode: "insensitive" } } },
          { dealer: { email: { contains: q, mode: "insensitive" } } },
          {
            assignedDriver: {
              name: { contains: q, mode: "insensitive" },
            },
          },
          {
            deliveryProofs: {
              some: {
                fileName: { contains: q, mode: "insensitive" },
              },
            },
          },
        ],
      }
    : {};
  const where: Prisma.OrderWhereInput = {
    AND: [getFilterWhere(status), searchWhere],
  };
  const { start: todayStart, end: todayEnd } = getIndiaDayBounds();

  const [
    totalMatching,
    managerRequestCount,
    pendingProofCount,
    uploadedCount,
    replacedOrderCount,
    uploadedToday,
  ] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({
      where: {
        status: { in: PROOF_ORDER_STATUSES },
        deliveryProofAssistanceStatus:
          DeliveryProofAssistanceStatus.REQUESTED,
        signedInvoiceStatus: { not: "UPLOADED" },
      },
    }),
    prisma.order.count({
      where: {
        status: OrderStatus.DELIVERED,
        signedInvoiceStatus: { not: "UPLOADED" },
      },
    }),
    prisma.order.count({
      where: {
        status: { in: PROOF_ORDER_STATUSES },
        signedInvoiceStatus: "UPLOADED",
      },
    }),
    prisma.order.count({
      where: {
        status: { in: PROOF_ORDER_STATUSES },
        deliveryProofs: {
          some: {
            proofType: "SIGNED_DUPLICATE_INVOICE",
            isActive: false,
          },
        },
      },
    }),
    prisma.deliveryProof.count({
      where: {
        proofType: "SIGNED_DUPLICATE_INVOICE",
        isActive: true,
        uploadedAt: { gte: todayStart, lt: todayEnd },
      },
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
      deliveryProofRequestedAt: true,
      deliveredAt: true,
      updatedAt: true,
      dealer: { select: { name: true } },
      assignedDriver: { select: { name: true } },
      deliveryProofs: {
        where: {
          proofType: "SIGNED_DUPLICATE_INVOICE",
          isActive: true,
        },
        select: {
          fileName: true,
          uploadMode: true,
          uploadedAt: true,
        },
        orderBy: { uploadedAt: "desc" },
        take: 1,
      },
      _count: { select: { items: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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
            city: true,
            state: true,
          },
        },
      },
    },
    assignedDriver: {
      select: { name: true, email: true, phone: true },
    },
    items: {
      include: {
        product: {
          select: { name: true, code: true, unit: true },
        },
      },
      orderBy: { createdAt: "asc" as const },
    },
    deliveryProofs: {
      where: { proofType: "SIGNED_DUPLICATE_INVOICE" },
      include: {
        uploadedBy: { select: { name: true } },
        replacedBy: { select: { name: true } },
      },
      orderBy: { uploadedAt: "desc" as const },
    },
  } satisfies Prisma.OrderInclude;

  const preferredOrderId = requestedOrderId || orders[0]?.id || "";
  let selectedOrder = preferredOrderId
    ? await prisma.order.findFirst({
        where: {
          id: preferredOrderId,
          status: { in: PROOF_ORDER_STATUSES },
        },
        include: selectedOrderInclude,
      })
    : null;

  if (!selectedOrder && orders[0] && orders[0].id !== preferredOrderId) {
    selectedOrder = await prisma.order.findFirst({
      where: {
        id: orders[0].id,
        status: { in: PROOF_ORDER_STATUSES },
      },
      include: selectedOrderInclude,
    });
  }

  const selectedOrderId = selectedOrder?.id ?? "";
  const queryState = { q, status, page, order: selectedOrderId };
  const filterCounts: Record<ProofFilter, number> = {
    all: pendingProofCount + uploadedCount,
    requests: managerRequestCount,
    pending: pendingProofCount,
    uploaded: uploadedCount,
    replaced: replacedOrderCount,
  };
  const metrics = [
    {
      label: "Manager Requests",
      value: managerRequestCount,
      helper: "Driver assistance waiting for action",
      icon: "users" as const,
      tone: "amber" as const,
    },
    {
      label: "All Proof Pending",
      value: pendingProofCount,
      helper: "Delivered records without active proof",
      icon: "alert" as const,
      tone: "violet" as const,
    },
    {
      label: "Uploaded Today",
      value: uploadedToday,
      helper: "Active proofs recorded today in India",
      icon: "quality" as const,
      tone: "emerald" as const,
    },
    {
      label: "Replaced Records",
      value: replacedOrderCount,
      helper: "Orders with preserved proof history",
      icon: "activity" as const,
      tone: "blue" as const,
    },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:px-7">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-violet-100/90 blur-3xl dark:bg-violet-500/10" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-600 dark:text-violet-300">
                Stage 5 · Delivery Evidence
              </p>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/20">
                Controlled proof audit
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Delivery Proof Control
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Resolve driver assistance, verify uploader attribution and retain
              every replaced proof version in one searchable workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/internal/qc"
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              QC & Delivery
            </Link>
            <Link
              href="/internal/security"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-500"
            >
              Security Audit
              <ErpIcon name="chevron-right" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <TeamFeedbackToast
        message={getMessage(params?.error, params?.success)}
        restoreScrollKey={MANAGER_PROOF_SCROLL_KEY}
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
                  Proof oversight queue
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {totalMatching} matching delivery record
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
                <span className="sr-only">Search delivery proofs</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Order, dealer, driver or proof..."
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

          {orders.length === 0 ? (
            <OperationsEmptyState
              icon="quality"
              title="No matching proof records"
              description={
                q || status !== "all"
                  ? "Try another search or clear the proof filters."
                  : "Delivered orders appear here when proof follow-up begins."
              }
              action={
                q || status !== "all" ? (
                  <Link
                    href="/internal/delivery-proofs"
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
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left dark:border-white/10 dark:bg-slate-950/60">
                      {[
                        "Order & dealer",
                        "Driver",
                        "Proof state",
                        "Products",
                        "Updated",
                        "",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {orders.map((order) => {
                      const selected = order.id === selectedOrderId;
                      const activeProof = order.deliveryProofs[0];

                      return (
                        <tr
                          key={order.id}
                          className={
                            selected
                              ? "bg-violet-50/70 dark:bg-violet-500/10"
                              : "transition hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                          }
                        >
                          <td className="px-4 py-4">
                            <Link
                              href={`${buildHref(queryState, {
                                order: order.id,
                              })}#proof-detail`}
                              className="font-black text-slate-950 hover:text-violet-700 dark:text-white dark:hover:text-violet-300"
                            >
                              {order.orderNumber}
                            </Link>
                            <p className="mt-1 max-w-44 truncate text-xs text-slate-500 dark:text-slate-400">
                              {order.dealer.name}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                            {order.assignedDriver?.name || "Not assigned"}
                          </td>
                          <td className="px-4 py-4">
                            {activeProof ? (
                              <OperationsStatusPill
                                tone={getUploadModeTone(activeProof.uploadMode)}
                              >
                                {getUploadModeLabel(activeProof.uploadMode)}
                              </OperationsStatusPill>
                            ) : order.deliveryProofAssistanceStatus ===
                              DeliveryProofAssistanceStatus.REQUESTED ? (
                              <OperationsStatusPill tone="amber">
                                Manager requested
                              </OperationsStatusPill>
                            ) : (
                              <OperationsStatusPill tone="violet">
                                Proof pending
                              </OperationsStatusPill>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm font-black text-slate-700 dark:text-slate-200">
                            {order._count.items}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                            {compactDate(
                              activeProof?.uploadedAt || order.updatedAt,
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`${buildHref(queryState, {
                                order: order.id,
                              })}#proof-detail`}
                              aria-label={`Open ${order.orderNumber} proof record`}
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
                {orders.map((order) => {
                  const selected = order.id === selectedOrderId;
                  const activeProof = order.deliveryProofs[0];

                  return (
                    <Link
                      key={order.id}
                      href={`${buildHref(queryState, {
                        order: order.id,
                      })}#proof-detail`}
                      className={`block p-4 transition ${
                        selected
                          ? "bg-violet-50 dark:bg-violet-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950 dark:text-white">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {order.dealer.name} ·{" "}
                            {order.assignedDriver?.name || "Driver unavailable"}
                          </p>
                        </div>
                        <ErpIcon
                          name="chevron-right"
                          className="h-4 w-4 shrink-0 text-slate-400"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {activeProof ? (
                          <OperationsStatusPill
                            tone={getUploadModeTone(activeProof.uploadMode)}
                          >
                            {getUploadModeLabel(activeProof.uploadMode)}
                          </OperationsStatusPill>
                        ) : order.deliveryProofAssistanceStatus ===
                          DeliveryProofAssistanceStatus.REQUESTED ? (
                          <OperationsStatusPill tone="amber">
                            Manager requested
                          </OperationsStatusPill>
                        ) : (
                          <OperationsStatusPill tone="violet">
                            Proof pending
                          </OperationsStatusPill>
                        )}
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {order._count.items} products
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
                        : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:text-slate-300"
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

        <div id="proof-detail" className="min-w-0 scroll-mt-24">
          {!selectedOrder ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
              <OperationsEmptyState
                icon="quality"
                title="Select a delivery record"
                description="Choose an order from the queue to inspect its proof state, attribution and version history."
              />
            </div>
          ) : (
            <article className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
              {(() => {
                const activeProof = selectedOrder.deliveryProofs.find(
                  (proof) => proof.isActive,
                );
                const archivedProofs = selectedOrder.deliveryProofs.filter(
                  (proof) => !proof.isActive,
                );
                const totalDelivered = selectedOrder.items.reduce(
                  (total, item) => total + item.deliveredQuantity,
                  0,
                );
                const managerRequested =
                  selectedOrder.deliveryProofAssistanceStatus ===
                    DeliveryProofAssistanceStatus.REQUESTED && !activeProof;

                return (
                  <>
                    <header className="relative overflow-hidden border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
                      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-100/80 blur-3xl dark:bg-violet-500/10" />
                      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Delivery evidence record
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
                        {activeProof ? (
                          <OperationsStatusPill tone="emerald">
                            Active proof recorded
                          </OperationsStatusPill>
                        ) : managerRequested ? (
                          <OperationsStatusPill tone="amber">
                            Manager action required
                          </OperationsStatusPill>
                        ) : (
                          <OperationsStatusPill tone="violet">
                            Driver proof pending
                          </OperationsStatusPill>
                        )}
                      </div>
                    </header>

                    <div className="space-y-5 p-4 sm:p-6">
                      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[
                          [
                            "Delivered by",
                            selectedOrder.deliveredByName ||
                              selectedOrder.assignedDriver?.name ||
                              "Not recorded",
                          ],
                          [
                            "Proof uploaded by",
                            activeProof?.uploadedBy?.name || "Pending",
                          ],
                          [
                            "Upload method",
                            activeProof
                              ? getUploadModeLabel(activeProof.uploadMode)
                              : "Not uploaded",
                          ],
                          [
                            "Delivered quantity",
                            `${totalDelivered} units`,
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-950/70"
                          >
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                              {label}
                            </p>
                            <p className="mt-2 break-words text-sm font-black text-slate-900 dark:text-white">
                              {value}
                            </p>
                          </div>
                        ))}
                      </section>

                      <section className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            Dealer
                          </p>
                          <p className="mt-2 font-black text-slate-950 dark:text-white">
                            {selectedOrder.dealer.dealerProfile?.businessName ||
                              selectedOrder.dealer.name}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {selectedOrder.dealer.dealerProfile?.contactPerson ||
                              selectedOrder.dealer.name}
                            {selectedOrder.dealer.phone
                              ? ` · ${selectedOrder.dealer.phone}`
                              : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {selectedOrder.dealer.email}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            Driver
                          </p>
                          <p className="mt-2 font-black text-slate-950 dark:text-white">
                            {selectedOrder.assignedDriver?.name ||
                              selectedOrder.deliveredByName ||
                              "Not recorded"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {selectedOrder.assignedDriver?.phone ||
                              "Phone unavailable"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Delivered{" "}
                            {formatDateTime(selectedOrder.deliveredAt)}
                          </p>
                        </div>
                      </section>

                      {selectedOrder.deliveryProofRequestNote ? (
                        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                            Driver assistance note
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                            {selectedOrder.deliveryProofRequestNote}
                          </p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Requested by{" "}
                            {selectedOrder.deliveryProofRequestedByName ||
                              selectedOrder.assignedDriver?.name ||
                              "Driver"}{" "}
                            ·{" "}
                            {formatDateTime(
                              selectedOrder.deliveryProofRequestedAt,
                            )}
                          </p>
                        </section>
                      ) : null}

                      {managerRequested ? (
                        <section className="rounded-[22px] border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-400/20 dark:bg-violet-500/5 sm:p-5">
                          <div className="flex items-start gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                              <ErpIcon name="users" className="h-5 w-5" />
                            </span>
                            <div>
                              <h3 className="font-black text-slate-950 dark:text-white">
                                Upload proof for the driver
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                Confirm the received file belongs to this order.
                                The audit will preserve both delivered-by and
                                uploaded-by identities.
                              </p>
                            </div>
                          </div>
                          <ManagerProofUploadForm orderId={selectedOrder.id} />
                        </section>
                      ) : null}

                      {!activeProof && !managerRequested ? (
                        <section className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center dark:border-white/15">
                          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300">
                            <ErpIcon name="quality" className="h-5 w-5" />
                          </span>
                          <h3 className="mt-3 font-black text-slate-950 dark:text-white">
                            Waiting for driver proof
                          </h3>
                          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                            Manager upload remains locked until the assigned
                            driver explicitly requests assistance.
                          </p>
                        </section>
                      ) : null}

                      {activeProof ? (
                        <section className="rounded-[22px] border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/5 sm:p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                                Active signed proof
                              </p>
                              <h3 className="mt-1 font-black text-slate-950 dark:text-white">
                                {activeProof.fileName}
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                Uploaded by{" "}
                                {activeProof.uploadedBy?.name || "Unknown user"}{" "}
                                · {getUploadModeLabel(activeProof.uploadMode)} ·{" "}
                                {formatDateTime(activeProof.uploadedAt)}
                              </p>
                            </div>
                            <OperationsStatusPill
                              tone={getUploadModeTone(activeProof.uploadMode)}
                            >
                              {getUploadModeLabel(activeProof.uploadMode)}
                            </OperationsStatusPill>
                          </div>
                          {activeProof.note ? (
                            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-slate-950/70 dark:text-slate-300">
                              {activeProof.note}
                            </p>
                          ) : null}
                          <DeliveryProofGallery
                            orderNumber={selectedOrder.orderNumber}
                            proofs={[
                              {
                                id: activeProof.id,
                                fileUrl: `/field/deliveries/proof/${activeProof.id}`,
                                fileName: activeProof.fileName,
                                mimeType: activeProof.mimeType,
                                uploadedAtLabel: formatDateTime(
                                  activeProof.uploadedAt,
                                ),
                                uploadSourceLabel: getUploadModeLabel(
                                  activeProof.uploadMode,
                                ),
                                uploadedByLabel:
                                  activeProof.uploadedBy?.name || "Unknown user",
                              },
                            ]}
                          />
                          <ReplaceDeliveryProofForm
                            orderId={selectedOrder.id}
                          />
                        </section>
                      ) : null}

                      <section>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <h3 className="text-lg font-black text-slate-950 dark:text-white">
                              Proof audit trail
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Every file version and replacement reason stays
                              available to authorized internal users.
                            </p>
                          </div>
                          <OperationsStatusPill
                            tone={archivedProofs.length > 0 ? "amber" : "slate"}
                          >
                            {archivedProofs.length} archived version
                            {archivedProofs.length === 1 ? "" : "s"}
                          </OperationsStatusPill>
                        </div>

                        {selectedOrder.deliveryProofs.length === 0 ? (
                          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
                            No proof versions recorded yet.
                          </p>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {selectedOrder.deliveryProofs.map((proof) => (
                              <article
                                key={proof.id}
                                className={`rounded-2xl border p-4 ${
                                  proof.isActive
                                    ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-400/20 dark:bg-emerald-500/5"
                                    : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/60"
                                }`}
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="break-all text-sm font-black text-slate-900 dark:text-white">
                                        {proof.fileName}
                                      </p>
                                      <OperationsStatusPill
                                        tone={
                                          proof.isActive ? "emerald" : "slate"
                                        }
                                      >
                                        {proof.isActive
                                          ? "Active"
                                          : "Archived"}
                                      </OperationsStatusPill>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                      Uploaded by{" "}
                                      {proof.uploadedBy?.name || "Unknown user"}{" "}
                                      · {getUploadModeLabel(proof.uploadMode)} ·{" "}
                                      {formatDateTime(proof.uploadedAt)}
                                    </p>
                                    {!proof.isActive ? (
                                      <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                                        Replaced by{" "}
                                        {proof.replacedBy?.name ||
                                          proof.replacedByName ||
                                          "System"}{" "}
                                        on {formatDateTime(proof.replacedAt)} ·{" "}
                                        {proof.replacementReason ||
                                          "Replacement reason unavailable"}
                                      </p>
                                    ) : null}
                                  </div>
                                  <a
                                    href={`/field/deliveries/proof/${proof.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-3 text-[11px] font-black text-slate-600 transition hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:text-slate-300"
                                  >
                                    View File
                                  </a>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="grid gap-3 sm:grid-cols-3">
                        {selectedOrder.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"
                          >
                            <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                              {item.product.name}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {item.product.code}
                            </p>
                            <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                              {item.deliveredQuantity} {item.product.unit}{" "}
                              delivered
                            </p>
                          </div>
                        ))}
                      </section>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                        <span>
                          Order status:{" "}
                          <strong>{getOrderStatusLabel(selectedOrder.status)}</strong>
                        </span>
                        <span>
                          Record updated {formatDateTime(selectedOrder.updatedAt)}
                        </span>
                      </div>
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
