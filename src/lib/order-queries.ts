import { prisma } from "@/lib/db";

type RawOrderRow = {
  id: string;
  orderNumber: string;
  dealerId: string;
  assignedDriverId: string | null;
  transportOptionId: string | null;
  transportLabel: string | null;
  signedInvoiceStatus: string;
  signedInvoiceUploadedAt: Date | string | null;
  status: string;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  dealerName: string;
  dealerEmail: string;
  dealerPhone: string | null;
  dealerRole: string;
  dealerStatus: string;
  dealerCreatedAt: Date | string;
  dealerUpdatedAt: Date | string;
  assignedDriverName: string | null;
  assignedDriverEmail: string | null;
  assignedDriverPhone: string | null;
  assignedDriverRole: string | null;
  assignedDriverStatus: string | null;
  assignedDriverCreatedAt: Date | string | null;
  assignedDriverUpdatedAt: Date | string | null;
  transportOptionName: string | null;
  transportOptionDescription: string | null;
};

type RawOrderItemRow = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  requestedQuantity: number;
  blockedQuantity: number;
  deliveredQuantity: number;
  cancelledQuantity: number;
  unitPrice: string | number;
  gstRate: string | number;
  lineSubtotal: string | number;
  taxAmount: string | number;
  lineTotal: string | number;
  priceSource: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  productCode: string;
  productName: string;
  productStack: string;
  productQuantity: number;
  productBlocked: number;
  productMinimumStock: number;
  productStatus: string;
  productCreatedAt: Date | string;
  productUpdatedAt: Date | string;
};

export type OrderWithRelations = ReturnType<typeof mapOrderRow> & {
  items: ReturnType<typeof mapOrderItemRow>[];
};

export async function getOrdersWithRelations({
  where = "",
  params = [],
  orderBy = `o."createdAt" DESC`,
  limit,
}: {
  where?: string;
  params?: unknown[];
  orderBy?: string;
  limit?: number;
} = {}): Promise<OrderWithRelations[]> {
  const rows = await prisma.$queryRawUnsafe<RawOrderRow[]>(
    `
      SELECT
        o."id",
        o."orderNumber",
        o."dealerId",
        o."assignedDriverId",
        o."transportOptionId",
        o."transportLabel",
        o."signedInvoiceStatus",
        o."signedInvoiceUploadedAt",
        o."status"::text AS "status",
        o."notes",
        o."createdAt",
        o."updatedAt",
        dealer."name" AS "dealerName",
        dealer."email" AS "dealerEmail",
        dealer."phone" AS "dealerPhone",
        dealer."role" AS "dealerRole",
        dealer."status" AS "dealerStatus",
        dealer."createdAt" AS "dealerCreatedAt",
        dealer."updatedAt" AS "dealerUpdatedAt",
        driver."name" AS "assignedDriverName",
        driver."email" AS "assignedDriverEmail",
        driver."phone" AS "assignedDriverPhone",
        driver."role" AS "assignedDriverRole",
        driver."status" AS "assignedDriverStatus",
        driver."createdAt" AS "assignedDriverCreatedAt",
        driver."updatedAt" AS "assignedDriverUpdatedAt",
        transport."name" AS "transportOptionName",
        transport."description" AS "transportOptionDescription"
      FROM public."Order" o
      INNER JOIN public."User" dealer ON dealer."id" = o."dealerId"
      LEFT JOIN public."User" driver ON driver."id" = o."assignedDriverId"
      LEFT JOIN public."TransportOption" transport ON transport."id" = o."transportOptionId"
      ${where}
      ORDER BY ${orderBy}
      ${typeof limit === "number" ? `LIMIT ${limit}` : ""}
    `,
    ...params
  );

  if (rows.length === 0) {
    return [];
  }

  const placeholders = rows.map((_, index) => `$${index + 1}`).join(", ");
  const itemRows = await prisma.$queryRawUnsafe<RawOrderItemRow[]>(
    `
      SELECT
        oi."id",
        oi."orderId",
        oi."productId",
        oi."quantity",
        oi."requestedQuantity",
        oi."blockedQuantity",
        oi."deliveredQuantity",
        oi."cancelledQuantity",
        oi."unitPrice",
        oi."gstRate",
        oi."lineSubtotal",
        oi."taxAmount",
        oi."lineTotal",
        oi."priceSource"::text AS "priceSource",
        oi."createdAt",
        oi."updatedAt",
        p."code" AS "productCode",
        p."name" AS "productName",
        p."stack" AS "productStack",
        p."quantity" AS "productQuantity",
        p."blocked" AS "productBlocked",
        p."minimumStock" AS "productMinimumStock",
        p."status" AS "productStatus",
        p."createdAt" AS "productCreatedAt",
        p."updatedAt" AS "productUpdatedAt"
      FROM public."OrderItem" oi
      INNER JOIN public."Product" p ON p."id" = oi."productId"
      WHERE oi."orderId" IN (${placeholders})
      ORDER BY oi."createdAt" ASC
    `,
    ...rows.map((order) => order.id)
  );

  const itemsByOrderId = new Map<string, ReturnType<typeof mapOrderItemRow>[]>();

  for (const itemRow of itemRows) {
    const item = mapOrderItemRow(itemRow);
    const existingItems = itemsByOrderId.get(item.orderId);

    if (existingItems) {
      existingItems.push(item);
      continue;
    }

    itemsByOrderId.set(item.orderId, [item]);
  }

  return rows.map((row) => ({
    ...mapOrderRow(row),
    items: itemsByOrderId.get(row.id) ?? [],
  }));
}

