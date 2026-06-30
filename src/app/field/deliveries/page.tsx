import { AccessDeniedCard } from "@/components/access-denied-card";
import { OrderStatusTimeline } from "@/components/order-status-timeline";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderStatusHistoryMap } from "@/lib/order-status-history";
import {
  getDarkOrderStatusClass,
  getItemFulfillmentSummary,
  getOrderFulfillmentSummary,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";
import {
  markDeliveredAction,
  markOnTheWayAction,
  uploadSignedInvoiceProofAction,
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function getDeliveryMessage(error?: string, success?: string) {
  if (success === "on-the-way") {
    return {
      type: "success",
      text: "Delivery marked as On The Way.",
    };
  }

  if (success === "delivered") {
    return {
      type: "success",
      text: "Order marked as Delivered successfully.",
    };
  }

  if (success === "partially-delivered") {
    return {
      type: "success",
      text: "Blocked quantity delivered. Remaining quantity is now pending for the next fulfilment cycle.",
    };
  }

  if (success === "proof-uploaded") {
    return {
      type: "success",
      text: "Signed duplicate invoice proof uploaded successfully.",
    };
  }

  if (error === "permission-denied") {
    return {
      type: "error",
      text: "You do not have permission to update delivery status.",
    };
  }

  if (error === "missing-order") {
    return {
      type: "error",
      text: "Order id is missing.",
    };
  }

  if (error === "driver-not-found") {
    return {
      type: "error",
      text: "Driver account was not found in the database.",
    };
  }

  if (error === "order-not-found") {
    return {
      type: "error",
      text: "Selected order was not found in the database.",
    };
  }

  if (error === "not-your-delivery") {
    return {
      type: "error",
      text: "This delivery is not assigned to your account.",
    };
  }

  if (error === "invalid-status") {
    return {
      type: "error",
      text: "This action is not allowed for the current delivery status.",
    };
  }

  if (error === "missing-proof") {
    return {
      type: "error",
      text: "Please upload the signed duplicate invoice photo or PDF.",
    };
  }

  if (error === "invalid-proof-type") {
    return {
      type: "error",
      text: "Only JPG, PNG, WebP, or PDF proof files are allowed.",
    };
  }

  if (error === "proof-too-large") {
    return {
      type: "error",
      text: "Proof file is too large. Please upload a file up to 3MB.",
    };
  }

  if (error === "invalid-proof-content") {
    return {
      type: "error",
      text: "The uploaded file content does not match its file type.",
    };
  }

  if (error === "proof-note-too-long") {
    return {
      type: "error",
      text: "Proof note must be 500 characters or less.",
    };
  }

  if (error === "proof-not-allowed") {
    return {
      type: "error",
      text: "Signed invoice proof can be uploaded only after delivery is completed.",
    };
  }

  return null;
}

export default async function FieldDeliveriesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getDeliveryMessage(params?.error, params?.success);

  const { currentUser, hasAccess } = await checkPermission(
    "view_assigned_deliveries"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Delivery Access Denied"
        description="Your current role does not have permission to view assigned deliveries."
        backHref="/field/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const driver = await prisma.user.findUnique({
    where: {
      email: currentUser.email,
    },
  });

  if (!driver) {
    return (
      <AccessDeniedCard
        title="Driver Account Not Found"
        description="Your driver account was not found in the database."
        backHref="/field/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const orders = await prisma.order.findMany({
    where: {
      assignedDriverId: driver.id,
      status: {
        in: ["TRANSPORT_ASSIGNED", "ON_THE_WAY", "PARTIALLY_DELIVERED", "DELIVERED", "INVOICE_UPLOADED"],
      },
    },
    include: {
      dealer: true,
      assignedDriver: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const orderIds = orders.map((order) => order.id);

  const statusHistoryMap = await getOrderStatusHistoryMap(
    prisma,
    orderIds
  );

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
      label: "Total Deliveries",
      value: String(ordersWithHistory.length),
    },
    {
      label: "Assigned",
      value: String(
        ordersWithHistory.filter((order) => order.status === "TRANSPORT_ASSIGNED")
          .length
      ),
    },
    {
      label: "On The Way",
      value: String(
        ordersWithHistory.filter((order) => order.status === "ON_THE_WAY").length
      ),
    },
    {
      label: "Delivered",
      value: String(
        ordersWithHistory.filter((order) => ["DELIVERED", "INVOICE_UPLOADED"].includes(order.status)).length
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 sm:text-sm">
            Field Portal
          </p>

          <h1 className="mt-2 text-2xl font-bold text-white sm:mt-3 sm:text-3xl md:text-5xl">
            My Deliveries
          </h1>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-300 sm:mt-4 sm:text-sm sm:leading-6">
            Deliver the currently blocked quantity. Remaining quantity will stay
            pending for the next dispatch cycle.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200">
          Driver: <span className="text-white">{driver.name}</span>
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
            <h2 className="mt-2 text-2xl font-bold text-white sm:mt-3 sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-white">
            Assigned Delivery Orders
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            This list shows only orders assigned to your driver account.
          </p>
        </div>

        {ordersWithHistory.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <h3 className="text-lg font-bold text-white">
              No deliveries assigned
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              Assigned delivery orders will appear here after dispatch assigns
              transport.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {ordersWithHistory.map((order) => {
              const summary = getOrderFulfillmentSummary(order.items);

              return (
                <div key={order.id} className="p-4 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-bold text-white">
                          {order.orderNumber}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getDarkOrderStatusClass(
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
                        Assigned to {order.assignedDriver?.name || driver.name}
                        {order.transportLabel ? ` · Transport: ${order.transportLabel}` : ""}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Order date: {formatDate(order.createdAt)}
                      </p>

                      {order.notes && (
                        <p className="mt-4 max-w-2xl rounded-2xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">Requested</p>
                        <p className="mt-1 text-lg font-bold text-white">
                          {summary.requested}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">To Deliver</p>
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
                        <p className="text-xs text-slate-500">Pending</p>
                        <p className="mt-1 text-lg font-bold text-yellow-300">
                          {summary.pending}
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

                          <div className="mt-4 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
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
                                Deliver
                              </p>
                              <p className="mt-1 text-xs font-bold text-cyan-300">
                                {itemSummary.blocked}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white/[0.04] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Done
                              </p>
                              <p className="mt-1 text-xs font-bold text-emerald-300">
                                {itemSummary.delivered}
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
                    <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[36%]" />
                        <col className="w-[12%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                      </colgroup>

                      <thead className="bg-white/[0.04] text-slate-300">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Product</th>
                          <th className="px-4 py-3 font-semibold">Stack</th>
                          <th className="px-4 py-3 font-semibold">
                            Requested
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            To Deliver
                          </th>
                          <th className="px-4 py-3 font-semibold">
                            Delivered
                          </th>
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
                                {itemSummary.requested}
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


                  {(order.deliveryProofs.length > 0 || ["PARTIALLY_DELIVERED", "DELIVERED", "INVOICE_UPLOADED"].includes(order.status)) && (
                    <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-cyan-200">
                            Signed Duplicate Invoice Proof
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            Upload the signed duplicate invoice after delivery. Image or PDF up to 3MB.
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.signedInvoiceStatus === "UPLOADED" ? "bg-emerald-300/10 text-emerald-300" : "bg-yellow-300/10 text-yellow-300"}`}>
                          {order.signedInvoiceStatus === "UPLOADED" ? "Uploaded" : "Pending"}
                        </span>
                      </div>

                      {order.deliveryProofs.length > 0 && (
                        <div className="mt-4 grid gap-3">
                          {order.deliveryProofs.map((proof) => (
                            <div key={proof.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-bold text-white">{proof.fileName}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Uploaded by {proof.uploadedByName || "Driver"} · {formatDate(new Date(proof.uploadedAt))}
                                  </p>
                                  {proof.note && <p className="mt-2 text-xs leading-5 text-slate-300">{proof.note}</p>}
                                </div>
                                <a href={`/field/deliveries/proof/${proof.id}`} target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-300/30 px-4 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-300 hover:text-slate-950">
                                  View Proof
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {["PARTIALLY_DELIVERED", "DELIVERED", "INVOICE_UPLOADED"].includes(order.status) && (
                        <form action={uploadSignedInvoiceProofAction} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                          <input type="hidden" name="orderId" value={order.id} />

                          <label className="block">
                            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Proof File</span>
                            <input name="signedInvoice" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-950" required />
                          </label>

                          <label className="block">
                            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Note</span>
                            <input name="note" placeholder="Signed by dealer / receiver" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm text-white outline-none transition focus:border-cyan-300" />
                          </label>

                          <button type="submit" className="h-12 rounded-2xl bg-cyan-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
                            Upload Proof
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  <OrderStatusTimeline history={order.statusHistory} />

                  <div className="mt-5 flex flex-wrap gap-3">
                    {order.status === "TRANSPORT_ASSIGNED" && (
                      <form action={markOnTheWayAction}>
                        <input type="hidden" name="orderId" value={order.id} />

                        <button
                          type="submit"
                          className="rounded-2xl bg-orange-400 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-300"
                        >
                          Mark On The Way
                        </button>
                      </form>
                    )}

                    {order.status === "ON_THE_WAY" && (
                      <form action={markDeliveredAction}>
                        <input type="hidden" name="orderId" value={order.id} />

                        <button
                          type="submit"
                          className="rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-200"
                        >
                          Mark Delivered
                        </button>
                      </form>
                    )}

                    {["DELIVERED", "INVOICE_UPLOADED"].includes(order.status) && (
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-300">
                        Delivery completed successfully.
                      </div>
                    )}

                    {order.status === "PARTIALLY_DELIVERED" && (
                      <div className="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-5 py-3 text-sm font-semibold text-teal-300">
                        Partial delivery completed. Upload signed duplicate invoice proof for delivered quantity.
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
