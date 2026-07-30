import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { ErpIcon } from "@/components/erp-icon";
import {
  OperationsEmptyState,
  OperationsMetricCard,
  OperationsStatusPill,
} from "@/components/operations-workspace-ui";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import {
  CreateTransportOptionForm,
  ToggleTransportOptionForm,
  TRANSPORT_OPTION_SCROLL_KEY,
  UpdateTransportOptionForm,
} from "@/components/transport-option-forms";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 8;

const optionFilters = [
  { key: "all", label: "All Options" },
  { key: "active", label: "Active" },
  { key: "disabled", label: "Disabled" },
] as const;

type OptionFilter = (typeof optionFilters)[number]["key"];

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function getMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    created: {
      type: "success",
      title: "Transport option created",
      text: "The new option is available for future QC delivery assignments.",
    },
    updated: {
      type: "success",
      title: "Transport option updated",
      text: "The option details and audit attribution were saved.",
    },
    enabled: {
      type: "success",
      title: "Transport option enabled",
      text: "The option is available for new delivery assignments.",
    },
    disabled: {
      type: "success",
      title: "Transport option disabled",
      text: "Future assignment is blocked while historical orders remain unchanged.",
    },
  };
  const errorMessages: Record<string, string> = {
    "permission-denied":
      "You do not have permission to manage transport options.",
    "missing-name": "Transport name is required.",
    "name-too-long": "Transport name must be 80 characters or less.",
    "description-too-long": "Description must be 300 characters or less.",
    "invalid-sort-order":
      "Sort order must be a whole number between 0 and 9999.",
    "duplicate-name": "A transport option with this name already exists.",
    "missing-option": "Transport option id is missing.",
    "option-not-found": "The selected transport option was not found.",
  };

  if (success && successMessages[success]) return successMessages[success];
  if (error && errorMessages[error]) {
    return {
      type: "error",
      title: "Transport action failed",
      text: errorMessages[error],
    };
  }

  return null;
}

function buildHref(
  params: { q?: string; status?: OptionFilter; page?: number },
  patch: Partial<{ q: string; status: OptionFilter; page: number }>,
) {
  const values = { ...params, ...patch };
  const next = new URLSearchParams();

  if (values.q) next.set("q", values.q);
  if (values.status && values.status !== "all") {
    next.set("status", values.status);
  }
  if (values.page && values.page > 1) next.set("page", String(values.page));

  const query = next.toString();
  return query ? `/internal/transport?${query}` : "/internal/transport";
}

