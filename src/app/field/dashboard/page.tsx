import Link from "next/link";
import { OrderStatus } from "@/generated/prisma/client";
import { ErpIcon } from "@/components/erp-icon";
import {
  OperationsMetricCard,
  OperationsStatusPill,
} from "@/components/operations-workspace-ui";
import {
  getCurrentUser,
  getPortalDisplayCopy,
  getPortalRole,
} from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export default async function FieldDashboardPage() {
  const currentUser = await getCurrentUser();
  const fieldRole = getPortalRole(currentUser.roles, "field") ?? currentUser.role;
  const portalCopy = getPortalDisplayCopy(fieldRole);
  const canViewDeliveries = hasPermission(
    currentUser.roles,
    "view_assigned_deliveries",
  );
  const canManageVisits = hasPermission(
    currentUser.roles,
    "manage_field_visits",
  );
  const canManageCollections = hasPermission(
    currentUser.roles,
    "manage_collections",
  );

  const [
    readyDeliveries,
    onRouteDeliveries,
    proofPending,
    completedDeliveries,
    myVisits,
    pendingVisits,
    nextDelivery,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        assignedDriverId: currentUser.id,
        status: OrderStatus.TRANSPORT_ASSIGNED,
      },
    }),
    prisma.order.count({
      where: {
        assignedDriverId: currentUser.id,
        status: OrderStatus.ON_THE_WAY,
      },
    }),
    prisma.order.count({
      where: {
        assignedDriverId: currentUser.id,
        status: OrderStatus.DELIVERED,
        signedInvoiceStatus: { not: "UPLOADED" },
      },
    }),
    prisma.order.count({
      where: {
        assignedDriverId: currentUser.id,
        status: OrderStatus.INVOICE_UPLOADED,
      },
    }),
    prisma.fieldVisit.count({
      where: { createdById: currentUser.id },
    }),
    prisma.fieldVisit.count({
      where: {
        createdById: currentUser.id,
        status: { in: ["GOAL_PENDING", "FOLLOW_UP_REQUIRED"] },
      },
    }),
    prisma.order.findFirst({
      where: {
        assignedDriverId: currentUser.id,
        status: {
          in: [OrderStatus.ON_THE_WAY, OrderStatus.TRANSPORT_ASSIGNED],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        updatedAt: true,
        dealer: { select: { name: true, phone: true } },
        transportOption: { select: { name: true } },
        transportLabel: true,
        _count: { select: { items: true } },
      },
      orderBy: [
        { status: "desc" },
        { updatedAt: "asc" },
        { createdAt: "asc" },
      ],
    }),
  ]);

  const openDeliveryCount =
    readyDeliveries + onRouteDeliveries + proofPending;
  const metrics = [
    {
      label: "Ready to Start",
      value: readyDeliveries,
      helper: "Assigned deliveries waiting for departure",
      icon: "delivery" as const,
      tone: "amber" as const,
    },
    {
      label: "On Route",
      value: onRouteDeliveries,
      helper: "Deliveries currently in progress",
      icon: "activity" as const,
      tone: "blue" as const,
    },
    {
      label: "Proof Pending",
      value: proofPending,
      helper: "Delivered records awaiting signed proof",
      icon: "alert" as const,
      tone: "violet" as const,
    },
    {
      label: "Follow-ups",
      value: pendingVisits,
      helper: "Shop visits that still need attention",
      icon: "tasks" as const,
      tone: "rose" as const,
    },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-blue-100/90 blur-3xl dark:bg-blue-500/10" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)] lg:items-end">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-300">
              {portalCopy.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Good day, {currentUser.name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Your field work is organized by urgency. Complete the assigned
              route, capture proof and move to the next task.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <OperationsStatusPill
                tone={openDeliveryCount > 0 ? "blue" : "emerald"}
              >
                {openDeliveryCount} open delivery
                {openDeliveryCount === 1 ? "" : "ies"}
              </OperationsStatusPill>
              <OperationsStatusPill tone="slate">
                {completedDeliveries} completed records
              </OperationsStatusPill>
              <OperationsStatusPill tone="slate">
                {myVisits} visit reports
              </OperationsStatusPill>
            </div>
          </div>

          {nextDelivery ? (
            <Link
              href={`/field/deliveries?order=${encodeURIComponent(nextDelivery.id)}#delivery-detail`}
              className="group rounded-[22px] border border-blue-200 bg-blue-50/70 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/10 dark:border-blue-400/20 dark:bg-blue-500/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                    Next delivery
                  </p>
                  <p className="mt-2 font-black text-slate-950 dark:text-white">
                    {nextDelivery.orderNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {nextDelivery.dealer.name} · {nextDelivery._count.items}{" "}
                    product line
                    {nextDelivery._count.items === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white transition group-hover:translate-x-0.5">
                  <ErpIcon name="chevron-right" className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  {nextDelivery.transportOption?.name ||
                    nextDelivery.transportLabel ||
                    "Transport assigned"}
                </span>
                <span>{formatDateTime(nextDelivery.updatedAt)}</span>
              </div>
            </Link>
          ) : (
            <div className="rounded-[22px] border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
              <p className="font-black text-emerald-800 dark:text-emerald-200">
                No route waiting
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                New work appears automatically after QC assigns a driver and
                transport option.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <OperationsMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Workspaces
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
            Continue field operations
          </h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {canViewDeliveries ? (
            <Link
              href="/field/deliveries"
              className="group rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/20">
                <ErpIcon name="delivery" className="h-5 w-5" />
              </span>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <h3 className="font-black text-slate-950 dark:text-white">
                    My Deliveries
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Route actions, complete quantity and signed proof.
                  </p>
                </div>
                <ErpIcon
                  name="chevron-right"
                  className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
                />
              </div>
            </Link>
          ) : null}

          {canManageVisits ? (
            <Link
              href="/field/visits"
              className="group rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20">
                <ErpIcon name="activity" className="h-5 w-5" />
              </span>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <h3 className="font-black text-slate-950 dark:text-white">
                    Shop Visits
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Visit goals, evidence and follow-up reporting.
                  </p>
                </div>
                <ErpIcon
                  name="chevron-right"
                  className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-600"
                />
              </div>
            </Link>
          ) : null}

          {canManageCollections ? (
            <Link
              href="/field/collections"
              className="group rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg hover:shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/20">
                <ErpIcon name="collection" className="h-5 w-5" />
              </span>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <h3 className="font-black text-slate-950 dark:text-white">
                    Collections
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Assigned collection visits and payment proof.
                  </p>
                </div>
                <ErpIcon
                  name="chevron-right"
                  className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600"
                />
              </div>
            </Link>
          ) : null}

          <Link
            href="/account/tasks"
            className="group rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-lg hover:shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20">
              <ErpIcon name="tasks" className="h-5 w-5" />
            </span>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <h3 className="font-black text-slate-950 dark:text-white">
                  My Tasks
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Personal assignments, due work and reminders.
                </p>
              </div>
              <ErpIcon
                name="chevron-right"
                className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-amber-600"
              />
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
