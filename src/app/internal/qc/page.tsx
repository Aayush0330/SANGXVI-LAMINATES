import { AccessDeniedCard } from "@/components/access-denied-card";
import { OrderStatusTimeline } from "@/components/order-status-timeline";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderStatusHistoryMap } from "@/lib/order-status-history";
import { approveQcAction } from "./actions";

function getOrderStatusLabel(status: string) {
  if (status === "NEW_ORDER") return "New Order";
  if (status === "STOCK_CHECKED") return "Stock Checked";
  if (status === "STOCK_BLOCKED") return "Stock Blocked";
  if (status === "READY_FOR_DISPATCH") return "Ready for Dispatch";
  if (status === "QC_APPROVED") return "QC Approved";
  if (status === "TRANSPORT_ASSIGNED") return "Transport Assigned";
  if (status === "ON_THE_WAY") return "On The Way";
  if (status === "DELIVERED") return "Delivered";
  if (status === "INVOICE_UPLOADED") return "Invoice Uploaded";
  if (status === "CANCELLED") return "Cancelled";

  return status;
}

function getOrderStatusClass(status: string) {
  if (status === "READY_FOR_DISPATCH") {
    return "bg-blue-300/10 text-blue-300";
  }

  if (status === "QC_APPROVED") {
    return "bg-emerald-300/10 text-emerald-300";
  }

  if (status === "STOCK_BLOCKED") {
    return "bg-purple-300/10 text-purple-300";
  }

  if (status === "DELIVERED") {
    return "bg-emerald-300/10 text-emerald-300";
  }

  if (status === "CANCELLED") {
    return "bg-red-300/10 text-red-300";
  }

  return "bg-yellow-300/10 text-yellow-300";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getQcMessage(error?: string, success?: string) {
  if (success === "qc-approved") {
    return {
      type: "success",
      text: "Order approved by QC successfully.",
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to manage QC.",
    };
  }

  if (error === "missing-order") {
    return {
      type: "error",
      text: "Order id is missing.",
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
      text: "Only orders marked as Ready for Dispatch can be approved by QC.",
    };
  }

  return null;
}

export default async function QcPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getQcMessage(params?.error, params?.success);

  const { hasAccess } = await checkPermission("manage_qc");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="QC Access Denied"
        description="Your current role does not have permission to access the Quality Check module."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: ["STOCK_BLOCKED", "READY_FOR_DISPATCH", "QC_APPROVED"],
      },
    },
    include: {
      dealer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const statusHistoryMap = await getOrderStatusHistoryMap(
    prisma,
    orders.map((order) => order.id)
  );
  const ordersWithHistory = orders.map((order) => ({
    ...order,
    statusHistory: statusHistoryMap.get(order.id) ?? [],
  }));

  const totalQcOrders = ordersWithHistory.length;

  const waitingForQc = ordersWithHistory.filter(
    (order) => order.status === "READY_FOR_DISPATCH"
  ).length;

  const approvedOrders = ordersWithHistory.filter(
    (order) => order.status === "QC_APPROVED"
  ).length;

  const stockBlockedOrders = ordersWithHistory.filter(
    (order) => order.status === "STOCK_BLOCKED"
  ).length;

  const stats = [
    {
      label: "QC Orders",
      value: String(totalQcOrders),
    },
    {
      label: "Waiting for QC",
      value: String(waitingForQc),
    },
    {
      label: "QC Approved",
      value: String(approvedOrders),
    },
    {
      label: "Stock Blocked",
      value: String(stockBlockedOrders),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 sm:text-sm">
            Quality Check
          </p>

          <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl md:text-5xl">
            QC Management
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm sm:leading-6">
            Review orders that are ready for dispatch, verify product details,
            and approve them before transport assignment.
          </p>
        </div>

        <a
          href="/internal/dispatch"
          className="w-full rounded-2xl border border-white/10 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white sm:w-auto"
        >
          Go to Dispatch
        </a>
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
            <h2 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">{stat.value}</h2>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 p-4 sm:p-6">
          <h2 className="text-xl font-bold">QC Order List</h2>

          <p className="mt-2 text-sm text-slate-400">
            Orders appear here after stock is blocked and dispatch marks them as
            ready.
          </p>
        </div>

        {ordersWithHistory.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <h3 className="text-lg font-bold text-white">No QC orders found</h3>
            <p className="mt-2 text-sm text-slate-400">
              Orders will appear here after dispatch starts processing them.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {ordersWithHistory.map((order) => {
              const totalQuantity = order.items.reduce(
                (total, item) => total + item.quantity,
                0
              );

              return (
                <div key={order.id} className="p-4 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-bold text-white">
                          {order.orderNumber}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getOrderStatusClass(
                            order.status
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
                      </p>

                      {order.notes && (
                        <p className="mt-4 max-w-2xl rounded-2xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Items</p>
                        <p className="mt-1 text-lg font-bold text-white">
                          {order.items.length}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Quantity</p>
                        <p className="mt-1 text-lg font-bold text-white">
                          {totalQuantity}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Status</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {getOrderStatusLabel(order.status)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:hidden">
                    {order.items.map((item) => (
                      <article
                        key={`mobile-item-${item.id}`}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-white">
                            {item.product.name}
                          </h4>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.product.code}
                          </p>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
                          <div className="rounded-xl bg-white/[0.04] p-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Stack
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-300">
                              {item.product.stack}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/[0.04] p-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Avail
                            </p>
                            <p className="mt-1 text-xs font-bold text-emerald-300">
                              {item.product.quantity}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/[0.04] p-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Order
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-300">
                              {item.quantity}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/[0.04] p-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Block
                            </p>
                            <p className="mt-1 text-xs font-bold text-cyan-300">
                              {item.blockedQuantity}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-white/10 lg:block">
                    <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[38%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                        <col className="w-[20%]" />
                      </colgroup>

                      <thead className="bg-white/[0.04] text-slate-300">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Product</th>
                          <th className="px-4 py-3 font-semibold">Stack</th>
                          <th className="px-4 py-3 font-semibold">
                            Available
                          </th>
                          <th className="px-4 py-3 font-semibold">Ordered</th>
                          <th className="px-4 py-3 font-semibold">Blocked</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-white/10">
                        {order.items.map((item) => (
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

                            <td className="px-4 py-4">{item.quantity}</td>

                            <td className="px-4 py-4">
                              {item.blockedQuantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <OrderStatusTimeline history={order.statusHistory} />

                  <div className="mt-5 flex flex-wrap gap-3">
                    {order.status === "READY_FOR_DISPATCH" && (
                      <form action={approveQcAction}>
                        <input type="hidden" name="orderId" value={order.id} />

                        <button
                          type="submit"
                          className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-200"
                        >
                          Approve QC
                        </button>
                      </form>
                    )}

                    {order.status === "STOCK_BLOCKED" && (
                      <div className="rounded-2xl border border-purple-300/20 bg-purple-300/10 px-5 py-3 text-sm font-semibold text-purple-300">
                        Waiting for dispatch to mark ready
                      </div>
                    )}

                    {order.status === "QC_APPROVED" && (
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-300">
                        QC already approved
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
