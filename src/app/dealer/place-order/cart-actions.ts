"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getDealerCart } from "@/lib/dealer-cart-db";
import { createOrderPriceSnapshot } from "@/lib/order-pricing";

const MAX_CART_ITEMS = 50;
const MAX_CART_QUANTITY = 1_000_000;
const MAX_NOTES_LENGTH = 1_000;

type CartInputItem = {
  productId: string;
  quantity: number;
};

export type SaveDealerCartInput = {
  items: CartInputItem[];
  notes: string;
  version: number;
};

export type DealerCartSnapshotItem = {
  productId: string;
  unitPriceSnapshot: number;
  gstRateSnapshot: number;
  priceSourceSnapshot: "DEALER_PRICE" | "SELLING_PRICE" | "MANUAL_PRICE" | "LEGACY_BACKFILL";
};

export type DealerCartActionResult =
  | { status: "saved"; version: number; savedAt: string }
  | { status: "pricing-accepted"; version: number; savedAt: string; items: DealerCartSnapshotItem[] }
  | { status: "conflict"; version: number }
  | { status: "error"; message: string };

function normalizeCartInput(input: SaveDealerCartInput) {
  const notes = String(input.notes ?? "").trim();
  const version = Number(input.version ?? 0);

  if (!Number.isInteger(version) || version < 0 || notes.length > MAX_NOTES_LENGTH) {
    return null;
  }

  if (!Array.isArray(input.items) || input.items.length > MAX_CART_ITEMS) {
    return null;
  }

  const quantities = new Map<string, number>();
  for (const item of input.items) {
    const productId = String(item.productId ?? "").trim();
    const quantity = Number(item.quantity ?? 0);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
      return null;
    }
    const mergedQuantity = (quantities.get(productId) ?? 0) + quantity;
    if (mergedQuantity > MAX_CART_QUANTITY) return null;
    quantities.set(productId, mergedQuantity);
  }

  return {
    notes,
    version,
    items: Array.from(quantities, ([productId, quantity]) => ({ productId, quantity })),
  };
}

async function requireActiveDealer() {
  const { currentUser, hasAccess } = await checkPermission("place_dealer_order");
  if (!hasAccess || !currentUser.roles.includes("dealer")) return null;

  return prisma.user.findFirst({
    where: { id: currentUser.id, status: "ACTIVE" },
    select: { id: true },
  });
}

