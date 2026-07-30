import type { AppUser } from "@/lib/current-user";
import {
  getDashboardRangeBounds,
  getWorkflowStageId,
  WORKFLOW_STAGE_DEFINITIONS,
  type DashboardRangeDays,
  type WorkflowStageId,
} from "@/lib/dashboard-insights";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

type NumericValue =
  | bigint
  | number
  | string
  | { toNumber?: () => number; toString: () => string }
  | null;

type OrderSummaryRow = {
  periodOrderCount: bigint;
  previousOrderCount: bigint;
  periodOrderValue: NumericValue;
  previousOrderValue: NumericValue;
  openOrderCount: bigint;
  pastRequiredDateCount: bigint;
  highPriorityOpenCount: bigint;
  deliveredInPeriodCount: bigint;
};

type OrderStatusRow = {
  status: string;
  orderCount: bigint;
  orderValue: NumericValue;
  oldestAt: Date | string | null;
  pastRequiredDateCount: bigint;
};

type StockSummaryRow = {
  activeProductCount: bigint;
  riskProductCount: bigint;
  availableUnits: NumericValue;
  blockedUnits: NumericValue;
  inventoryCostValue: NumericValue;
};

type StockRiskRow = {
  id: string;
  code: string;
  name: string;
  stack: string;
  quantity: number;
  blocked: number;
  minimumStock: number;
  status: string;
  available: number;
  updatedAt: Date | string;
};

type CollectionSummaryRow = {
  openCount: bigint;
  outstandingAmount: NumericValue;
  overdueCount: bigint;
  overdueAmount: NumericValue;
};

type TaskSummaryRow = {
  openCount: bigint;
  overdueCount: bigint;
  blockedCount: bigint;
};

type TrendRow = {
  bucketIndex: number;
  orderCount: bigint;
  orderValue: NumericValue;
};

export type DashboardSummary = {
  periodOrderCount: number;
  previousOrderCount: number;
  periodOrderValue: number;
  previousOrderValue: number;
  openOrderCount: number;
  pastRequiredDateCount: number;
  highPriorityOpenCount: number;
  deliveredInPeriodCount: number;
  activeProductCount: number;
  riskProductCount: number;
  availableUnits: number;
  blockedUnits: number;
  inventoryCostValue: number;
  openCollectionCount: number;
  outstandingCollectionAmount: number;
  overdueCollectionCount: number;
  overdueCollectionAmount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
};

export type WorkflowStageSnapshot = {
  id: WorkflowStageId;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
  count: number;
  value: number;
  oldestAt: Date | null;
  pastRequiredDateCount: number;
};

export type OrderTrendPoint = {
  bucketIndex: number;
  label: string;
  accessibleLabel: string;
  orderCount: number;
  orderValue: number;
};

export type DashboardStockRisk = {
  id: string;
  code: string;
  name: string;
  stack: string;
  quantity: number;
  blocked: number;
  minimumStock: number;
  available: number;
  status: string;
  updatedAt: Date;
};

export type DashboardRecentOrder = {
  id: string;
  orderNumber: string;
  dealerName: string;
  productSummary: string;
  itemCount: number;
  status: string;
  priority: string;
  requiredBy: Date | null;
  updatedAt: Date;
  totalValue: number;
  href: string;
};

export type DashboardActivity = {
  id: string;
  title: string;
  description: string;
  actor: string;
  orderNumber: string;
  dealerName: string;
  createdAt: Date;
  href: string;
};

export type DashboardActionSeverity = "critical" | "warning" | "attention";

export type DashboardActionItem = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
  severity: DashboardActionSeverity;
  occurredAt: Date;
};

export type InternalDashboardSnapshot = {
  generatedAt: Date;
  rangeDays: DashboardRangeDays;
  rangeStart: Date;
  summary: DashboardSummary;
  statusCounts: Record<string, number>;
  workflow: WorkflowStageSnapshot[];
  trend: OrderTrendPoint[];
  stockRisks: DashboardStockRisk[];
  recentOrders: DashboardRecentOrder[];
  activities: DashboardActivity[];
  actions: DashboardActionItem[];
};

function toNumber(value: NumericValue | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatTrendDate(value: Date, includeYear: boolean) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(value);
}

function severityRank(severity: DashboardActionSeverity) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

