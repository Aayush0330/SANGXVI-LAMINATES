import { AccessDeniedCard } from "@/components/access-denied-card";
import { OrderStatusTimeline } from "@/components/order-status-timeline";
import {
  DriverProofOptions,
  DRIVER_DELIVERY_SCROLL_KEY,
  MarkDeliveredForm,
  MarkOnTheWayForm,
} from "@/components/driver-delivery-actions";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getOrderStatusHistoryMap } from "@/lib/order-status-history";
import {
  getDarkOrderStatusClass,
  getItemFulfillmentSummary,
  getOrderFulfillmentSummary,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";


type DeliveryProofRow = {
  id: string;
  orderId: string;
  uploadedByName: string | null;
  proofType: string;
  uploadMode: string;
  deliveredByName: string | null;
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

function getDeliveryMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "on-the-way": {
      type: "success",
      title: "Delivery started",
      text: "The order is now marked as On The Way.",
    },
    delivered: {
      type: "success",
      title: "Delivery completed",
      text: "Now upload proof yourself or ask your manager for help.",
    },
    "proof-uploaded": {
      type: "success",
      title: "Delivery proof uploaded",
      text: "The signed proof and uploader details were saved successfully.",
    },
    "proof-help-requested": {
      type: "success",
      title: "Manager request sent",
      text: "Your manager can now upload the delivery proof on your behalf.",
    },
    "proof-help-cancelled": {
      type: "success",
      title: "Manager request cancelled",
      text: "The assistance request was closed. You can upload the proof yourself when ready.",
    },
  };

  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission to update delivery status.",
    "missing-order": "The order reference is missing.",
    "driver-not-found": "Your driver account was not found.",
    "order-not-found": "The selected order was not found.",
    "not-your-delivery": "This delivery is not assigned to your account.",
    "invalid-status": "This action is not allowed for the current delivery status.",
    "complete-quantity-required":
      "The complete ordered quantity must be reserved and ready before delivery can be completed.",
    "missing-proof": "Choose a signed delivery proof photo or PDF.",
    "invalid-proof-type": "Only JPG, PNG, WebP, or PDF files are allowed.",
    "proof-too-large": "The proof file must be 3MB or smaller.",
    "invalid-proof-content": "The selected file content does not match its file type.",
    "proof-note-too-long": "The note must be 500 characters or less.",
    "proof-not-allowed": "Proof can be added only after delivery is completed.",
    "proof-already-uploaded": "Delivery proof is already uploaded for this order.",
    "proof-help-already-requested": "A manager assistance request is already pending for this order.",
    "proof-help-not-requested": "There is no pending manager assistance request to cancel.",
  };

  if (success && successMessages[success]) {
    return successMessages[success];
  }

  if (error && errorMessages[error]) {
    return {
      type: "error",
      title: "Delivery action failed",
      text: errorMessages[error],
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
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
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
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const orders = await prisma.order.findMany({
    where: {
      assignedDriverId: driver.id,
      status: {
        in: ["TRANSPORT_ASSIGNED", "ON_THE_WAY", "DELIVERED", "INVOICE_UPLOADED"],
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
              dp."uploadMode",
              dp."deliveredByName",
              dp."fileName",
              dp."mimeType",
              dp."note",
              dp."uploadedAt"
            FROM public."DeliveryProof" dp
            LEFT JOIN public."User" uploader ON uploader."id" = dp."uploadedById"
            WHERE dp."orderId" IN (${orderIds.map((_, index) => `$${index + 1}`).join(", ")})
              AND dp."isActive" = TRUE
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600 sm:text-sm">
            Field Portal
          </p>

          <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:mt-3 sm:text-3xl md:text-5xl">
            My Deliveries
          </h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700">
          Driver: <span className="text-slate-950">{driver.name}</span>
        </div>
      </div>

      <TeamFeedbackToast
        message={message}
        restoreScrollKey={DRIVER_DELIVERY_SCROLL_KEY}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-2xl sm:p-6"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:mt-3 sm:text-3xl">
              {stat.value}
            </h2>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-slate-950">
            Assigned Delivery Orders
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            This list shows only orders assigned to your driver account.
          </p>
        </div>

        {ordersWithHistory.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <h3 className="text-lg font-bold text-slate-950">
              No deliveries assigned
            </h3>

          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ordersWithHistory.map((order) => {
              const summary = getOrderFulfillmentSummary(order.items);

              return (
                <div key={order.id} className="p-4 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-xl font-bold text-slate-950">
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

                      <p className="mt-2 text-sm text-slate-500">
                        Dealer:{" "}
                        <span className="font-semibold text-slate-700">
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
                        <p className="mt-4 max-w-2xl rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                          {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs text-slate-500">Ordered</p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {summary.requested}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs text-slate-500">To Deliver</p>
                        <p className="mt-1 text-lg font-bold text-blue-600">
                          {summary.blocked}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs text-slate-500">Delivered</p>
                        <p className="mt-1 text-lg font-bold text-emerald-700">
                          {summary.delivered}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs text-slate-500">Product Lines</p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {order.items.length}
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
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-slate-950">
                              {item.product.name}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.product.code} · {item.product.stack}
                            </p>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
                            <div className="rounded-xl bg-white p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Dealer Req
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-600">
                                {itemSummary.requested}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Deliver
                              </p>
                              <p className="mt-1 text-xs font-bold text-blue-600">
                                {itemSummary.blocked}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                Done
                              </p>
                              <p className="mt-1 text-xs font-bold text-emerald-700">
                                {itemSummary.delivered}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                State
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-700">
                                {itemSummary.isFullyDelivered
                                  ? "Delivered"
                                  : itemSummary.isFullyReserved
                                    ? "Ready"
                                    : "Blocked"}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
                    <table className="w-full min-w-[660px] table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[40%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                      </colgroup>

                      <thead className="bg-white text-slate-600">
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
                                {itemSummary.blocked}
                              </td>

                              <td className="px-4 py-4">
                                {itemSummary.delivered}
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>


                  {(order.deliveryProofs.length > 0 || ["DELIVERED", "INVOICE_UPLOADED"].includes(order.status)) && (
                    <div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/70 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-base font-black text-slate-950 dark:text-white">
                            Delivery Proof
                          </h4>
                          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-300">
                            Upload it yourself, or ask your manager to upload it for you.
                          </p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${order.signedInvoiceStatus === "UPLOADED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-1 dark:ring-emerald-400/20" : order.deliveryProofAssistanceStatus === "REQUESTED" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-1 dark:ring-violet-400/20" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-1 dark:ring-amber-400/20"}`}>
                          {order.signedInvoiceStatus === "UPLOADED"
                            ? "Proof Uploaded"
                            : order.deliveryProofAssistanceStatus === "REQUESTED"
                              ? "Manager Help Requested"
                              : "Proof Pending"}
                        </span>
                      </div>

                      {order.deliveryProofs.length > 0 ? (
                        <div className="mt-4 grid gap-3">
                          {order.deliveryProofs.map((proof) => (
                            <div key={proof.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/70">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-black text-slate-950 dark:text-white">{proof.fileName}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Delivered by {proof.deliveredByName || order.deliveredByName || order.assignedDriver?.name || driver.name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Uploaded by {proof.uploadedByName || "Driver"} · {proof.uploadMode === "MANAGER_ASSISTED" ? "Manager Assisted" : "Driver Self Upload"} · {formatDate(new Date(proof.uploadedAt))}
                                  </p>
                                  {proof.note ? <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{proof.note}</p> : null}
                                </div>
                                <a href={`/field/deliveries/proof/${proof.id}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl border border-blue-200 px-4 text-xs font-black text-blue-600 transition hover:bg-blue-600 hover:text-white dark:border-blue-400/30 dark:text-blue-300 dark:hover:bg-blue-500 dark:hover:text-white">
                                  View Proof
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <DriverProofOptions
                          orderId={order.id}
                          assistanceRequested={order.deliveryProofAssistanceStatus === "REQUESTED"}
                        />
                      )}
                    </div>
                  )}

                  <OrderStatusTimeline history={order.statusHistory} />

                  <div className="mt-5 flex flex-wrap gap-3">
                    {order.status === "TRANSPORT_ASSIGNED" ? (
                      <MarkOnTheWayForm orderId={order.id} />
                    ) : null}

                    {order.status === "ON_THE_WAY" ? (
                      <MarkDeliveredForm orderId={order.id} />
                    ) : null}

                    {["DELIVERED", "INVOICE_UPLOADED"].includes(order.status) && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
                        Delivery completed successfully.
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
