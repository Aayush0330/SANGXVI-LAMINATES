import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  getDarkOrderStatusClass,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";
import {
  approveQcAction,
  requestQcReworkAction,
} from "./actions";
import {
  QcTransportAssignmentForm,
  QC_SCROLL_STORAGE_KEY,
} from "@/components/qc-transport-assignment-form";
import {
  TeamFeedbackToast,
  type TeamFeedbackMessage,
} from "@/components/team-feedback-toast";

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function assignmentLabel(status: string) {
  const labels: Record<string, string> = {
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In Progress",
    READY_FOR_QC: "Ready for QC",
    ISSUE_REPORTED: "Issue Reported",
    QC_REWORK: "QC Rework",
    COMPLETED: "QC Approved",
    CANCELLED: "Cancelled",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function assignmentClass(status: string) {
  if (status === "READY_FOR_QC" || status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "QC_REWORK" || status === "ISSUE_REPORTED") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-amber-50 text-amber-700";
}

function getMessage(
  error?: string,
  success?: string,
): TeamFeedbackMessage | null {
  const successMessages: Record<string, TeamFeedbackMessage> = {
    "qc-approved": {
      type: "success",
      title: "QC approved",
      text: "The complete order is approved. Transport and driver can now be assigned.",
    },
    "rework-requested": {
      type: "success",
      title: "Rework requested",
      text: "The responsible Physical Team has received the QC rework request.",
    },
    "transport-assigned": {
      type: "success",
      title: "Delivery assigned",
      text: "Transport and driver were assigned successfully. The delivery is now visible in the field portal.",
    },
  };
  const errorMessages: Record<string, TeamFeedbackMessage> = {
    "permission-denied": { type: "error", title: "Permission denied", text: "You do not have permission to manage QC." },
    "missing-order": { type: "error", title: "Order missing", text: "Order id is missing." },
    "order-not-found": { type: "error", title: "Order not found", text: "Selected order was not found." },
    "invalid-status": { type: "error", title: "Action unavailable", text: "This order is not ready for QC approval." },
    "physical-checks-incomplete": { type: "error", title: "Physical checks incomplete", text: "All Physical Team assignments must be Ready for QC before approval." },
    "full-quantity-required": { type: "error", title: "Complete quantity required", text: "QC and driver assignment remain unavailable until every item is fully reserved and physically verified for its complete ordered quantity." },
    "missing-assignment": { type: "error", title: "Assignment missing", text: "Physical assignment id is missing." },
    "assignment-not-found": { type: "error", title: "Assignment not found", text: "Selected physical assignment was not found." },
    "rework-note-required": { type: "error", title: "Rework note required", text: "Add a clear QC rework note before sending it back." },
    "invalid-rework-status": { type: "error", title: "Rework unavailable", text: "Only a team assignment currently Ready for QC can be returned for rework." },
    "missing-driver": { type: "error", title: "Driver required", text: "Select a driver." },
    "missing-transport": { type: "error", title: "Transport required", text: "Select a transport option." },
    "driver-not-found": { type: "error", title: "Driver unavailable", text: "Selected driver is inactive or does not have Driver / Transport access." },
    "transport-not-found": { type: "error", title: "Transport unavailable", text: "Selected transport option is disabled or missing." },
    "transport-status-invalid": { type: "error", title: "Assignment unavailable", text: "QC must approve the order before transport assignment." },
  };

  return (success && successMessages[success]) ||
    (error && errorMessages[error]) ||
    null;
}

export default async function QcPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const { hasAccess } = await checkPermission("manage_qc", "/internal/qc");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="QC Access Denied"
        description="Your account does not have permission to manage Quality Check and transport assignment."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [orders, drivers, transportOptions] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: {
          in: ["PENDING_QC", "QC_REWORK", "QC_APPROVED", "TRANSPORT_ASSIGNED"],
        },
      },
      include: {
        dealer: { select: { name: true, email: true, phone: true } },
        assignedDriver: { select: { name: true, phone: true } },
        transportOption: true,
        items: {
          include: {
            product: { include: { category: true, brand: true } },
            physicalAssignmentItem: {
              include: {
                assignment: { include: { team: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        physicalAssignments: {
          include: {
            team: true,
            items: {
              include: {
                orderItem: {
                  include: {
                    product: { include: { category: true, brand: true } },
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
      },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { role: "DRIVER_TRANSPORT" },
          { roleAssignments: { some: { role: "DRIVER_TRANSPORT" } } },
        ],
      },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.transportOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const waiting = orders.filter((order) => order.status === "PENDING_QC").length;
  const rework = orders.filter((order) => order.status === "QC_REWORK").length;
  const approved = orders.filter((order) => order.status === "QC_APPROVED").length;
  const assigned = orders.filter(
    (order) => order.status === "TRANSPORT_ASSIGNED",
  ).length;

  return (
    <div className="space-y-7">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-600">
              Quality Check Team
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              QC & Transport Assignment
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Approve physically checked products, send only the responsible team back for rework, and assign transport and driver after QC approval. No extra dispatch team is used after QC.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/internal/dispatch"
              className="rounded-2xl border border-emerald-200 px-5 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-50"
            >
              Physical Check Queue
            </Link>
            <Link
              href="/internal/transport"
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700"
            >
              Transport Options
            </Link>
          </div>
        </div>
      </section>

      <TeamFeedbackToast
        message={message}
        restoreScrollKey={QC_SCROLL_STORAGE_KEY}
      />

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Waiting for QC", waiting],
          ["QC Rework", rework],
          ["QC Approved", approved],
          ["Transport Assigned", assigned],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-5">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-xl font-black text-slate-950">No QC work</h2>
            <p className="mt-2 text-sm text-slate-500">
              Orders appear after all assigned Physical Dispatch Teams complete their checks.
            </p>
          </div>
        ) : (
          orders.map((order) => {
            const allReady =
              order.physicalAssignments.length > 0 &&
              order.physicalAssignments.every(
                (assignment) => assignment.status === "READY_FOR_QC",
              );

            return (
              <article
                key={order.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60"
              >
                <div className="border-b border-slate-200 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-black text-slate-950">
                          {order.orderNumber}
                        </h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getDarkOrderStatusClass(
                            order.status,
                          )}`}
                        >
                          {getOrderStatusLabel(order.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        Dealer: <strong className="text-slate-800">{order.dealer.name}</strong> · {order.dealer.email}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Updated {formatDateTime(order.updatedAt)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Products</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{order.items.length}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Physical Teams</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{order.physicalAssignments.length}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Ready</p>
                        <p className="mt-1 text-xl font-black text-slate-950">
                          {order.physicalAssignments.filter((row) =>
                            ["READY_FOR_QC", "COMPLETED"].includes(row.status),
                          ).length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="grid gap-4">
                    {order.physicalAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black text-slate-950">{assignment.team.name}</h3>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-black ${assignmentClass(
                                  assignment.status,
                                )}`}
                              >
                                {assignmentLabel(assignment.status)}
                              </span>
                            </div>
                            {assignment.issueNotes ? (
                              <p className="mt-2 text-sm font-bold text-rose-700">
                                Issue: {assignment.issueNotes}
                              </p>
                            ) : null}
                            {assignment.qcNotes ? (
                              <p className="mt-2 text-sm font-bold text-rose-700">
                                QC Note: {assignment.qcNotes}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            Completed {formatDateTime(assignment.completedAt)}
                          </p>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {assignment.items.map((item) => (
                            <div key={item.id} className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                {item.orderItem.product.code} · {item.orderItem.product.brand.name}
                              </p>
                              <p className="mt-2 font-black text-slate-950">
                                {item.orderItem.product.name}
                              </p>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-slate-500">Assigned</p>
                                  <p className="mt-1 font-black text-slate-800">{item.assignedQuantity}</p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Verified</p>
                                  <p className="mt-1 font-black text-emerald-700">{item.verifiedQuantity ?? 0}</p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Damaged</p>
                                  <p className="mt-1 font-black text-rose-700">{item.damagedQuantity}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {order.status === "PENDING_QC" && assignment.status === "READY_FOR_QC" ? (
                          <form action={requestQcReworkAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <label>
                              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                Rework Note
                              </span>
                              <input
                                name="qcNotes"
                                placeholder="Explain exactly what this team must correct"
                                className="mt-2 h-12 w-full rounded-2xl border border-rose-200 px-4 text-sm outline-none focus:border-rose-500"
                              />
                            </label>
                            <button className="h-12 rounded-2xl border border-rose-300 px-5 text-sm font-black text-rose-700 hover:bg-rose-50">
                              Send This Team for Rework
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {order.status === "PENDING_QC" ? (
                    <form action={approveQcAction} className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <input type="hidden" name="orderId" value={order.id} />
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                        <label>
                          <span className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">
                            QC Approval Note
                          </span>
                          <input
                            name="qcNotes"
                            placeholder="Optional final QC note"
                            className="mt-2 h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-sm"
                          />
                        </label>
                        <button
                          disabled={!allReady}
                          className="h-12 rounded-2xl bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          Approve Complete Order
                        </button>
                      </div>
                      {!allReady ? (
                        <p className="mt-3 text-xs font-bold text-rose-700">
                          Every physical assignment must be Ready for QC before approval.
                        </p>
                      ) : null}
                    </form>
                  ) : null}

                  {order.status === "QC_REWORK" ? (
                    <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
                      This order is waiting for the rejected Physical Dispatch Team to complete rework.
                    </div>
                  ) : null}

                  {order.status === "QC_APPROVED" ? (
                    <QcTransportAssignmentForm
                      orderId={order.id}
                      drivers={drivers}
                      transportOptions={transportOptions}
                    />
                  ) : null}

                  {order.status === "TRANSPORT_ASSIGNED" ? (
                    <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                      <h3 className="font-black text-blue-900">Delivery Assigned</h3>
                      <p className="mt-2 text-sm text-blue-800">
                        Transport: <strong>{order.transportOption?.name || order.transportLabel || "—"}</strong> · Driver: <strong>{order.assignedDriver?.name || "—"}</strong>
                      </p>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
