import { Prisma, type UserStatus } from "@/generated/prisma/client";
import { prisma } from "./db";
import { getOrderSourceLabel } from "./dealer-directory-shared";


export type DealerProfileRecord = {
  id: string;
  dealerId: string;
  businessName: string;
  contactPerson: string | null;
  gstNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  creditLimit: Prisma.Decimal;
  openingBalance: Prisma.Decimal;
  internalNotes: string | null;
  createdById: string | null;
  createdByName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DealerProfileClient = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;

export async function getDealerProfile(
  dealerId: string,
  client: DealerProfileClient = prisma,
): Promise<DealerProfileRecord | null> {
  const rows = await client.$queryRaw<DealerProfileRecord[]>`
    SELECT *
    FROM public."DealerProfile"
    WHERE "dealerId" = ${dealerId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findDealerProfileByGst(
  gstNumber: string,
  excludedDealerId: string | null = null,
  client: DealerProfileClient = prisma,
) {
  const rows = await client.$queryRaw<{ id: string; dealerId: string }[]>`
    SELECT "id", "dealerId"
    FROM public."DealerProfile"
    WHERE "gstNumber" = ${gstNumber}
      AND (${excludedDealerId}::text IS NULL OR "dealerId" <> ${excludedDealerId})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function insertDealerProfile(
  client: DealerProfileClient,
  profile: DealerProfileRecord,
) {
  await client.$executeRaw`
    INSERT INTO public."DealerProfile" (
      "id", "dealerId", "businessName", "contactPerson", "gstNumber",
      "addressLine1", "addressLine2", "city", "state", "postalCode",
      "creditLimit", "openingBalance", "internalNotes",
      "createdById", "createdByName", "updatedById", "updatedByName",
      "createdAt", "updatedAt"
    ) VALUES (
      ${profile.id}, ${profile.dealerId}, ${profile.businessName}, ${profile.contactPerson}, ${profile.gstNumber},
      ${profile.addressLine1}, ${profile.addressLine2}, ${profile.city}, ${profile.state}, ${profile.postalCode},
      ${profile.creditLimit}, ${profile.openingBalance}, ${profile.internalNotes},
      ${profile.createdById}, ${profile.createdByName}, ${profile.updatedById}, ${profile.updatedByName},
      ${profile.createdAt}, ${profile.updatedAt}
    )
  `;
}

export async function upsertDealerProfile(
  client: DealerProfileClient,
  profile: Omit<DealerProfileRecord, "createdAt" | "updatedAt">,
) {
  await client.$executeRaw`
    INSERT INTO public."DealerProfile" (
      "id", "dealerId", "businessName", "contactPerson", "gstNumber",
      "addressLine1", "addressLine2", "city", "state", "postalCode",
      "creditLimit", "openingBalance", "internalNotes",
      "createdById", "createdByName", "updatedById", "updatedByName",
      "createdAt", "updatedAt"
    ) VALUES (
      ${profile.id}, ${profile.dealerId}, ${profile.businessName}, ${profile.contactPerson}, ${profile.gstNumber},
      ${profile.addressLine1}, ${profile.addressLine2}, ${profile.city}, ${profile.state}, ${profile.postalCode},
      ${profile.creditLimit}, ${profile.openingBalance}, ${profile.internalNotes},
      ${profile.createdById}, ${profile.createdByName}, ${profile.updatedById}, ${profile.updatedByName},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("dealerId") DO UPDATE SET
      "businessName" = EXCLUDED."businessName",
      "contactPerson" = EXCLUDED."contactPerson",
      "gstNumber" = EXCLUDED."gstNumber",
      "addressLine1" = EXCLUDED."addressLine1",
      "addressLine2" = EXCLUDED."addressLine2",
      "city" = EXCLUDED."city",
      "state" = EXCLUDED."state",
      "postalCode" = EXCLUDED."postalCode",
      "creditLimit" = EXCLUDED."creditLimit",
      "openingBalance" = EXCLUDED."openingBalance",
      "internalNotes" = EXCLUDED."internalNotes",
      "updatedById" = EXCLUDED."updatedById",
      "updatedByName" = EXCLUDED."updatedByName",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

export {
  dealerOrderSourceOptions,
  formatDealerAccountCurrency,
  formatDealerDirectoryDate,
  getOrderSourceLabel,
  isInternalDealerOrderSource,
} from "./dealer-directory-shared";
export type { InternalDealerOrderSource } from "./dealer-directory-shared";

export function dealerRoleWhere(): Prisma.UserWhereInput {
  return {
    OR: [
      { role: "DEALER" },
      { roleAssignments: { some: { role: "DEALER" } } },
    ],
  };
}

type DealerDirectoryRawRow = {
  dealerId: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  createdAt: Date;
  businessName: string | null;
  contactPerson: string | null;
  gstNumber: string | null;
  city: string | null;
  state: string | null;
  creditLimit: Prisma.Decimal | string | number;
  openingBalance: Prisma.Decimal | string | number;
  totalOrders: bigint | number;
  activeOrders: bigint | number;
  deliveredOrders: bigint | number;
  cancelledOrders: bigint | number;
  lastOrderAt: Date | null;
  deliveredValue: Prisma.Decimal | string | number;
  verifiedCollections: Prisma.Decimal | string | number;
  pendingCollectionValue: Prisma.Decimal | string | number;
};

export type DealerDirectoryRow = {
  dealerId: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  createdAt: Date;
  businessName: string;
  contactPerson: string | null;
  gstNumber: string | null;
  city: string | null;
  state: string | null;
  creditLimit: number;
  openingBalance: number;
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  lastOrderAt: Date | null;
  deliveredValue: number;
  verifiedCollections: number;
  pendingCollectionValue: number;
  outstanding: number;
  creditAvailable: number;
};

export async function getDealerDirectoryRows(): Promise<DealerDirectoryRow[]> {
  const rows = await prisma.$queryRaw<DealerDirectoryRawRow[]>`
    WITH dealer_users AS (
      SELECT
        u."id" AS "dealerId",
        u."name",
        u."email",
        u."phone",
        u."status",
        u."createdAt"
      FROM public."User" u
      WHERE u."role" = 'DEALER'::public."UserRole"
         OR EXISTS (
           SELECT 1
           FROM public."UserRoleAssignment" ura
           WHERE ura."userId" = u."id"
             AND ura."role" = 'DEALER'::public."UserRole"
         )
    ),
    order_totals AS (
      SELECT
        o."id",
        o."dealerId",
        o."status"::text AS "status",
        o."createdAt",
        COALESCE(SUM(oi."lineTotal"), 0)::numeric AS "total"
      FROM public."Order" o
      LEFT JOIN public."OrderItem" oi ON oi."orderId" = o."id"
      GROUP BY o."id"
    ),
    order_summary AS (
      SELECT
        ot."dealerId",
        COUNT(*)::bigint AS "totalOrders",
        COUNT(*) FILTER (
          WHERE ot."status" NOT IN ('DELIVERED', 'INVOICE_UPLOADED', 'CANCELLED')
        )::bigint AS "activeOrders",
        COUNT(*) FILTER (
          WHERE ot."status" IN ('DELIVERED', 'INVOICE_UPLOADED')
        )::bigint AS "deliveredOrders",
        COUNT(*) FILTER (WHERE ot."status" = 'CANCELLED')::bigint AS "cancelledOrders",
        MAX(ot."createdAt") AS "lastOrderAt",
        COALESCE(SUM(ot."total") FILTER (
          WHERE ot."status" IN ('DELIVERED', 'INVOICE_UPLOADED')
        ), 0)::numeric AS "deliveredValue"
      FROM order_totals ot
      GROUP BY ot."dealerId"
    ),
    collection_summary AS (
      SELECT
        ca."dealerId",
        COALESCE(SUM(ca."amountCollected") FILTER (
          WHERE ca."status" = 'VERIFIED'::public."CollectionStatus"
        ), 0)::numeric AS "verifiedCollections",
        COALESCE(SUM(GREATEST(ca."amountToCollect" - ca."amountCollected", 0)) FILTER (
          WHERE ca."status" NOT IN (
            'VERIFIED'::public."CollectionStatus",
            'CANCELLED'::public."CollectionStatus"
          )
        ), 0)::numeric AS "pendingCollectionValue"
      FROM public."CollectionAssignment" ca
      WHERE ca."dealerId" IS NOT NULL
      GROUP BY ca."dealerId"
    )
    SELECT
      du."dealerId",
      du."name",
      du."email",
      du."phone",
      du."status",
      du."createdAt",
      dp."businessName",
      dp."contactPerson",
      dp."gstNumber",
      dp."city",
      dp."state",
      COALESCE(dp."creditLimit", 0)::numeric AS "creditLimit",
      COALESCE(dp."openingBalance", 0)::numeric AS "openingBalance",
      COALESCE(os."totalOrders", 0)::bigint AS "totalOrders",
      COALESCE(os."activeOrders", 0)::bigint AS "activeOrders",
      COALESCE(os."deliveredOrders", 0)::bigint AS "deliveredOrders",
      COALESCE(os."cancelledOrders", 0)::bigint AS "cancelledOrders",
      os."lastOrderAt",
      COALESCE(os."deliveredValue", 0)::numeric AS "deliveredValue",
      COALESCE(cs."verifiedCollections", 0)::numeric AS "verifiedCollections",
      COALESCE(cs."pendingCollectionValue", 0)::numeric AS "pendingCollectionValue"
    FROM dealer_users du
    LEFT JOIN public."DealerProfile" dp ON dp."dealerId" = du."dealerId"
    LEFT JOIN order_summary os ON os."dealerId" = du."dealerId"
    LEFT JOIN collection_summary cs ON cs."dealerId" = du."dealerId"
    ORDER BY COALESCE(dp."businessName", du."name") ASC, du."name" ASC
  `;

  return rows.map((row) => {
    const creditLimit = Number(row.creditLimit ?? 0);
    const openingBalance = Number(row.openingBalance ?? 0);
    const deliveredValue = Number(row.deliveredValue ?? 0);
    const verifiedCollections = Number(row.verifiedCollections ?? 0);
    const outstanding = openingBalance + deliveredValue - verifiedCollections;

    return {
      dealerId: row.dealerId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      createdAt: row.createdAt,
      businessName: row.businessName?.trim() || row.name,
      contactPerson: row.contactPerson,
      gstNumber: row.gstNumber,
      city: row.city,
      state: row.state,
      creditLimit,
      openingBalance,
      totalOrders: Number(row.totalOrders ?? 0),
      activeOrders: Number(row.activeOrders ?? 0),
      deliveredOrders: Number(row.deliveredOrders ?? 0),
      cancelledOrders: Number(row.cancelledOrders ?? 0),
      lastOrderAt: row.lastOrderAt,
      deliveredValue,
      verifiedCollections,
      pendingCollectionValue: Number(row.pendingCollectionValue ?? 0),
      outstanding,
      creditAvailable: Math.max(creditLimit - Math.max(outstanding, 0), 0),
    };
  });
}

export type DealerAccountHistoryEntry = {
  id: string;
  type: "OPENING" | "ORDER" | "COLLECTION";
  reference: string;
  description: string;
  source: string | null;
  debit: number;
  credit: number;
  occurredAt: Date;
  href: string | null;
};

export async function getDealerAccountHistory(dealerId: string) {
  const [dealer, dealerProfile] = await Promise.all([
    prisma.user.findFirst({
      where: { id: dealerId, ...dealerRoleWhere() },
      include: {
        dealerOrders: {
          include: { items: { select: { lineTotal: true } } },
          orderBy: { createdAt: "desc" },
        },
        collectionTasksDealer: {
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getDealerProfile(dealerId),
  ]);

  if (!dealer) return null;

  const entries: DealerAccountHistoryEntry[] = [];
  const openingBalance = Number(dealerProfile?.openingBalance ?? 0);

  if (openingBalance !== 0) {
    entries.push({
      id: `opening-${dealer.id}`,
      type: "OPENING",
      reference: "Opening balance",
      description: "Operational opening balance configured for this dealer.",
      source: null,
      debit: openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      occurredAt: dealerProfile?.createdAt ?? dealer.createdAt,
      href: null,
    });
  }

  for (const order of dealer.dealerOrders) {
    if (!["DELIVERED", "INVOICE_UPLOADED"].includes(order.status)) continue;
    entries.push({
      id: `order-${order.id}`,
      type: "ORDER",
      reference: order.orderNumber,
      description: `${getOrderSourceLabel(order.source)} order delivered and included in operational outstanding.`,
      source: getOrderSourceLabel(order.source),
      debit: order.items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
      credit: 0,
      occurredAt: order.deliveredAt ?? order.updatedAt,
      href: `/internal/order-journey?orderId=${encodeURIComponent(order.id)}`,
    });
  }

  for (const collection of dealer.collectionTasksDealer) {
    if (collection.status !== "VERIFIED" || collection.amountCollected <= 0) continue;
    entries.push({
      id: `collection-${collection.id}`,
      type: "COLLECTION",
      reference: collection.collectionNumber,
      description: `${collection.paymentMode.replaceAll("_", " ")} collection verified.`,
      source: collection.paymentMode.replaceAll("_", " "),
      debit: 0,
      credit: collection.amountCollected,
      occurredAt: collection.verifiedAt ?? collection.updatedAt,
      href: "/internal/collections",
    });
  }

  entries.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());

  const debit = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const credit = entries.reduce((sum, entry) => sum + entry.credit, 0);

  return {
    dealer: { ...dealer, dealerProfile },
    entries,
    totals: {
      debit,
      credit,
      outstanding: debit - credit,
      creditLimit: Number(dealerProfile?.creditLimit ?? 0),
    },
  };
}