export default async function TransportOptionsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    q?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = String(params?.q ?? "").trim();
  const status = optionFilters.some((item) => item.key === params?.status)
    ? (params?.status as OptionFilter)
    : "all";
  const requestedPage = Math.max(
    1,
    Number.parseInt(params?.page ?? "1", 10) || 1,
  );
  const { hasAccess } = await checkPermission(
    "manage_transport_options",
    "/internal/transport",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Transport Access Denied"
        description="Your account does not have permission to manage transport options."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const statusWhere: Prisma.TransportOptionWhereInput =
    status === "active"
      ? { isActive: true }
      : status === "disabled"
        ? { isActive: false }
        : {};
  const where: Prisma.TransportOptionWhereInput = {
    AND: [
      statusWhere,
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { createdByName: { contains: q, mode: "insensitive" } },
              { updatedByName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [totalMatching, totalCount, activeCount, assignedCount] =
    await Promise.all([
      prisma.transportOption.count({ where }),
      prisma.transportOption.count(),
      prisma.transportOption.count({ where: { isActive: true } }),
      prisma.order.count({ where: { transportOptionId: { not: null } } }),
    ]);
  const disabledCount = totalCount - activeCount;
  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const transportOptions = await prisma.transportOption.findMany({
    where,
    include: { _count: { select: { orders: true } } },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const filterCounts: Record<OptionFilter, number> = {
    all: totalCount,
    active: activeCount,
    disabled: disabledCount,
  };
  const queryState = { q, status, page };
  const metrics = [
    {
      label: "Active Options",
      value: activeCount,
      helper: "Available during QC assignment",
      icon: "delivery" as const,
      tone: "emerald" as const,
    },
    {
      label: "Disabled",
      value: disabledCount,
      helper: "Hidden from future assignments",
      icon: "alert" as const,
      tone: "rose" as const,
    },
    {
      label: "Assigned Orders",
      value: assignedCount,
      helper: "Orders carrying a transport reference",
      icon: "activity" as const,
      tone: "blue" as const,
    },
    {
      label: "Total Options",
      value: totalCount,
      helper: "Active and historical definitions",
      icon: "quality" as const,
      tone: "slate" as const,
    },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:px-7">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-cyan-100/90 blur-3xl dark:bg-cyan-500/10" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-700 dark:text-cyan-300">
                Delivery Configuration
              </p>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-200 dark:ring-cyan-500/20">
                Audit-safe setup
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Transport Options
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Maintain the transport methods available during QC handoff.
              Disable retired options instead of deleting historical references.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/internal/qc"
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-cyan-200 hover:text-cyan-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              QC & Delivery
            </Link>
            <Link
              href="/internal/delivery-proofs"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-cyan-700 dark:bg-cyan-700 dark:hover:bg-cyan-600"
            >
              Delivery Proofs
              <ErpIcon name="chevron-right" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <TeamFeedbackToast
        message={getMessage(params?.error, params?.success)}
        restoreScrollKey={TRANSPORT_OPTION_SCROLL_KEY}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <OperationsMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="rounded-[24px] border border-blue-200 bg-blue-50/50 p-4 shadow-sm dark:border-blue-400/20 dark:bg-blue-500/5 sm:p-6">
        <div className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
            New configuration
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
            Add transport option
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Use clear operational names such as Tempo, Truck, Courier or Own
            Vehicle. Duplicate names are blocked.
          </p>
        </div>
        <CreateTransportOptionForm />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
        <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">
                Option registry
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {totalMatching} matching option
                {totalMatching === 1 ? "" : "s"}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-white/5 dark:text-slate-300">
              Page {page} / {totalPages}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form method="get" className="flex min-w-0 gap-2 lg:max-w-xl lg:flex-1">
              {status !== "all" ? (
                <input type="hidden" name="status" value={status} />
              ) : null}
              <label className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <ErpIcon name="search" className="h-4 w-4" />
                </span>
                <span className="sr-only">Search transport options</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Name, description or updated by..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-500/40"
                />
              </label>
              <button
                type="submit"
                className="h-11 shrink-0 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white transition hover:bg-cyan-800"
              >
                Search
              </button>
              {q ? (
                <Link
                  href={buildHref(queryState, { q: "", page: 1 })}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 dark:border-white/10 dark:text-slate-300"
                >
                  Clear
                </Link>
              ) : null}
            </form>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {optionFilters.map((item) => {
                const active = status === item.key;
                return (
                  <Link
                    key={item.key}
                    href={buildHref(queryState, {
                      status: item.key,
                      page: 1,
                    })}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-black transition ${
                      active
                        ? "bg-slate-950 text-white dark:bg-cyan-700"
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
        </div>

        {transportOptions.length === 0 ? (
          <OperationsEmptyState
            icon="delivery"
            title="No matching transport options"
            description={
              q || status !== "all"
                ? "Try another search or clear the registry filters."
                : "Add the first transport option above."
            }
            action={
              q || status !== "all" ? (
                <Link
                  href="/internal/transport"
                  className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-cyan-700"
                >
                  Clear all filters
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {transportOptions.map((option) => (
                <article key={option.id} className="p-4 sm:p-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-slate-950 dark:text-white">
                          {option.name}
                        </h3>
                        <OperationsStatusPill
                          tone={option.isActive ? "emerald" : "rose"}
                        >
                          {option.isActive ? "Active" : "Disabled"}
                        </OperationsStatusPill>
                        <OperationsStatusPill tone="slate">
                          Sort {option.sortOrder}
                        </OperationsStatusPill>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        Used in {option._count.orders} order
                        {option._count.orders === 1 ? "" : "s"} · Updated{" "}
                        {formatDateTime(option.updatedAt)}
                        {option.updatedByName
                          ? ` by ${option.updatedByName}`
                          : ""}
                      </p>
                    </div>
                    <ToggleTransportOptionForm
                      option={{
                        id: option.id,
                        name: option.name,
                        isActive: option.isActive,
                      }}
                    />
                  </div>
                  <UpdateTransportOptionForm
                    option={{
                      id: option.id,
                      name: option.name,
                      description: option.description,
                      sortOrder: option.sortOrder,
                    }}
                  />
                </article>
              ))}
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
                  })}
                  aria-disabled={page <= 1}
                  className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-black ${
                    page <= 1
                      ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                      : "border-slate-200 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:text-slate-300"
                  }`}
                >
                  Previous
                </Link>
                <Link
                  href={buildHref(queryState, {
                    page: Math.min(totalPages, page + 1),
                  })}
                  aria-disabled={page >= totalPages}
                  className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-black ${
                    page >= totalPages
                      ? "pointer-events-none border-slate-100 text-slate-300 dark:border-white/5 dark:text-slate-600"
                      : "border-slate-200 text-slate-600 hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:text-slate-300"
                  }`}
                >
                  Next
                </Link>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