export async function saveDealerCartAction(input: SaveDealerCartInput): Promise<DealerCartActionResult> {
  const dealer = await requireActiveDealer();
  if (!dealer) return { status: "error", message: "Dealer cart access was denied." };

  const normalized = normalizeCartInput(input);
  if (!normalized) return { status: "error", message: "The cart contains invalid products, quantities or notes." };

  const products = normalized.items.length
    ? await prisma.product.findMany({
        where: { id: { in: normalized.items.map((item) => item.productId) } },
        select: { id: true, dealerPrice: true, sellingPrice: true, gstRate: true },
      })
    : [];

  if (products.length !== normalized.items.length) {
    return { status: "error", message: "One or more cart products no longer exist." };
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  return prisma.$transaction(async (tx) => {
    const existingCart = await getDealerCart(tx, dealer.id, { lock: true });

    if (!existingCart) {
      if (normalized.version !== 0) return { status: "conflict" as const, version: 0 };

      const itemSnapshots = [];
      for (const item of normalized.items) {
        const product = productById.get(item.productId);
        if (!product) return { status: "error" as const, message: "A cart product no longer exists." };
        const snapshot = createOrderPriceSnapshot(product, 1);
        if (!snapshot) {
          return { status: "error" as const, message: "Dealer pricing is unavailable for one or more products." };
        }
        itemSnapshots.push({ item, snapshot });
      }

      const cartId = randomUUID();
      const createdRows = await tx.$queryRaw<Array<{ version: number; updatedAt: Date }>>(Prisma.sql`
        INSERT INTO public."DealerCart" (
          "id", "dealerId", "notes", "version", "createdAt", "updatedAt"
        ) VALUES (
          ${cartId}, ${dealer.id}, ${normalized.notes || null}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING "version", "updatedAt"
      `);

      for (const entry of itemSnapshots) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO public."DealerCartItem" (
            "id", "cartId", "productId", "quantity",
            "unitPriceSnapshot", "gstRateSnapshot", "priceSourceSnapshot",
            "createdAt", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${cartId}, ${entry.item.productId}, ${entry.item.quantity},
            ${entry.snapshot.unitPrice}, ${entry.snapshot.gstRate},
            ${entry.snapshot.priceSource}::public."OrderItemPriceSource",
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `);
      }

      const created = createdRows[0];
      return { status: "saved" as const, version: created.version, savedAt: created.updatedAt.toISOString() };
    }

    if (existingCart.version !== normalized.version) {
      return { status: "conflict" as const, version: existingCart.version };
    }

    const nextProductIds = new Set(normalized.items.map((item) => item.productId));
    const existingByProductId = new Map(existingCart.items.map((item) => [item.productId, item]));
    const newItemSnapshots = new Map<string, NonNullable<ReturnType<typeof createOrderPriceSnapshot>>>();

    for (const item of normalized.items) {
      if (existingByProductId.has(item.productId)) continue;
      const product = productById.get(item.productId);
      if (!product) return { status: "error" as const, message: "A cart product no longer exists." };
      const snapshot = createOrderPriceSnapshot(product, 1);
      if (!snapshot) {
        return { status: "error" as const, message: "Dealer pricing is unavailable for one or more products." };
      }
      newItemSnapshots.set(item.productId, snapshot);
    }

    for (const existingItem of existingCart.items) {
      if (nextProductIds.has(existingItem.productId)) continue;
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM public."DealerCartItem"
        WHERE "id" = ${existingItem.id}
      `);
    }

    for (const item of normalized.items) {
      const existingItem = existingByProductId.get(item.productId);
      if (existingItem) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE public."DealerCartItem"
          SET "quantity" = ${item.quantity}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${existingItem.id}
        `);
        continue;
      }

      const snapshot = newItemSnapshots.get(item.productId);
      if (!snapshot) throw new Error("DEALER_CART_PRICE_SNAPSHOT_MISSING");
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO public."DealerCartItem" (
          "id", "cartId", "productId", "quantity",
          "unitPriceSnapshot", "gstRateSnapshot", "priceSourceSnapshot",
          "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${existingCart.id}, ${item.productId}, ${item.quantity},
          ${snapshot.unitPrice}, ${snapshot.gstRate},
          ${snapshot.priceSource}::public."OrderItemPriceSource",
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
    }

    const updatedRows = await tx.$queryRaw<Array<{ version: number; updatedAt: Date }>>(Prisma.sql`
      UPDATE public."DealerCart"
      SET
        "notes" = ${normalized.notes || null},
        "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existingCart.id}
      RETURNING "version", "updatedAt"
    `);

    const updated = updatedRows[0];
    return { status: "saved" as const, version: updated.version, savedAt: updated.updatedAt.toISOString() };
  });
}

export async function acceptDealerCartPricingAction(input: { version: number }): Promise<DealerCartActionResult> {
  const dealer = await requireActiveDealer();
  if (!dealer) return { status: "error", message: "Dealer cart access was denied." };

  const version = Number(input.version ?? 0);
  if (!Number.isInteger(version) || version < 1) {
    return { status: "error", message: "The cart version is invalid." };
  }

  return prisma.$transaction(async (tx) => {
    const cart = await getDealerCart(tx, dealer.id, { lock: true });
    if (!cart) return { status: "error" as const, message: "The saved cart was not found." };
    if (cart.version !== version) return { status: "conflict" as const, version: cart.version };

    const products = cart.items.length
      ? await tx.product.findMany({
          where: { id: { in: cart.items.map((item) => item.productId) } },
          select: { id: true, dealerPrice: true, sellingPrice: true, gstRate: true },
        })
      : [];
    const productById = new Map(products.map((product) => [product.id, product]));

    const snapshots: DealerCartSnapshotItem[] = [];
    for (const item of cart.items) {
      const product = productById.get(item.productId);
      if (!product) return { status: "error" as const, message: "A cart product no longer exists." };
      const snapshot = createOrderPriceSnapshot(product, 1);
      if (!snapshot) {
        return { status: "error" as const, message: "Dealer pricing is unavailable for one or more products." };
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE public."DealerCartItem"
        SET
          "unitPriceSnapshot" = ${snapshot.unitPrice},
          "gstRateSnapshot" = ${snapshot.gstRate},
          "priceSourceSnapshot" = ${snapshot.priceSource}::public."OrderItemPriceSource",
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${item.id}
      `);

      snapshots.push({
        productId: item.productId,
        unitPriceSnapshot: Number(snapshot.unitPrice),
        gstRateSnapshot: Number(snapshot.gstRate),
        priceSourceSnapshot: snapshot.priceSource,
      });
    }

    const updatedRows = await tx.$queryRaw<Array<{ version: number; updatedAt: Date }>>(Prisma.sql`
      UPDATE public."DealerCart"
      SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${cart.id}
      RETURNING "version", "updatedAt"
    `);

    const updated = updatedRows[0];
    return {
      status: "pricing-accepted" as const,
      version: updated.version,
      savedAt: updated.updatedAt.toISOString(),
      items: snapshots,
    };
  });
}