export async function getInternalDashboardSnapshot({
  currentUser,
  rangeDays,
}: {
  currentUser: AppUser;
  rangeDays: DashboardRangeDays;
}): Promise<InternalDashboardSnapshot> {
  const { now, currentStart, previousStart, previousEnd, bucketDays } =
    getDashboardRangeBounds(rangeDays);
  const bucketSeconds = bucketDays * 86_400;
  const bucketCount = Math.ceil(rangeDays / bucketDays);
  const isSupervisor = currentUser.roles.some((role) =>
    ["owner", "manager"].includes(role),
  );
  const canManageAllTasks = hasPermission(
    currentUser.roles,
    "manage_work_tasks",
  );
  const canViewOwnTasks = hasPermission(
    currentUser.roles,
    "view_my_work_tasks",
  );
  const canManageInventory = hasPermission(
    currentUser.roles,
    "manage_inventory",
  );
  const canManageCollections = hasPermission(
    currentUser.roles,
    "manage_collections",
  );

  const [
    orderSummaryRows,
    orderStatusRows,
    stockSummaryRows,
    stockRiskRows,
    collectionSummaryRows,
    taskSummaryRows,
    trendRows,
    recentOrders,
    activityRows,
    cancellationRows,
    overdueTaskRows,
    overdueCollectionRows,
    delayedPurchaseRows,
    missingProofRows,
  ] = await Promise.all([
    prisma.$queryRaw<OrderSummaryRow[]>`
      WITH "orderTotals" AS (
        SELECT
          o."id",
          o."status"::text AS "status",
          o."priority",
          o."requiredBy",
          o."createdAt",
          o."deliveredAt",
          COALESCE(SUM(oi."lineTotal"), 0) AS "totalValue"
        FROM public."Order" o
        LEFT JOIN public."OrderItem" oi ON oi."orderId" = o."id"
        GROUP BY
          o."id",
          o."status",
          o."priority",
          o."requiredBy",
          o."createdAt",
          o."deliveredAt"
      )
      SELECT
        COUNT(*) FILTER (
          WHERE "createdAt" >= ${currentStart}
        ) AS "periodOrderCount",
        COUNT(*) FILTER (
          WHERE "createdAt" >= ${previousStart}
            AND "createdAt" < ${previousEnd}
        ) AS "previousOrderCount",
        COALESCE(SUM("totalValue") FILTER (
          WHERE "createdAt" >= ${currentStart}
        ), 0) AS "periodOrderValue",
        COALESCE(SUM("totalValue") FILTER (
          WHERE "createdAt" >= ${previousStart}
            AND "createdAt" < ${previousEnd}
        ), 0) AS "previousOrderValue",
        COUNT(*) FILTER (
          WHERE "status" NOT IN ('DELIVERED', 'INVOICE_UPLOADED', 'CANCELLED')
        ) AS "openOrderCount",
        COUNT(*) FILTER (
          WHERE "status" NOT IN ('DELIVERED', 'INVOICE_UPLOADED', 'CANCELLED')
            AND "requiredBy" IS NOT NULL
            AND "requiredBy" < ${now}
        ) AS "pastRequiredDateCount",
        COUNT(*) FILTER (
          WHERE "status" NOT IN ('DELIVERED', 'INVOICE_UPLOADED', 'CANCELLED')
            AND "priority" IN ('HIGH', 'URGENT', 'CRITICAL')
        ) AS "highPriorityOpenCount",
        COUNT(*) FILTER (
          WHERE "deliveredAt" >= ${currentStart}
        ) AS "deliveredInPeriodCount"
      FROM "orderTotals"
    `,
    prisma.$queryRaw<OrderStatusRow[]>`
      WITH "orderTotals" AS (
        SELECT
          o."id",
          o."status"::text AS "status",
          o."requiredBy",
          o."updatedAt" AS "stageUpdatedAt",
          COALESCE(SUM(oi."lineTotal"), 0) AS "totalValue"
        FROM public."Order" o
        LEFT JOIN public."OrderItem" oi ON oi."orderId" = o."id"
        WHERE o."status" NOT IN ('DELIVERED', 'INVOICE_UPLOADED', 'CANCELLED')
        GROUP BY o."id", o."status", o."requiredBy", o."updatedAt"
      )
      SELECT
        "status",
        COUNT(*) AS "orderCount",
        COALESCE(SUM("totalValue"), 0) AS "orderValue",
        MIN("stageUpdatedAt") AS "oldestAt",
        COUNT(*) FILTER (
          WHERE "requiredBy" IS NOT NULL AND "requiredBy" < ${now}
        ) AS "pastRequiredDateCount"
      FROM "orderTotals"
      GROUP BY "status"
    `,
    canManageInventory
      ? prisma.$queryRaw<StockSummaryRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE p."isActive") AS "activeProductCount",
        COUNT(*) FILTER (
          WHERE p."isActive"
            AND (
              p."status" IN ('LOW_STOCK', 'OUT_OF_STOCK')
              OR GREATEST(p."quantity" - p."blocked", 0) <= p."minimumStock"
            )
        ) AS "riskProductCount",
        COALESCE(SUM(
          GREATEST(p."quantity" - p."blocked", 0)
        ) FILTER (WHERE p."isActive"), 0) AS "availableUnits",
        COALESCE(SUM(p."blocked") FILTER (WHERE p."isActive"), 0) AS "blockedUnits",
        COALESCE(SUM(
          p."quantity" * COALESCE(p."purchasePrice", 0)
        ) FILTER (WHERE p."isActive"), 0) AS "inventoryCostValue"
      FROM public."Product" p
    `
      : Promise.resolve([] as StockSummaryRow[]),
    canManageInventory
      ? prisma.$queryRaw<StockRiskRow[]>`
      SELECT
        p."id",
        p."code",
        p."name",
        p."stack",
        p."quantity",
        p."blocked",
        p."minimumStock",
        p."status"::text AS "status",
        GREATEST(p."quantity" - p."blocked", 0)::integer AS "available",
        p."updatedAt"
      FROM public."Product" p
      WHERE p."isActive"
        AND (
          p."status" IN ('LOW_STOCK', 'OUT_OF_STOCK')
          OR GREATEST(p."quantity" - p."blocked", 0) <= p."minimumStock"
        )
      ORDER BY
        (GREATEST(p."quantity" - p."blocked", 0) = 0) DESC,
        (p."minimumStock" - GREATEST(p."quantity" - p."blocked", 0)) DESC,
        p."updatedAt" DESC
      LIMIT 6
    `
      : Promise.resolve([] as StockRiskRow[]),
    canManageCollections
      ? prisma.$queryRaw<CollectionSummaryRow[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE c."status" NOT IN ('VERIFIED', 'CANCELLED')
        ) AS "openCount",
        COALESCE(SUM(
          GREATEST(c."amountToCollect" - c."amountCollected", 0)
        ) FILTER (
          WHERE c."status" NOT IN ('VERIFIED', 'CANCELLED')
        ), 0) AS "outstandingAmount",
        COUNT(*) FILTER (
          WHERE c."status" NOT IN ('VERIFIED', 'CANCELLED')
            AND c."dueAt" IS NOT NULL
            AND c."dueAt" < ${now}
        ) AS "overdueCount",
        COALESCE(SUM(
          GREATEST(c."amountToCollect" - c."amountCollected", 0)
        ) FILTER (
          WHERE c."status" NOT IN ('VERIFIED', 'CANCELLED')
            AND c."dueAt" IS NOT NULL
            AND c."dueAt" < ${now}
        ), 0) AS "overdueAmount"
      FROM public."CollectionAssignment" c
    `
      : Promise.resolve([] as CollectionSummaryRow[]),
    canManageAllTasks || canViewOwnTasks
      ? prisma.$queryRaw<TaskSummaryRow[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE t."status" NOT IN ('DONE', 'CANCELLED')
            AND (${canManageAllTasks} OR t."assigneeId" = ${currentUser.id})
        ) AS "openCount",
        COUNT(*) FILTER (
          WHERE t."status" NOT IN ('DONE', 'CANCELLED')
            AND t."dueAt" IS NOT NULL
            AND t."dueAt" < ${now}
            AND (${canManageAllTasks} OR t."assigneeId" = ${currentUser.id})
        ) AS "overdueCount",
        COUNT(*) FILTER (
          WHERE t."status" = 'BLOCKED'
            AND (${canManageAllTasks} OR t."assigneeId" = ${currentUser.id})
        ) AS "blockedCount"
      FROM public."WorkTask" t
    `
      : Promise.resolve([] as TaskSummaryRow[]),
    prisma.$queryRaw<TrendRow[]>`
      WITH "orderTotals" AS (
        SELECT
          o."id",
          o."createdAt",
          COALESCE(SUM(oi."lineTotal"), 0) AS "totalValue"
        FROM public."Order" o
        LEFT JOIN public."OrderItem" oi ON oi."orderId" = o."id"
        WHERE o."createdAt" >= ${currentStart}
          AND o."createdAt" <= ${now}
        GROUP BY o."id", o."createdAt"
      )
      SELECT
        FLOOR(
          EXTRACT(EPOCH FROM ("createdAt" - ${currentStart})) / ${bucketSeconds}
        )::integer AS "bucketIndex",
        COUNT(*) AS "orderCount",
        COALESCE(SUM("totalValue"), 0) AS "orderValue"
      FROM "orderTotals"
      GROUP BY "bucketIndex"
      ORDER BY "bucketIndex" ASC
    `,
    prisma.order.findMany({
      select: {
        id: true,
        orderNumber: true,
        status: true,
        priority: true,
        requiredBy: true,
        updatedAt: true,
        dealer: { select: { name: true } },
        items: {
          select: {
            lineTotal: true,
            product: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.orderStatusHistory.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        changedByName: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            dealer: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 7,
    }),
    isSupervisor
      ? prisma.order.findMany({
          where: { status: "CANCELLATION_REQUESTED" },
          select: {
            id: true,
            orderNumber: true,
            priority: true,
            cancellationRequestedAt: true,
            updatedAt: true,
            dealer: { select: { name: true } },
          },
          orderBy: { cancellationRequestedAt: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
    canManageAllTasks || canViewOwnTasks
      ? prisma.workTask.findMany({
          where: {
            status: { notIn: ["DONE", "CANCELLED"] },
            dueAt: { lt: now },
            ...(canManageAllTasks ? {} : { assigneeId: currentUser.id }),
          },
          select: {
            id: true,
            taskNumber: true,
            title: true,
            priority: true,
            dueAt: true,
            team: { select: { name: true } },
          },
          orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
          take: 3,
        })
      : Promise.resolve([]),
    canManageCollections
      ? prisma.collectionAssignment.findMany({
          where: {
            status: { notIn: ["VERIFIED", "CANCELLED"] },
            dueAt: { lt: now },
          },
          select: {
            id: true,
            collectionNumber: true,
            dealerName: true,
            amountToCollect: true,
            amountCollected: true,
            dueAt: true,
          },
          orderBy: { dueAt: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
    hasPermission(currentUser.roles, "manage_purchase_requests") ||
    hasPermission(currentUser.roles, "receive_purchase_stock")
      ? prisma.purchaseRequest.findMany({
          where: {
            status: {
              in: ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"],
            },
            expectedDeliveryDate: { lt: now },
          },
          select: {
            id: true,
            requestNumber: true,
            expectedDeliveryDate: true,
            estimatedTotal: true,
            supplier: { select: { companyName: true } },
          },
          orderBy: { expectedDeliveryDate: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
    hasPermission(currentUser.roles, "manage_delivery_proofs")
      ? prisma.order.findMany({
          where: {
            status: "DELIVERED",
            signedInvoiceStatus: { not: "UPLOADED" },
          },
          select: {
            id: true,
            orderNumber: true,
            deliveredAt: true,
            updatedAt: true,
            dealer: { select: { name: true } },
          },
          orderBy: { deliveredAt: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
  ]);

  const orderSummary = orderSummaryRows[0];
  const stockSummary = stockSummaryRows[0];
  const collectionSummary = collectionSummaryRows[0];
  const taskSummary = taskSummaryRows[0];

  const summary: DashboardSummary = {
    periodOrderCount: Number(orderSummary?.periodOrderCount ?? 0),
    previousOrderCount: Number(orderSummary?.previousOrderCount ?? 0),
    periodOrderValue: toNumber(orderSummary?.periodOrderValue),
    previousOrderValue: toNumber(orderSummary?.previousOrderValue),
    openOrderCount: Number(orderSummary?.openOrderCount ?? 0),
    pastRequiredDateCount: Number(
      orderSummary?.pastRequiredDateCount ?? 0,
    ),
    highPriorityOpenCount: Number(orderSummary?.highPriorityOpenCount ?? 0),
    deliveredInPeriodCount: Number(
      orderSummary?.deliveredInPeriodCount ?? 0,
    ),
    activeProductCount: Number(stockSummary?.activeProductCount ?? 0),
    riskProductCount: Number(stockSummary?.riskProductCount ?? 0),
    availableUnits: toNumber(stockSummary?.availableUnits),
    blockedUnits: toNumber(stockSummary?.blockedUnits),
    inventoryCostValue: toNumber(stockSummary?.inventoryCostValue),
    openCollectionCount: Number(collectionSummary?.openCount ?? 0),
    outstandingCollectionAmount: toNumber(
      collectionSummary?.outstandingAmount,
    ),
    overdueCollectionCount: Number(collectionSummary?.overdueCount ?? 0),
    overdueCollectionAmount: toNumber(collectionSummary?.overdueAmount),
    openTaskCount: Number(taskSummary?.openCount ?? 0),
    overdueTaskCount: Number(taskSummary?.overdueCount ?? 0),
    blockedTaskCount: Number(taskSummary?.blockedCount ?? 0),
  };

  const statusCounts: Record<string, number> = {};
  const workflowById = new Map<
    WorkflowStageId,
    Omit<WorkflowStageSnapshot, "label" | "shortLabel" | "description" | "href">
  >();

  for (const row of orderStatusRows) {
    const count = Number(row.orderCount);
    statusCounts[row.status] = count;
    const stageId = getWorkflowStageId(row.status);
    if (!stageId) continue;

    const previous = workflowById.get(stageId);
    const oldestAt = row.oldestAt ? new Date(row.oldestAt) : null;

    workflowById.set(stageId, {
      id: stageId,
      count: (previous?.count ?? 0) + count,
      value: (previous?.value ?? 0) + toNumber(row.orderValue),
      oldestAt:
        previous?.oldestAt && oldestAt
          ? previous.oldestAt < oldestAt
            ? previous.oldestAt
            : oldestAt
          : previous?.oldestAt ?? oldestAt,
      pastRequiredDateCount:
        (previous?.pastRequiredDateCount ?? 0) +
        Number(row.pastRequiredDateCount),
    });
  }

  const workflow = WORKFLOW_STAGE_DEFINITIONS.map((definition) => {
    const snapshot = workflowById.get(definition.id);
    return {
      ...definition,
      count: snapshot?.count ?? 0,
      value: snapshot?.value ?? 0,
      oldestAt: snapshot?.oldestAt ?? null,
      pastRequiredDateCount: snapshot?.pastRequiredDateCount ?? 0,
    };
  });

  const trendByBucket = new Map(
    trendRows.map((row) => [Number(row.bucketIndex), row]),
  );
  const trend: OrderTrendPoint[] = Array.from(
    { length: bucketCount },
    (_, bucketIndex) => {
      const bucketStart = new Date(
        currentStart.getTime() + bucketIndex * bucketDays * 86_400_000,
      );
      const row = trendByBucket.get(bucketIndex);
      const label = formatTrendDate(bucketStart, rangeDays === 90);

      return {
        bucketIndex,
        label,
        accessibleLabel: `${label}: ${Number(row?.orderCount ?? 0)} orders, ${formatCurrency(
          toNumber(row?.orderValue),
        )}`,
        orderCount: Number(row?.orderCount ?? 0),
        orderValue: toNumber(row?.orderValue),
      };
    },
  );

  const stockRisks: DashboardStockRisk[] = stockRiskRows.map((row) => ({
    ...row,
    updatedAt: new Date(row.updatedAt),
  }));

  const mappedRecentOrders: DashboardRecentOrder[] = recentOrders.map(
    (order) => {
      const firstProductName = order.items[0]?.product.name ?? "Order";
      const productSummary =
        order.items.length > 1
          ? `${firstProductName} +${order.items.length - 1} more`
          : firstProductName;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        dealerName: order.dealer.name,
        productSummary,
        itemCount: order.items.length,
        status: order.status,
        priority: order.priority,
        requiredBy: order.requiredBy,
        updatedAt: order.updatedAt,
        totalValue: order.items.reduce(
          (sum, item) => sum + toNumber(item.lineTotal),
          0,
        ),
        href: `/internal/orders?order=${encodeURIComponent(order.id)}`,
      };
    },
  );

  const activities: DashboardActivity[] = activityRows.map((activity) => ({
    id: activity.id,
    title: activity.title,
    description:
      activity.description?.trim() ||
      `${activity.order.orderNumber} workflow updated`,
    actor: activity.changedByName,
    orderNumber: activity.order.orderNumber,
    dealerName: activity.order.dealer.name,
    createdAt: activity.createdAt,
    href: `/internal/orders?order=${encodeURIComponent(activity.order.id)}`,
  }));

  const actions: DashboardActionItem[] = [];

  for (const order of cancellationRows) {
    actions.push({
      id: `cancellation-${order.id}`,
      title: "Cancellation approval required",
      detail: `${order.orderNumber} · ${order.dealer.name}`,
      meta: order.priority === "NORMAL" ? "Owner decision pending" : `${order.priority} priority`,
      href: `/internal/orders?order=${encodeURIComponent(order.id)}`,
      severity: "critical",
      occurredAt:
        order.cancellationRequestedAt ?? order.updatedAt,
    });
  }

  if (canManageInventory) {
    for (const product of stockRisks.slice(0, 3)) {
      actions.push({
        id: `stock-${product.id}`,
        title:
          product.available <= 0
            ? "Product is out of available stock"
            : "Product is below minimum stock",
        detail: `${product.code} · ${product.name}`,
        meta: `${product.available.toLocaleString("en-IN")} available · minimum ${product.minimumStock.toLocaleString("en-IN")}`,
        href: "/internal/inventory",
        severity: product.available <= 0 ? "critical" : "warning",
        occurredAt: product.updatedAt,
      });
    }
  }

  for (const task of overdueTaskRows) {
    actions.push({
      id: `task-${task.id}`,
      title: "Work task is overdue",
      detail: `${task.taskNumber} · ${task.title}`,
      meta: `${task.team.name} · ${task.priority} priority`,
      href: canManageAllTasks ? "/internal/tasks" : "/account/tasks",
      severity:
        task.priority === "CRITICAL" || task.priority === "URGENT"
          ? "critical"
          : "warning",
      occurredAt: task.dueAt ?? now,
    });
  }

  for (const collection of overdueCollectionRows) {
    const pendingAmount = Math.max(
      0,
      collection.amountToCollect - collection.amountCollected,
    );
    actions.push({
      id: `collection-${collection.id}`,
      title: "Collection is overdue",
      detail: `${collection.collectionNumber} · ${collection.dealerName}`,
      meta: `${formatCurrency(pendingAmount)} outstanding`,
      href: "/internal/collections",
      severity: "critical",
      occurredAt: collection.dueAt ?? now,
    });
  }

  for (const purchase of delayedPurchaseRows) {
    actions.push({
      id: `purchase-${purchase.id}`,
      title: "Supplier delivery is delayed",
      detail: `${purchase.requestNumber} · ${purchase.supplier.companyName}`,
      meta: `${formatCurrency(toNumber(purchase.estimatedTotal))} purchase value`,
      href: "/internal/reorder",
      severity: "warning",
      occurredAt: purchase.expectedDeliveryDate ?? now,
    });
  }

  for (const order of missingProofRows) {
    actions.push({
      id: `proof-${order.id}`,
      title: "Delivery proof is pending",
      detail: `${order.orderNumber} · ${order.dealer.name}`,
      meta: "Signed invoice has not been uploaded",
      href: "/internal/delivery-proofs",
      severity: "attention",
      occurredAt: order.deliveredAt ?? order.updatedAt,
    });
  }

  actions.sort((left, right) => {
    const rankDifference =
      severityRank(left.severity) - severityRank(right.severity);
    if (rankDifference !== 0) return rankDifference;
    return left.occurredAt.getTime() - right.occurredAt.getTime();
  });

  return {
    generatedAt: now,
    rangeDays,
    rangeStart: currentStart,
    summary,
    statusCounts,
    workflow,
    trend,
    stockRisks,
    recentOrders: mappedRecentOrders,
    activities,
    actions: actions.slice(0, 8),
  };
}
