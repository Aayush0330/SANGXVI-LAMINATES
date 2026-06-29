import { AccessDeniedCard } from "@/components/access-denied-card";
import { cancelDealerOrderAction } from "./actions";
import { OrderStatusTimeline } from "@/components/order-status-timeline";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderStatusHistoryMap } from "@/lib/order-status-history";
import {
  getItemFulfillmentSummary,
  getLightOrderStatusClass,
  getOrderFulfillmentSummary,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";

type DealerOrderRow = {
  id: string;
  orderNumber: string;
  dealerId: string;
  assignedDriverId: string | null;
  status: string;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DealerOrderItemRow = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  requestedQuantity: number;
  blockedQuantity: number;
  deliveredQuantity: number;
  cancelledQuantity: number;
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}


function canDealerCancelDirectly(status: string) {
  return ["NEW_ORDER", "STOCK_CHECKED", "BACKORDERED"].includes(status);
}

function canDealerRequestCancellation(status: string) {
  return [
    "STOCK_BLOCKED",
    "PARTIALLY_BLOCKED",
    "READY_FOR_DISPATCH",
    "QC_APPROVED",
    "TRANSPORT_ASSIGNED",
    "PARTIALLY_DELIVERED",
  ].includes(status);
}

function getDealerOrderMessage(error?: string, success?: string) {
  if (success === "order-cancelled") {
    return { type: "success", text: "Order cancelled successfully." };
  }

  if (success === "cancellation-requested") {
    return { type: "success", text: "Cancellation request sent to internal team." };
  }

  if (error === "cancel-not-allowed") {
    return { type: "error", text: "This order cannot be cancelled at the current stage." };
  }

  if (error === "permission-denied") {
    return { type: "error", text: "You do not have permission to cancel this order." };
  }

  if (error === "order-not-found") {
    return { type: "error", text: "Selected order was not found." };
  }

  return null;
}

async function getDealerOrders(dealerId: string) {
  const orderRows = await prisma.$queryRawUnsafe<DealerOrderRow[]>(
    `
      SELECT
        "id",
        "orderNumber",
        "dealerId",
        "assignedDriverId",
        "status",
        "notes",
        "createdAt",
        "updatedAt"
      FROM "Order"
      WHERE "dealerId" = $1
      ORDER BY "createdAt" DESC
    `,
    dealerId
  );

  if (orderRows.length === 0) {
    return [];
  }

  const placeholders = orderRows.map((_, index) => `$${index + 1}`).join(", ");
  const itemRows = await prisma.$queryRawUnsafe<DealerOrderItemRow[]>(
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
      FROM "OrderItem" oi
      INNER JOIN "Product" p ON p."id" = oi."productId"
      WHERE oi."orderId" IN (${placeholders})
      ORDER BY oi."createdAt" ASC
    `,
    ...orderRows.map((order) => order.id)
  );

  const itemsByOrderId = new Map<string, ReturnType<typeof mapDealerOrderItem>[]>();

  for (const itemRow of itemRows) {
    const item = mapDealerOrderItem(itemRow);
    const existingItems = itemsByOrderId.get(item.orderId);

    if (existingItems) {
      existingItems.push(item);
      continue;
    }

    itemsByOrderId.set(item.orderId, [item]);
  }

  return orderRows.map((order) => ({
    ...order,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    items: itemsByOrderId.get(order.id) ?? [],
  }));
}

function mapDealerOrderItem(item: DealerOrderItemRow) {
  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    quantity: item.quantity,
    requestedQuantity: item.requestedQuantity,
    blockedQuantity: item.blockedQuantity,
    deliveredQuantity: item.deliveredQuantity,
    cancelledQuantity: item.cancelledQuantity,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    product: {
      id: item.productId,
      code: item.productCode,
      name: item.productName,
      stack: item.productStack,
      quantity: item.productQuantity,
      blocked: item.productBlocked,
      minimumStock: item.productMinimumStock,
      status: item.productStatus,
      createdAt: new Date(item.productCreatedAt),
      updatedAt: new Date(item.productUpdatedAt),
    },
  };
}

export default async function DealerOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getDealerOrderMessage(params?.error, params?.success);

  const { currentUser, hasAccess } = await checkPermission(
    "track_dealer_orders"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Orders Access Denied"
        description="Your current role does not have permission to track dealer orders."
        backHref="/dealer/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const dealer = await prisma.user.findUnique({
    where: {
      email: currentUser.email,
    },
  });

  if (!dealer) {
    return (
      <AccessDeniedCard
        title="Dealer Account Not Found"
        description="Your dealer account was not found in the database."
        backHref="/dealer/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const orders = await getDealerOrders(dealer.id);

  const statusHistoryMap = await getOrderStatusHistoryMap(
    prisma,
    orders.map((order) => order.id)
  );

  const ordersWithHistory = orders.map((order) => ({
    ...order,
    statusHistory: statusHistoryMap.get(order.id) ?? [],
  }));

  const stats = [
    {
      label: "Total Orders",
      value: String(ordersWithHistory.length),
    },
    {
      label: "Active Orders",
      value: String(
        ordersWithHistory.filter(
          (order) => order.status !== "DELIVERED" && order.status !== "CANCELLED"
        ).length
      ),
    },
    {
      label: "Partial Orders",
      value: String(
        ordersWithHistory.filter((order) =>
          ["PARTIALLY_BLOCKED", "PARTIALLY_DELIVERED"].includes(order.status)
        ).length
      ),
    },
    {
      label: "Delivered",
      value: String(
        ordersWithHistory.filter((order) => order.status === "DELIVERED").length
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-500 sm:text-sm">
            Dealer Portal
          </p>

          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:mt-3 sm:text-3xl md:text-5xl">
            My Orders
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600 sm:mt-4 sm:text-sm sm:leading-6">
            Track requested, blocked, delivered, and pending quantities for your
            orders.
          </p>
        </div>

        <a
          href="/dealer/place-order"
          className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-center text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-300 sm:w-auto"
        >
          + Place New Order
        </a>
      </div>

      {message && (
        <div
          className={`mt-6 rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:mt-3 sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-slate-950">Orders List</h2>

          <p className="mt-2 text-sm text-slate-500">
            Partial fulfilment and pending quantities are visible here.
          </p>
        </div>

        {ordersWithHistory.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <h3 className="text-lg font-bold text-slate-950">
              No orders found
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              You have not placed any dealer orders yet.
            </p>

            <a
              href="/dealer/place-order"
              className="mt-5 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-300"
            >
              Place First Order
            </a>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ordersWithHistory.map((order) => {
              const summary = getOrderFulfillmentSummary(order.items);

              return (
                <div key={order.id} className="p-4 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-950">
                          {order.orderNumber}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getLightOrderStatusClass(
                            order.status
                          )}`}
                        >
                          {getOrderStatusLabel(order.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-500">
                        Placed on {formatDate(order.createdAt)}
                      </p>

                      {order.notes && (
                        <p className="mt-4 max-w-2xl rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-500">Dealer Req.</p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {summary.requested}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-500">Approved</p>
                        <p className="mt-1 text-lg font-bold text-blue-700">
                          {summary.approved}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-500">Blocked</p>
                        <p className="mt-1 text-lg font-bold text-cyan-700">
                          {summary.blocked}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-500">Delivered</p>
                        <p className="mt-1 text-lg font-bold text-emerald-700">
                          {summary.delivered}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-500">Pending</p>
                        <p className="mt-1 text-lg font-bold text-yellow-700">
                          {summary.pending}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-xs text-slate-500">Short</p>
                        <p className="mt-1 text-lg font-bold text-rose-700">
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
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-slate-950">
                              {item.product.name}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.product.code} · {item.product.stack}
                            </p>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 min-[420px]:grid-cols-5">
                            <div className="rounded-xl bg-white p-2 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                Dealer Req
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-950">
                                {itemSummary.requested}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                Approved
                              </p>
                              <p className="mt-1 text-xs font-bold text-blue-700">
                                {itemSummary.approved}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                Block
                              </p>
                              <p className="mt-1 text-xs font-bold text-cyan-700">
                                {itemSummary.blocked}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                Deliver
                              </p>
                              <p className="mt-1 text-xs font-bold text-emerald-700">
                                {itemSummary.delivered}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                Pending
                              </p>
                              <p className="mt-1 text-xs font-bold text-yellow-700">
                                {itemSummary.pending}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                    <table className="w-full min-w-[920px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[10%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                      </colgroup>

                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Product</th>
                          <th className="px-4 py-3 font-semibold">Stack</th>
                          <th className="px-4 py-3 font-semibold">
                            Dealer Req.
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            Approved
                          </th>
                          <th className="px-4 py-3 font-semibold">Blocked</th>
                          <th className="px-4 py-3 font-semibold">
                            Delivered
                          </th>
                          <th className="px-4 py-3 font-semibold">Pending</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {order.items.map((item) => {
                          const itemSummary = getItemFulfillmentSummary(item);

                          return (
                            <tr key={item.id} className="text-slate-600">
                              <td className="px-4 py-4">
                                <p className="break-words font-semibold text-slate-950">
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
                                {itemSummary.requested}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.approved}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.blocked}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.delivered}
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

                  {(canDealerCancelDirectly(order.status) ||
                    canDealerRequestCancellation(order.status)) && (
                    <form
                      action={cancelDealerOrderAction}
                      className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4"
                    >
                      <input type="hidden" name="orderId" value={order.id} />

                      <label className="text-xs font-bold uppercase tracking-[0.16em] text-red-500">
                        {canDealerCancelDirectly(order.status)
                          ? "Cancel Order"
                          : "Request Cancellation"}
                      </label>

                      <textarea
                        name="reason"
                        rows={2}
                        placeholder="Reason for cancellation"
                        className="mt-3 w-full rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-red-300"
                      />

                      <button
                        type="submit"
                        className="mt-3 rounded-2xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400"
                      >
                        {canDealerCancelDirectly(order.status)
                          ? "Cancel Order"
                          : "Send Cancellation Request"}
                      </button>
                    </form>
                  )}

                  {order.status === "CANCELLATION_REQUESTED" && (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
                      Cancellation request is waiting for internal approval.
                    </div>
                  )}


                  <OrderStatusTimeline history={order.statusHistory} theme="light" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
