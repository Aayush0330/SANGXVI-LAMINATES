import { Prisma, type OrderItemPriceSource } from "@/generated/prisma/client";

type DealerCartClient = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

type DealerCartRow = {
  id: string;
  dealerId: string;
  notes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DealerCartItemRow = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  unitPriceSnapshot: Prisma.Decimal;
  gstRateSnapshot: Prisma.Decimal;
  priceSourceSnapshot: OrderItemPriceSource;
  createdAt: Date;
  updatedAt: Date;
};

export type DealerCartRecord = DealerCartRow & {
  items: DealerCartItemRow[];
};

export async function getDealerCart(
  client: DealerCartClient,
  dealerId: string,
  options?: { lock?: boolean },
): Promise<DealerCartRecord | null> {
  const cartRows = options?.lock
    ? await client.$queryRaw<DealerCartRow[]>(Prisma.sql`
        SELECT "id", "dealerId", "notes", "version", "createdAt", "updatedAt"
        FROM public."DealerCart"
        WHERE "dealerId" = ${dealerId}
        LIMIT 1
        FOR UPDATE
      `)
    : await client.$queryRaw<DealerCartRow[]>(Prisma.sql`
        SELECT "id", "dealerId", "notes", "version", "createdAt", "updatedAt"
        FROM public."DealerCart"
        WHERE "dealerId" = ${dealerId}
        LIMIT 1
      `);

  const cart = cartRows[0];
  if (!cart) return null;

  const items = await client.$queryRaw<DealerCartItemRow[]>(Prisma.sql`
    SELECT
      "id", "cartId", "productId", "quantity",
      "unitPriceSnapshot", "gstRateSnapshot", "priceSourceSnapshot",
      "createdAt", "updatedAt"
    FROM public."DealerCartItem"
    WHERE "cartId" = ${cart.id}
    ORDER BY "createdAt" ASC, "id" ASC
  `);

  return { ...cart, items };
}

export async function deleteDealerCart(client: DealerCartClient, cartId: string) {
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public."DealerCart"
    WHERE "id" = ${cartId}
  `);
}