export async function getOrderStatusRows() {
  return prisma.$queryRawUnsafe<{ status: string }[]>(`
    SELECT "status"
    FROM public."Order"
  `);
}

function mapOrderRow(row: RawOrderRow) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    dealerId: row.dealerId,
    assignedDriverId: row.assignedDriverId,
    transportOptionId: row.transportOptionId,
    transportLabel: row.transportLabel,
    signedInvoiceStatus: row.signedInvoiceStatus,
    signedInvoiceUploadedAt: row.signedInvoiceUploadedAt ? new Date(row.signedInvoiceUploadedAt) : null,
    status: row.status,
    notes: row.notes,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    dealer: {
      id: row.dealerId,
      name: row.dealerName,
      email: row.dealerEmail,
      phone: row.dealerPhone,
      role: row.dealerRole,
      status: row.dealerStatus,
      createdAt: new Date(row.dealerCreatedAt),
      updatedAt: new Date(row.dealerUpdatedAt),
    },
    transportOption: row.transportOptionId
      ? {
          id: row.transportOptionId,
          name: row.transportOptionName ?? row.transportLabel ?? "Transport",
          description: row.transportOptionDescription,
        }
      : null,
    assignedDriver: row.assignedDriverId
      ? {
          id: row.assignedDriverId,
          name: row.assignedDriverName ?? "",
          email: row.assignedDriverEmail ?? "",
          phone: row.assignedDriverPhone,
          role: row.assignedDriverRole ?? "",
          status: row.assignedDriverStatus ?? "",
          createdAt: new Date(row.assignedDriverCreatedAt ?? row.createdAt),
          updatedAt: new Date(row.assignedDriverUpdatedAt ?? row.updatedAt),
        }
      : null,
  };
}

function mapOrderItemRow(row: RawOrderItemRow) {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    quantity: row.quantity,
    requestedQuantity: row.requestedQuantity,
    blockedQuantity: row.blockedQuantity,
    deliveredQuantity: row.deliveredQuantity,
    cancelledQuantity: row.cancelledQuantity,
    unitPrice: Number(row.unitPrice),
    gstRate: Number(row.gstRate),
    lineSubtotal: Number(row.lineSubtotal),
    taxAmount: Number(row.taxAmount),
    lineTotal: Number(row.lineTotal),
    priceSource: row.priceSource,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    product: {
      id: row.productId,
      code: row.productCode,
      name: row.productName,
      stack: row.productStack,
      quantity: row.productQuantity,
      blocked: row.productBlocked,
      minimumStock: row.productMinimumStock,
      status: row.productStatus,
      createdAt: new Date(row.productCreatedAt),
      updatedAt: new Date(row.productUpdatedAt),
    },
  };
}
