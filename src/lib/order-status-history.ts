"use server";

import type { OrderStatus } from "@/generated/prisma/client";

type CurrentUserForHistory = {
  name: string;
  email: string;
  role: string;
};

export type OrderStatusHistoryEntry = {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | string | null;
  toStatus: OrderStatus | string;
  title: string;
  description: string | null;
  changedByName: string;
  changedByEmail: string;
  changedByRole: string;
  createdAt: Date;
};

export type HistoryClient = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
};

function createHistoryId() {
  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeStatusValue(
  status: OrderStatus | string | null | undefined,
  fallback: string
) {
  if (typeof status === "string" && status.trim().length > 0) {
    return status;
  }

  return fallback;
}

function getFallbackToStatus(title: string) {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("cancellation requested")) {
    return "CANCELLATION_REQUESTED";
  }

  if (normalizedTitle.includes("cancel")) {
    return "CANCELLED";
  }

  if (normalizedTitle.includes("partially delivered")) {
    return "DELIVERED";
  }

  if (normalizedTitle.includes("delivered")) {
    return "DELIVERED";
  }

  if (normalizedTitle.includes("driver")) {
    return "TRANSPORT_ASSIGNED";
  }

  if (normalizedTitle.includes("all physical checks") || normalizedTitle.includes("sent to qc")) {
    return "PENDING_QC";
  }

  if (normalizedTitle.includes("qc rework")) {
    return "QC_REWORK";
  }

  if (normalizedTitle.includes("physical check issue")) {
    return "PHYSICAL_CHECK_ISSUE";
  }

  if (normalizedTitle.includes("physical check started")) {
    return "PHYSICAL_CHECK_IN_PROGRESS";
  }

  if (normalizedTitle.includes("physical teams assigned")) {
    return "PHYSICAL_CHECK_ASSIGNED";
  }

  if (normalizedTitle.includes("order received")) {
    return "PENDING_TEAM_ASSIGNMENT";
  }

  if (normalizedTitle.includes("qc")) {
    return "QC_APPROVED";
  }

  if (normalizedTitle.includes("ready")) {
    return "READY_FOR_DISPATCH";
  }

  if (normalizedTitle.includes("backorder")) {
    return "BACKORDERED";
  }

  if (normalizedTitle.includes("partial")) {
    return "STOCK_BLOCKED";
  }

  if (normalizedTitle.includes("block")) {
    return "STOCK_BLOCKED";
  }

  if (normalizedTitle.includes("stock checked")) {
    return "STOCK_CHECKED";
  }

  if (normalizedTitle.includes("passed to inventory")) {
    return "PENDING_STOCK_CHECK";
  }

  return "NEW_ORDER";
}

function normalizeHistoryEntry(entry: OrderStatusHistoryEntry) {
  return {
    ...entry,
    createdAt: new Date(entry.createdAt),
  };
}

export async function getOrderStatusHistoryMap(
  client: HistoryClient,
  orderIds: string[]
) {
  if (orderIds.length === 0) {
    return new Map<string, OrderStatusHistoryEntry[]>();
  }

  const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(", ");

  const historyEntries = await client.$queryRawUnsafe<OrderStatusHistoryEntry[]>(
    `
      SELECT
        "id",
        "orderId",
        "fromStatus",
        "toStatus",
        "title",
        "description",
        "changedByName",
        "changedByEmail",
        "changedByRole",
        "createdAt"
      FROM public."OrderStatusHistory"
      WHERE "orderId" IN (${placeholders})
      ORDER BY "createdAt" ASC
    `,
    ...orderIds
  );

  const historyMap = new Map<string, OrderStatusHistoryEntry[]>();

  for (const rawEntry of historyEntries) {
    const entry = normalizeHistoryEntry(rawEntry);
    const orderHistory = historyMap.get(entry.orderId);

    if (orderHistory) {
      orderHistory.push(entry);
      continue;
    }

    historyMap.set(entry.orderId, [entry]);
  }

  return historyMap;
}

export async function recordOrderStatusHistory({
  client,
  orderId,
  fromStatus,
  toStatus,
  title,
  description,
  currentUser,
}: {
  client: HistoryClient;
  orderId: string;
  fromStatus?: OrderStatus | string | null;
  toStatus?: OrderStatus | string | null;
  title: string;
  description?: string | null;
  currentUser: CurrentUserForHistory;
}) {
  const safeToStatus = normalizeStatusValue(
    toStatus,
    getFallbackToStatus(title)
  );

  const safeFromStatus =
    typeof fromStatus === "string" && fromStatus.trim().length > 0
      ? fromStatus
      : null;

  await client.$executeRawUnsafe(
    `
      INSERT INTO public."OrderStatusHistory" (
        "id",
        "orderId",
        "fromStatus",
        "toStatus",
        "title",
        "description",
        "changedByName",
        "changedByEmail",
        "changedByRole",
        "createdAt"
      )
      VALUES ($1, $2, $3::public."OrderStatus", $4::public."OrderStatus", $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    `,
    createHistoryId(),
    orderId,
    safeFromStatus,
    safeToStatus,
    title,
    description ?? null,
    currentUser.name,
    currentUser.email,
    currentUser.role
  );
}
