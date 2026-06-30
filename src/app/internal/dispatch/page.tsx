import { AccessDeniedCard } from "@/components/access-denied-card";
import { OrderStatusTimeline } from "@/components/order-status-timeline";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderStatusHistoryMap } from "@/lib/order-status-history";
import { getOrdersWithRelations } from "@/lib/order-queries";
import {
  getDarkOrderStatusClass,
  getItemFulfillmentSummary,
  getOrderFulfillmentSummary,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import {
  adjustOrderItemQuantityAction,
  approveRemainingQuantityAction,
  approveCancellationRequestAction,
  assignDriverAction,
  blockOrderStockAction,
  markReadyForDispatchAction,
  markStockCheckedAction,
} from "./actions";

type DeliveryProofRow = {
  id: string;
  orderId: string;
  uploadedByName: string | null;
  proofType: string;
  fileName: string;
  mimeType: string;
  note: string | null;
  uploadedAt: Date | string;
};


type TransportOptionRow = {
  id: string;
  name: string;
  description: string | null;
};

function SelectArrow() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
      <svg
        className="h-5 w-5 text-slate-300"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatDateTime(date: Date | string | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}

function getBlockStatusClass(status: string) {
  if (status === "ACTIVE") {
    return "bg-cyan-300/10 text-cyan-300 ring-1 ring-cyan-300/20";
  }

  if (status === "CONSUMED") {
    return "bg-emerald-300/10 text-emerald-300 ring-1 ring-emerald-300/20";
  }

  return "bg-slate-300/10 text-slate-300 ring-1 ring-slate-300/20";
}

type DispatchStockBlockRow = {
  id: string;
  orderId: string;
  orderItemId: string;
  productCode: string;
  productName: string;
  productStack: string;
  quantity: number;
  status: string;
  blockReason: string;
  releaseReason: string | null;
  blockedAt: Date | string;
  releasedAt: Date | string | null;
  blockedByName: string | null;
  releasedByName: string | null;
};

function getDispatchMessage(error?: string, success?: string) {
  if (success === "stock-checked") {
    return {
      type: "success",
      text: "Order marked as stock checked.",
    };
  }

  if (success === "quantity-adjusted") {
    return {
      type: "success",
      text: "Approved quantity updated successfully.",
    };
  }

  if (success === "remaining-approved") {
    return {
      type: "success",
      text: "Remaining short quantity approved. It can now be blocked and dispatched in the next cycle.",
    };
  }

  if (success === "stock-blocked") {
    return {
      type: "success",
      text: "Full available quantity blocked successfully for this order.",
    };
  }

  if (success === "partial-stock-blocked") {
    return {
      type: "success",
      text: "Available stock was partially blocked. Remaining quantity is pending/backordered.",
    };
  }

  if (success === "backordered") {
    return {
      type: "success",
      text: "No stock was available. Order moved to backordered status.",
    };
  }

  if (success === "ready-for-dispatch") {
    return {
      type: "success",
      text: "Blocked quantity marked as ready for dispatch.",
    };
  }

  if (success === "driver-assigned") {
    return {
      type: "success",
      text: "Transport and driver assigned successfully. The order is now visible in the field delivery portal.",
    };
  }

  if (success === "cancellation-approved") {
    return {
      type: "success",
      text: "Cancellation approved. Delivered stock stays consumed; only remaining/blocked quantity was closed or released.",
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to perform this dispatch action.",
    };
  }

  if (error === "missing-order-item") {
    return {
      type: "error",
      text: "Order item id is missing.",
    };
  }

  if (error === "order-item-not-found") {
    return {
      type: "error",
      text: "Selected order item was not found in the database.",
    };
  }

  if (error === "invalid-adjust-quantity") {
    return {
      type: "error",
      text: "Approved quantity must be greater than zero and cannot be less than already delivered/cancelled quantity.",
    };
  }

  if (error === "approved-exceeds-requested") {
    return {
      type: "error",
      text: "Approved quantity cannot be greater than the dealer requested quantity.",
    };
  }

  if (error === "approved-work-not-finished") {
    return {
      type: "error",
      text: "Existing approved quantity is still pending or blocked. Dispatch/deliver it first, then approve remaining short quantity later.",
    };
  }

  if (error === "no-short-quantity") {
    return {
      type: "error",
      text: "There is no short quantity left to approve for this order.",
    };
  }

  if (error === "missing-order") {
    return {
      type: "error",
      text: "Order id is missing.",
    };
  }

  if (error === "missing-driver") {
    return {
      type: "error",
      text: "Please select a driver before assigning transport.",
    };
  }

  if (error === "missing-transport") {
    return {
      type: "error",
      text: "Please select a transport option before assigning dispatch.",
    };
  }

  if (error === "transport-not-found") {
    return {
      type: "error",
      text: "Selected transport option was not found or is disabled.",
    };
  }

  if (error === "driver-not-found") {
    return {
      type: "error",
      text: "Selected driver was not found or is not active.",
    };
  }

  if (error === "order-not-found") {
    return {
      type: "error",
      text: "Selected order was not found in the database.",
    };
  }

  if (error === "invalid-status") {
    return {
      type: "error",
      text: "This action is not allowed for the current order status.",
    };
  }

  if (error === "nothing-to-dispatch") {
    return {
      type: "error",
      text: "There is no blocked quantity available to dispatch.",
    };
  }

  return null;
}

function canInventoryControl(role: string) {
  return ["owner", "manager", "inventory_team"].includes(role);
}

function canDispatchControl(role: string) {
  return ["owner", "manager", "dispatch_team"].includes(role);
}

function canBlockStock(status: string) {
  return [
    "NEW_ORDER",
    "STOCK_CHECKED",
    "BACKORDERED",
    "PARTIALLY_BLOCKED",
    "PARTIALLY_DELIVERED",
  ].includes(status);
}

function canMarkReady(status: string, blockedQuantity: number) {
  return (
    ["STOCK_BLOCKED", "PARTIALLY_BLOCKED"].includes(status) &&
    blockedQuantity > 0
  );
}

function canAdjustQuantity(status: string) {
  return [
    "NEW_ORDER",
    "STOCK_CHECKED",
    "BACKORDERED",
    "PARTIALLY_BLOCKED",
    "PARTIALLY_DELIVERED",
  ].includes(status);
}

function canApproveRemainingQuantity({
  status,
  shortQuantity,
  pending,
  blocked,
  delivered,
}: {
  status: string;
  shortQuantity: number;
  pending: number;
  blocked: number;
  delivered: number;
}) {
  return (
    shortQuantity > 0 &&
    pending <= 0 &&
    blocked <= 0 &&
    delivered > 0 &&
    ["PARTIALLY_DELIVERED", "DELIVERED", "INVOICE_UPLOADED"].includes(status)
  );
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getDispatchMessage(params?.error, params?.success);

  const { currentUser, hasAccess } = await checkPermission("manage_dispatch");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Dispatch Access Denied"
        description="Your current role does not have permission to access the Dispatch Management module."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [orders, drivers, transportOptions] = await Promise.all([
    getOrdersWithRelations(),

    prisma.user.findMany({
      where: {
        role: UserRole.DRIVER_TRANSPORT,
        status: UserStatus.ACTIVE,
      },
      orderBy: {
        name: "asc",
      },
    }),

    prisma.$queryRaw<TransportOptionRow[]>`
      SELECT "id", "name", "description"
      FROM "TransportOption"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC, "name" ASC
    `,
  ]);

  const orderIds = orders.map((order) => order.id);

  const statusHistoryMap = await getOrderStatusHistoryMap(prisma, orderIds);

  const stockBlockRows =
    orderIds.length > 0
      ? await prisma.$queryRawUnsafe<DispatchStockBlockRow[]>(
          `
            SELECT
              sbt."id",
              sbt."orderId",
              sbt."orderItemId",
              p."code" AS "productCode",
              p."name" AS "productName",
              p."stack" AS "productStack",
              sbt."quantity",
              sbt."status",
              sbt."blockReason",
              sbt."releaseReason",
              sbt."blockedAt",
              sbt."releasedAt",
              sbt."blockedByName",
              sbt."releasedByName"
            FROM "StockBlockTimeline" sbt
            INNER JOIN "Product" p ON p."id" = sbt."productId"
            WHERE sbt."orderId" IN (${orderIds.map((_, index) => `$${index + 1}`).join(", ")})
            ORDER BY sbt."blockedAt" DESC
          `,
          ...orderIds,
        )
      : [];

  const stockBlockTimelineByOrderId = new Map<
    string,
    DispatchStockBlockRow[]
  >();

  for (const row of stockBlockRows) {
    const existingRows = stockBlockTimelineByOrderId.get(row.orderId);

    if (existingRows) {
      existingRows.push(row);
      continue;
    }

    stockBlockTimelineByOrderId.set(row.orderId, [row]);
  }

  const deliveryProofRows =
    orderIds.length > 0
      ? await prisma.$queryRawUnsafe<DeliveryProofRow[]>(
          `
            SELECT
              dp."id",
              dp."orderId",
              uploader."name" AS "uploadedByName",
              dp."proofType",
              dp."fileName",
              dp."mimeType",
              dp."note",
              dp."uploadedAt"
            FROM "DeliveryProof" dp
            LEFT JOIN "User" uploader ON uploader."id" = dp."uploadedById"
            WHERE dp."orderId" IN (${orderIds.map((_, index) => `$${index + 1}`).join(", ")})
            ORDER BY dp."uploadedAt" DESC
          `,
          ...orderIds,
        )
      : [];

  const deliveryProofsByOrderId = new Map<string, DeliveryProofRow[]>();

  for (const proof of deliveryProofRows) {
    const existingProofs = deliveryProofsByOrderId.get(proof.orderId);

    if (existingProofs) {
      existingProofs.push(proof);
      continue;
    }

    deliveryProofsByOrderId.set(proof.orderId, [proof]);
  }

  const ordersWithHistory = orders.map((order) => ({
    ...order,
    statusHistory: statusHistoryMap.get(order.id) ?? [],
    deliveryProofs: deliveryProofsByOrderId.get(order.id) ?? [],
  }));

  const stats = [
    {
      label: "Total Orders",
      value: String(ordersWithHistory.length),
    },
    {
      label: "Backordered",
      value: String(
        ordersWithHistory.filter((order) => order.status === "BACKORDERED")
          .length,
      ),
    },
    {
      label: "Partial",
      value: String(
        ordersWithHistory.filter((order) =>
          [
            "PARTIALLY_BLOCKED",
            "PARTIALLY_DELIVERED",
            "PARTIALLY_CANCELLED",
          ].includes(order.status),
        ).length,
      ),
    },
    {
      label: "Ready / QC",
      value: String(
        ordersWithHistory.filter((order) =>
          ["READY_FOR_DISPATCH", "QC_APPROVED"].includes(order.status),
        ).length,
      ),
    },
  ];

  const inventoryControl = canInventoryControl(currentUser.role);
  const dispatchControl = canDispatchControl(currentUser.role);

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 sm:text-sm">
            Dispatch Module
          </p>

          <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
            Dispatch Management
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm sm:leading-6">
            Process dealer orders with stock checking, partial stock blocking,
            backorders, QC approval, driver assignment, and delivery tracking.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200">
          Role: <span className="text-cyan-300">{currentUser.role}</span>
        </div>
      </div>

      {message && (
        <div
          className={`mt-8 rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-300"
              : "border-red-300/20 bg-red-300/10 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:rounded-3xl sm:p-6"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <h2 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 p-4 sm:p-6">
          <h2 className="text-xl font-bold">Order Workflow</h2>

          <p className="mt-2 text-sm text-slate-400">
            Partial fulfilment is supported. Example: requested 20, available 10
            → block 10, dispatch 10, keep 10 pending/backordered.
          </p>
        </div>

        {ordersWithHistory.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <h3 className="text-lg font-bold text-white">No orders found</h3>
            <p className="mt-2 text-sm text-slate-400">
              New dealer orders will appear here after submission.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {ordersWithHistory.map((order) => {
              const summary = getOrderFulfillmentSummary(order.items);
              const blockRows = stockBlockTimelineByOrderId.get(order.id) ?? [];

              return (
                <div key={order.id} className="p-4 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-bold text-white">
                          {order.orderNumber}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getDarkOrderStatusClass(
                            order.status,
                          )}`}
                        >
                          {getOrderStatusLabel(order.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-400">
                        Dealer:{" "}
                        <span className="font-semibold text-slate-200">
                          {order.dealer.name}
                        </span>{" "}
                        · {order.dealer.email}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Placed on {formatDate(order.createdAt)}
                        {order.assignedDriver
                          ? ` · Driver: ${order.assignedDriver.name}`
                          : ""}
                        {order.transportLabel
                          ? ` · Transport: ${order.transportLabel}`
                          : ""}
                      </p>

                      {order.notes && (
                        <p className="mt-4 max-w-2xl rounded-2xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Requested</p>
                        <p className="mt-1 text-lg font-bold text-white">
                          {summary.requested}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Blocked</p>
                        <p className="mt-1 text-lg font-bold text-cyan-300">
                          {summary.blocked}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Delivered</p>
                        <p className="mt-1 text-lg font-bold text-emerald-300">
                          {summary.delivered}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Cancelled</p>
                        <p className="mt-1 text-lg font-bold text-red-300">
                          {summary.cancelled}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Pending</p>
                        <p className="mt-1 text-lg font-bold text-yellow-300">
                          {summary.pending}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Short</p>
                        <p className="mt-1 text-lg font-bold text-rose-300">
                          {summary.shortQuantity}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:hidden">
                    {order.items.map((item) => {
                      const itemSummary = getItemFulfillmentSummary(item);

                      return (
                        <article
                          key={`mobile-item-${item.id}`}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                        >
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-white">
                              {item.product.name}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.product.code} · {item.product.stack}
                            </p>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 min-[420px]:grid-cols-5">
                            <div className="rounded-xl bg-white/[0.04] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Dealer Req
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-300">
                                {itemSummary.requested}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white/[0.04] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Block
                              </p>
                              <p className="mt-1 text-xs font-bold text-cyan-300">
                                {itemSummary.blocked}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white/[0.04] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Deliver
                              </p>
                              <p className="mt-1 text-xs font-bold text-emerald-300">
                                {itemSummary.delivered}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white/[0.04] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Cancel
                              </p>
                              <p className="mt-1 text-xs font-bold text-red-300">
                                {itemSummary.cancelled}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white/[0.04] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Pending
                              </p>
                              <p className="mt-1 text-xs font-bold text-yellow-300">
                                {itemSummary.pending}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-white/10 lg:block">
                    <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[26%]" />
                        <col className="w-[9%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[10%]" />
                      </colgroup>

                      <thead className="bg-white/[0.04] text-slate-300">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Product</th>
                          <th className="px-4 py-3 font-semibold">Stack</th>
                          <th className="px-4 py-3 font-semibold">Available</th>
                          <th className="px-4 py-3 font-semibold">Requested</th>
                          <th className="px-4 py-3 font-semibold">Blocked</th>
                          <th className="px-4 py-3 font-semibold">Delivered</th>
                          <th className="px-4 py-3 font-semibold">Cancelled</th>
                          <th className="px-4 py-3 font-semibold">Pending</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-white/10">
                        {order.items.map((item) => {
                          const itemSummary = getItemFulfillmentSummary(item);

                          return (
                            <tr key={item.id} className="text-slate-300">
                              <td className="px-4 py-4">
                                <p className="break-words font-semibold text-white">
                                  {item.product.name}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.product.code}
                                </p>
                              </td>

                              <td className="px-4 py-4">
                                {item.product.stack}
                              </td>

                              <td className="px-4 py-4">
                                {item.product.quantity}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.requested}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.blocked}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.delivered}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.cancelled}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.pending}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {blockRows.length > 0 && (
                    <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-cyan-200">
                            Stock Blocking Timeline
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            Product-wise blocking and release history for this
                            order.
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                          {
                            blockRows.filter((row) => row.status === "ACTIVE")
                              .length
                          }{" "}
                          active blocks
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {blockRows.map((row) => (
                          <div
                            key={row.id}
                            className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 md:grid-cols-[minmax(0,1fr)_90px_120px_1fr] md:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-white">
                                {row.productName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {row.productCode} · Stack {row.productStack}
                              </p>
                            </div>

                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                Qty
                              </p>
                              <p className="mt-1 text-sm font-bold text-cyan-300">
                                {row.quantity}
                              </p>
                            </div>

                            <div>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${getBlockStatusClass(row.status)}`}
                              >
                                {row.status}
                              </span>
                            </div>

                            <div className="min-w-0 text-xs leading-5 text-slate-400">
                              <p>
                                Blocked:{" "}
                                <span className="text-slate-200">
                                  {formatDateTime(row.blockedAt)}
                                </span>
                                {row.blockedByName
                                  ? ` by ${row.blockedByName}`
                                  : ""}
                              </p>
                              <p>
                                Closed:{" "}
                                <span className="text-slate-200">
                                  {formatDateTime(row.releasedAt)}
                                </span>
                                {row.releaseReason
                                  ? ` · ${row.releaseReason.replaceAll("_", " ")}`
                                  : " · Active"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(order.deliveryProofs.length > 0 || ["DELIVERED", "PARTIALLY_DELIVERED", "INVOICE_UPLOADED"].includes(order.status)) && (
                    <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-emerald-200">
                            Signed Duplicate Invoice Proof
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            Delivery proof uploaded by driver/transport after successful delivery.
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.signedInvoiceStatus === "UPLOADED" ? "bg-emerald-300/10 text-emerald-300" : "bg-yellow-300/10 text-yellow-300"}`}>
                          {order.signedInvoiceStatus === "UPLOADED" ? "Uploaded" : "Pending"}
                        </span>
                      </div>

                      {order.deliveryProofs.length === 0 ? (
                        <p className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 px-4 py-3 text-xs font-semibold text-yellow-200">
                          Delivery completed but signed duplicate invoice proof is still pending.
                        </p>
                      ) : (
                        <div className="mt-4 grid gap-3">
                          {order.deliveryProofs.map((proof) => (
                            <div key={proof.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-bold text-white">{proof.fileName}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Uploaded by {proof.uploadedByName || "Driver"} · {formatDateTime(proof.uploadedAt)}
                                  </p>
                                  {proof.note && <p className="mt-2 text-xs leading-5 text-slate-300">{proof.note}</p>}
                                </div>
                                <a href={`/field/deliveries/proof/${proof.id}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-emerald-300/30 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-300 hover:text-slate-950">
                                  View Proof
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {inventoryControl && canAdjustQuantity(order.status) && (
                    <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-cyan-200">
                            Adjust Approved Quantity
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            Use this when internal approved quantity needs to be
                            reduced/increased before final dispatch.
                            Dealer&apos;s original requested quantity stays
                            safe. If reduced below blocked quantity, extra
                            blocked stock will be released automatically.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {order.items.map((item) => {
                          const itemSummary = getItemFulfillmentSummary(item);
                          const minimumAllowedQuantity =
                            itemSummary.delivered + itemSummary.cancelled;

                          return (
                            <form
                              key={`adjust-${item.id}`}
                              action={adjustOrderItemQuantityAction}
                              className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end"
                            >
                              <input
                                type="hidden"
                                name="orderItemId"
                                value={item.id}
                              />

                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-white">
                                  {item.product.name}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Approved: {item.quantity} · Blocked:{" "}
                                  {itemSummary.blocked} · Delivered:{" "}
                                  {itemSummary.delivered}
                                </p>
                              </div>

                              <div>
                                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                                  New Approved Qty
                                </label>
                                <input
                                  name="newQuantity"
                                  type="number"
                                  min={minimumAllowedQuantity || 1}
                                  defaultValue={item.quantity}
                                  className="h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm text-white outline-none transition focus:border-cyan-300"
                                  required
                                />
                              </div>

                              <button
                                type="submit"
                                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
                              >
                                Update Qty
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <OrderStatusTimeline history={order.statusHistory} />

                  <div className="mt-5 flex flex-wrap gap-3">
                    {inventoryControl && order.status === "NEW_ORDER" && (
                      <form action={markStockCheckedAction}>
                        <input type="hidden" name="orderId" value={order.id} />

                        <button
                          type="submit"
                          className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-bold text-cyan-300 transition hover:bg-cyan-300 hover:text-slate-950"
                        >
                          Mark Stock Checked
                        </button>
                      </form>
                    )}

                    {(inventoryControl || dispatchControl) &&
                      canApproveRemainingQuantity({
                        status: order.status,
                        shortQuantity: summary.shortQuantity,
                        pending: summary.pending,
                        blocked: summary.blocked,
                        delivered: summary.delivered,
                      }) && (
                        <form action={approveRemainingQuantityAction}>
                          <input
                            type="hidden"
                            name="orderId"
                            value={order.id}
                          />

                          <button
                            type="submit"
                            className="rounded-2xl border border-blue-300/30 bg-blue-300/10 px-5 py-3 text-sm font-bold text-blue-300 transition hover:bg-blue-300 hover:text-slate-950"
                          >
                            Approve Remaining {summary.shortQuantity}
                          </button>
                        </form>
                      )}

                    {inventoryControl &&
                      summary.shortQuantity > 0 &&
                      summary.pending > 0 &&
                      summary.blocked <= 0 && (
                        <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 px-5 py-3 text-sm font-semibold text-yellow-200">
                          Approved quantity is ready to process now. Block
                          available stock for the approved quantity first. Short
                          quantity can be approved later after this approved
                          quantity is delivered.
                        </div>
                      )}

                    {inventoryControl && canBlockStock(order.status) && (
                      <form action={blockOrderStockAction}>
                        <input type="hidden" name="orderId" value={order.id} />

                        <button
                          type="submit"
                          className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
                        >
                          {order.status === "PARTIALLY_DELIVERED" ||
                          order.status === "BACKORDERED"
                            ? "Block Remaining Stock"
                            : "Block Available Stock"}
                        </button>
                      </form>
                    )}

                    {dispatchControl &&
                      canMarkReady(order.status, summary.blocked) && (
                        <form action={markReadyForDispatchAction}>
                          <input
                            type="hidden"
                            name="orderId"
                            value={order.id}
                          />

                          <button
                            type="submit"
                            className="rounded-2xl bg-blue-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-blue-200"
                          >
                            Mark Ready for Dispatch
                          </button>
                        </form>
                      )}

                    {dispatchControl && order.status === "QC_APPROVED" && (
                      <form
                        action={assignDriverAction}
                        className="flex w-full flex-col gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 md:w-auto md:flex-row md:items-center"
                      >
                        <input type="hidden" name="orderId" value={order.id} />

                        <div className="relative min-w-[240px]">
                          <select
                            name="transportOptionId"
                            className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-12 text-sm text-slate-100 outline-none transition focus:border-emerald-300"
                            required
                          >
                            <option value="">Select transport</option>

                            {transportOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>

                          <SelectArrow />
                        </div>

                        <div className="relative min-w-[260px]">
                          <select
                            name="driverId"
                            className="h-12 w-full appearance-none rounded-2xl border border-white/10 bg-slate-900 px-4 pr-12 text-sm text-slate-100 outline-none transition focus:border-emerald-300"
                            required
                          >
                            <option value="">Select driver</option>

                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {driver.name} - {driver.phone || driver.email}
                              </option>
                            ))}
                          </select>

                          <SelectArrow />
                        </div>

                        <button
                          type="submit"
                          className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-200"
                        >
                          Assign Transport
                        </button>
                      </form>
                    )}

                    {dispatchControl &&
                      order.status === "CANCELLATION_REQUESTED" && (
                        <form action={approveCancellationRequestAction}>
                          <input
                            type="hidden"
                            name="orderId"
                            value={order.id}
                          />

                          <button
                            type="submit"
                            className="rounded-2xl bg-red-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-red-200"
                          >
                            {summary.delivered > 0
                              ? "Approve Remaining Cancellation"
                              : "Approve Cancellation & Release Stock"}
                          </button>
                        </form>
                      )}

                    {!inventoryControl &&
                      !dispatchControl &&
                      ![
                        "DELIVERED",
                        "CANCELLED",
                        "PARTIALLY_CANCELLED",
                      ].includes(order.status) && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300">
                          Waiting for responsible team action.
                        </div>
                      )}

                    {order.status === "BACKORDERED" && !inventoryControl && (
                      <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-5 py-3 text-sm font-semibold text-rose-300">
                        Waiting for inventory stock availability.
                      </div>
                    )}

                    {order.status === "CANCELLATION_REQUESTED" && (
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-300">
                        Dealer requested cancellation. Delivered/consumed
                        quantity will stay consumed. Only remaining or active
                        blocked quantity will be cancelled/released.
                      </div>
                    )}

                    {order.status === "TRANSPORT_ASSIGNED" && (
                      <div className="rounded-2xl border border-indigo-300/20 bg-indigo-300/10 px-5 py-3 text-sm font-semibold text-indigo-300">
                        Driver assigned. Waiting for driver update.
                      </div>
                    )}

                    {order.status === "ON_THE_WAY" && (
                      <div className="rounded-2xl border border-orange-300/20 bg-orange-300/10 px-5 py-3 text-sm font-semibold text-orange-300">
                        Order is on the way.
                      </div>
                    )}

                    {order.status === "PARTIALLY_DELIVERED" && (
                      <div className="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-5 py-3 text-sm font-semibold text-teal-300">
                        Partial quantity delivered. Remaining quantity can be
                        blocked again when stock is available.
                      </div>
                    )}

                    {order.status === "PARTIALLY_CANCELLED" && (
                      <div className="rounded-2xl border border-red-300/20 bg-red-300/10 px-5 py-3 text-sm font-semibold text-red-200">
                        Order is closed after partial delivery. Delivered
                        quantity stays consumed, and the remaining
                        dealer-requested quantity is cancelled/closed.
                      </div>
                    )}

                    {order.status === "DELIVERED" && (
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-300">
                        Approved quantity delivered successfully. If short
                        quantity exists, approve remaining quantity to continue
                        the same order.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {transportOptions.length === 0 && (
        <div className="mt-8 rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-6 text-yellow-200">
          <h2 className="text-lg font-bold">No active transport options found</h2>
          <p className="mt-2 text-sm leading-6">
            Add active transport options from Transport before assigning dispatch.
          </p>
        </div>
      )}

      {drivers.length === 0 && (
        <div className="mt-8 rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-6 text-yellow-200">
          <h2 className="text-lg font-bold">No active drivers found</h2>
          <p className="mt-2 text-sm leading-6">
            Create an active user with Driver / Transport role from User
            Management before assigning transport.
          </p>
        </div>
      )}
    </div>
  );
}
