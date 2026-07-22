import { randomUUID } from "crypto";
import type { AppUser } from "./current-user";

type StockBlockClient = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
};

type OrderLike = {
  id: string;
  orderNumber?: string;
};

type OrderItemLike = {
  id: string;
  productId: string;
  orderId: string;
};

type ActiveStockBlockRow = {
  id: string;
  productId: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  blockReason: string;
  blockedAt: Date | string;
  blockedUntil: Date | string | null;
  blockedById: string | null;
  blockedByName: string | null;
  blockedByEmail: string | null;
  notes: string | null;
};

function getUserSnapshot(currentUser: AppUser) {
  return {
    userId: currentUser.id,
    userName: currentUser.name,
    userEmail: currentUser.email,
  };
}

function createTimelineId() {
  return `stock_${randomUUID()}`;
}

export async function recordStockBlockTimeline({
  client,
  order,
  item,
  quantity,
  currentUser,
  blockedUntil = null,
  blockReason = "ORDER_STOCK_BLOCKED",
  notes,
}: {
  client: StockBlockClient;
  order: OrderLike;
  item: OrderItemLike;
  quantity: number;
  currentUser: AppUser;
  blockedUntil?: Date | null;
  blockReason?: string;
  notes?: string;
}) {
  if (quantity <= 0) {
    return;
  }

  const user = getUserSnapshot(currentUser);

  await client.$executeRawUnsafe(
    `
      INSERT INTO public."StockBlockTimeline" (
        "id",
        "productId",
        "orderId",
        "orderItemId",
        "quantity",
        "status",
        "blockReason",
        "blockedUntil",
        "blockedById",
        "blockedByName",
        "blockedByEmail",
        "notes",
        "blockedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    createTimelineId(),
    item.productId,
    order.id,
    item.id,
    quantity,
    blockReason,
    blockedUntil,
    user.userId,
    user.userName,
    user.userEmail,
    notes ??
      `${quantity} quantity blocked for order ${order.orderNumber ?? order.id}.`
  );
}

export async function closeStockBlockTimeline({
  client,
  orderId,
  orderItemId,
  productId,
  quantity,
  currentUser,
  status,
  releaseReason,
  notes,
}: {
  client: StockBlockClient;
  orderId: string;
  orderItemId: string;
  productId: string;
  quantity: number;
  currentUser: AppUser;
  status: "RELEASED" | "CONSUMED";
  releaseReason: string;
  notes?: string;
}) {
  if (quantity <= 0) {
    return 0;
  }

  const user = getUserSnapshot(currentUser);
  let remainingToClose = quantity;
  let closedQuantity = 0;

  const activeRows = await client.$queryRawUnsafe<ActiveStockBlockRow[]>(
    `
      SELECT
        "id",
        "productId",
        "orderId",
        "orderItemId",
        "quantity",
        "blockReason",
        "blockedAt",
        "blockedUntil",
        "blockedById",
        "blockedByName",
        "blockedByEmail",
        "notes"
      FROM public."StockBlockTimeline"
      WHERE "orderId" = $1
        AND "orderItemId" = $2
        AND "productId" = $3
        AND "status" = 'ACTIVE'
        AND "quantity" > 0
      ORDER BY "blockedAt" ASC
      FOR UPDATE
    `,
    orderId,
    orderItemId,
    productId
  );

  if (activeRows.length === 0) {
    await client.$executeRawUnsafe(
      `
        INSERT INTO public."StockBlockTimeline" (
          "id",
          "productId",
          "orderId",
          "orderItemId",
          "quantity",
          "status",
          "blockReason",
          "releaseReason",
          "blockedAt",
          "releasedAt",
          "blockedById",
          "blockedByName",
          "blockedByEmail",
          "releasedById",
          "releasedByName",
          "releasedByEmail",
          "notes",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'LEGACY_BLOCK_WITHOUT_ACTIVE_TIMELINE', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      createTimelineId(),
      productId,
      orderId,
      orderItemId,
      quantity,
      status,
      releaseReason,
      user.userId,
      user.userName,
      user.userEmail,
      notes ??
        `${quantity} quantity was closed even though no active stock-block timeline row existed.`
    );

    return quantity;
  }

  for (const row of activeRows) {
    if (remainingToClose <= 0) {
      break;
    }

    const closeQuantity = Math.min(row.quantity, remainingToClose);
    const remainingInRow = row.quantity - closeQuantity;
    const nextNotes = notes ?? row.notes;

    if (remainingInRow <= 0) {
      await client.$executeRawUnsafe(
        `
          UPDATE public."StockBlockTimeline"
          SET
            "status" = $1,
            "releaseReason" = $2,
            "releasedAt" = CURRENT_TIMESTAMP,
            "releasedById" = $3,
            "releasedByName" = $4,
            "releasedByEmail" = $5,
            "notes" = $6,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $7
        `,
        status,
        releaseReason,
        user.userId,
        user.userName,
        user.userEmail,
        nextNotes,
        row.id
      );
    } else {
      await client.$executeRawUnsafe(
        `
          UPDATE public."StockBlockTimeline"
          SET "quantity" = $1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $2
        `,
        remainingInRow,
        row.id
      );

      await client.$executeRawUnsafe(
        `
          INSERT INTO public."StockBlockTimeline" (
            "id",
            "productId",
            "orderId",
            "orderItemId",
            "quantity",
            "status",
            "blockReason",
            "releaseReason",
            "blockedAt",
            "blockedUntil",
            "releasedAt",
            "blockedById",
            "blockedByName",
            "blockedByEmail",
            "releasedById",
            "releasedByName",
            "releasedByEmail",
            "notes",
            "createdAt",
            "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        createTimelineId(),
        row.productId,
        row.orderId,
        row.orderItemId,
        closeQuantity,
        status,
        row.blockReason,
        releaseReason,
        row.blockedAt,
        row.blockedUntil,
        row.blockedById,
        row.blockedByName,
        row.blockedByEmail,
        user.userId,
        user.userName,
        user.userEmail,
        nextNotes
      );
    }

    closedQuantity += closeQuantity;
    remainingToClose -= closeQuantity;
  }

  if (remainingToClose > 0) {
    throw new Error(
      `STOCK_BLOCK_TIMELINE_MISMATCH: ${remainingToClose} quantity has no active timeline row.`
    );
  }

  return closedQuantity;
}
