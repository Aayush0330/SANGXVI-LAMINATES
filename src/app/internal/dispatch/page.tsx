import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  getDarkOrderStatusClass,
  getOrderStatusLabel,
} from "@/lib/order-fulfillment";
import { hasAnyRole } from "@/lib/permissions";
import {
  approveCancellationRequestAction,
  rejectCancellationRequestAction,
  completePhysicalCheckAction,
  resolvePhysicalBlockerAction,
  startPhysicalCheckAction,
} from "./actions";

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function getAssignmentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ASSIGNED: "Assigned",
    IN_PROGRESS: "Check in Progress",
    READY_FOR_QC: "Ready for QC",
    ISSUE_REPORTED: "Issue Reported",
    QC_REWORK: "QC Rework",
    COMPLETED: "QC Completed",
    CANCELLED: "Cancelled",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function getAssignmentStatusClass(status: string) {
  if (status === "READY_FOR_QC" || status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "ISSUE_REPORTED" || status === "QC_REWORK") {
    return "bg-rose-50 text-rose-700";
  }
  if (status === "IN_PROGRESS") {
    return "bg-blue-50 text-blue-700";
  }
  return "bg-amber-50 text-amber-700";
}

function getMessage(error?: string, success?: string) {
  const successMessages: Record<string, string> = {
    "check-started": "Physical check started successfully.",
    "check-completed":
      "Physical check completed. If all assigned teams are done, the order has moved to QC.",
    "issue-reported":
      "Issue reported as a blocker. Order Receiving and management have been notified.",
    "blocker-resolved": "Blocker resolved. The Physical Team must restart the full verification.",
    "cancellation-approved": "Cancellation approved and reserved stock released.",
    "cancellation-rejected": "Cancellation rejected and the exact previous workflow status restored.",
  };
  const errorMessages: Record<string, string> = {
    "permission-denied": "You do not have permission for this physical check.",
    "missing-assignment": "Assignment id is missing.",
    "assignment-not-found":
      "Assignment was not found or it is not assigned to your team.",
    "invalid-assignment-status":
      "This action is not available for the current assignment status.",
    "invalid-check-quantity":
      "Check every quantity. Verified and damaged quantities must be valid whole numbers.",
    "stock-changed":
      "Full stock is unavailable. The item is blocked and QC/driver assignment remain unavailable.",
    "full-stock-required":
      "The complete ordered quantity is still unavailable. Add full stock before resolving the blocker.",
    "resolution-note-required": "A blocker resolution note is required.",
    "missing-order": "Order id is missing.",
    "order-not-found": "Order was not found.",
    "invalid-status": "This action is not allowed for the current order status.",
    "cancellation-approval-note-too-long": "The approval note must be 1,000 characters or fewer.",
    "cancellation-rejection-reason-required": "Enter a rejection reason before rejecting the cancellation request.",
    "cancellation-previous-status-missing": "The exact previous workflow status is missing. Review Order Details and status history before continuing.",
  };

  if (success && successMessages[success]) {
    return { type: "success" as const, text: successMessages[success] };
  }
  if (error && errorMessages[error]) {
    return { type: "error" as const, text: errorMessages[error] };
  }
  return null;
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const { currentUser, hasAccess } = await checkPermission(
    "manage_dispatch",
    "/internal/dispatch",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Physical Dispatch Access Denied"
        description="Only Physical Dispatch Team members and authorized management can access this work queue."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const isManagement = hasAnyRole(currentUser.roles, ["owner", "manager"]);
  const assignments = await prisma.orderPhysicalAssignment.findMany({
    where: {
      status: { notIn: ["CANCELLED"] },
      ...(isManagement
        ? {}
        : { team: { members: { some: { userId: currentUser.id } } } }),
    },
    include: {
      team: {
        include: {
          members: {
            where: { user: { status: "ACTIVE" } },
            include: { user: { select: { name: true, email: true } } },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          },
        },
      },
      order: {
        include: {
          dealer: { select: { name: true, email: true, phone: true } },
          physicalAssignments: { select: { id: true, status: true } },
        },
      },
      items: {
        include: {
          orderItem: {
            include: {
              product: {
                include: { category: true, brand: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ assignedAt: "asc" }],
  });

  const cancellationOrders = isManagement
    ? await prisma.order.findMany({
        where: { status: "CANCELLATION_REQUESTED" },
        include: {
          dealer: { select: { name: true } },
          items: { include: { product: true } },
        },
        orderBy: { updatedAt: "asc" },
      })
    : [];

  const counts = {
    assigned: assignments.filter((row) => row.status === "ASSIGNED").length,
    inProgress: assignments.filter((row) => row.status === "IN_PROGRESS").length,
    issues: assignments.filter((row) =>
      ["ISSUE_REPORTED", "QC_REWORK"].includes(row.status),
    ).length,
    ready: assignments.filter((row) =>
      ["READY_FOR_QC", "COMPLETED"].includes(row.status),
    ).length,
  };

  return (
    <div className="space-y-7">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-violet-600">
              Physical Dispatch Teams
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              Physical Product Checks
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
              Check only the products assigned to your team. Confirm quantity and condition, report blockers, and send fully verified work to QC.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isManagement ? (
              <Link
                href="/internal/order-receiving"
                className="rounded-2xl border border-violet-200 px-5 py-3 text-sm font-black text-violet-700 hover:bg-violet-50"
              >
                Order Assignments
              </Link>
            ) : null}
            <Link
              href="/internal/qc"
              className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700"
            >
              Open QC
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl border px-5 py-4 text-sm font-bold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["New Assignments", counts.assigned],
          ["In Progress", counts.inProgress],
          ["Blockers / Rework", counts.issues],
          ["Ready / Completed", counts.ready],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {cancellationOrders.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-lg font-black text-rose-900">Cancellation Requests</h2>
          <div className="mt-4 grid gap-3">
            {cancellationOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-black text-slate-950">{order.orderNumber}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.dealer.name} · {order.items.length} product line(s)
                  </p>
                  <p className="mt-2 text-xs font-bold text-rose-700">
                    Resume status on rejection: {order.cancellationPreviousStatus ? getOrderStatusLabel(order.cancellationPreviousStatus) : "Missing — review required"}
                  </p>
                  {order.cancellationRequestReason ? (
                    <p className="mt-2 text-sm text-slate-600">Reason: {order.cancellationRequestReason}</p>
                  ) : null}
                </div>
                <div className="grid w-full gap-3 lg:w-[420px]">
                  <form action={approveCancellationRequestAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input
                      name="approvalNote"
                      maxLength={1000}
                      placeholder="Approval note (optional)"
                      className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                    />
                    <button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700">
                      Approve
                    </button>
                  </form>
                  <form action={rejectCancellationRequestAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input
                      name="rejectionReason"
                      required
                      maxLength={1000}
                      placeholder="Rejection reason (required)"
                      className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                    <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
                      Reject & Resume
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-xl font-black text-slate-950">No physical checks assigned</h2>
            <p className="mt-2 text-sm text-slate-500">
              New assignments will appear after Order Receiving assigns products to a Physical Dispatch Team.
            </p>
          </div>
        ) : (
          assignments.map((assignment) => {
            const canStart = ["ASSIGNED", "QC_REWORK"].includes(
              assignment.status,
            );
            const canComplete = [
              "IN_PROGRESS",
              "ISSUE_REPORTED",
              "QC_REWORK",
            ].includes(assignment.status);

            return (
              <article
                key={assignment.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60"
              >
                <div className="border-b border-slate-200 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-black text-slate-950">
                          {assignment.order.orderNumber}
                        </h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getAssignmentStatusClass(
                            assignment.status,
                          )}`}
                        >
                          {getAssignmentStatusLabel(assignment.status)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${getDarkOrderStatusClass(
                            assignment.order.status,
                          )}`}
                        >
                          {getOrderStatusLabel(assignment.order.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        Team: <strong className="text-slate-800">{assignment.team.name}</strong> · Dealer: {assignment.order.dealer.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Assigned {formatDateTime(assignment.assignedAt)} by {assignment.assignedByName || "System"}
                      </p>
                      {assignment.qcNotes ? (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
                          QC Rework: {assignment.qcNotes}
                        </div>
                      ) : null}
                      {assignment.issueNotes ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                          Current Issue: {assignment.issueType?.replaceAll("_", " ")} — {assignment.issueNotes}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                      <p className="font-black text-slate-950">
                        {assignment.team.members.length} active member(s)
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignment.team.members
                          .slice(0, 4)
                          .map((member) => member.user.name)
                          .join(", ") || "No active members"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  {isManagement && assignment.status === "ISSUE_REPORTED" ? (
                    <form action={resolvePhysicalBlockerAction} className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <p className="text-sm font-black text-amber-900">Resolve stock blocker</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        This action is allowed only after the complete ordered quantity is available. It clears the old check and requires a full verification restart.
                      </p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                        <input
                          name="resolutionNote"
                          maxLength={500}
                          placeholder="Explain how the full stock blocker was resolved"
                          className="h-11 flex-1 rounded-xl border border-amber-200 bg-white px-4 text-sm outline-none"
                          required
                        />
                        <button className="h-11 rounded-xl bg-amber-600 px-5 text-sm font-black text-white hover:bg-amber-700">
                          Resolve and Restart
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {canStart ? (
                    <form action={startPhysicalCheckAction} className="mb-5">
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                      <button className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-700">
                        {assignment.status === "QC_REWORK"
                          ? "Start QC Rework"
                          : "Start Physical Check"}
                      </button>
                    </form>
                  ) : null}

                  <form action={completePhysicalCheckAction}>
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <div className="grid gap-4">
                      {assignment.items.map((item) => {
                        const product = item.orderItem.product;
                        return (
                          <div
                            key={item.id}
                            className="grid gap-4 rounded-2xl border border-slate-200 p-4 xl:grid-cols-[minmax(0,1.5fr)_120px_140px_minmax(180px,1fr)] xl:items-end"
                          >
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                                {product.code} · {product.brand.name} · {product.category.name}
                              </p>
                              <h3 className="mt-2 font-black text-slate-950">{product.name}</h3>
                              <p className="mt-1 text-xs text-slate-500">
                                Assigned: {item.assignedQuantity} {product.unit} · System Available: {product.quantity} · Already Blocked: {item.orderItem.blockedQuantity}
                              </p>
                            </div>
                            <label>
                              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                Verified
                              </span>
                              <input
                                name={`verifiedQuantity__${item.id}`}
                                type="number"
                                min={0}
                                max={item.assignedQuantity}
                                step={1}
                                defaultValue={item.verifiedQuantity ?? item.assignedQuantity}
                                disabled={!canComplete}
                                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none disabled:bg-slate-100"
                                required
                              />
                            </label>
                            <label>
                              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                Damaged
                              </span>
                              <input
                                name={`damagedQuantity__${item.id}`}
                                type="number"
                                min={0}
                                max={item.assignedQuantity}
                                step={1}
                                defaultValue={item.damagedQuantity}
                                disabled={!canComplete}
                                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none disabled:bg-slate-100"
                              />
                            </label>
                            <label>
                              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                Product Note
                              </span>
                              <input
                                name={`notes__${item.id}`}
                                defaultValue={item.notes ?? ""}
                                disabled={!canComplete}
                                placeholder="Optional note"
                                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none disabled:bg-slate-100"
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>

                    {canComplete ? (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <h3 className="font-black text-slate-950">Issue / Blocker (optional)</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Leave this empty only when every assigned product is fully available and physically correct.
                        </p>
                        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr_auto] lg:items-end">
                          <label>
                            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                              Issue Type
                            </span>
                            <select
                              name="issueType"
                              defaultValue=""
                              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold"
                            >
                              <option value="">No issue</option>
                              <option value="SHORT_QUANTITY">Short Quantity</option>
                              <option value="DAMAGED_PRODUCT">Damaged Product</option>
                              <option value="WRONG_PRODUCT">Wrong Product</option>
                              <option value="QUANTITY_MISMATCH">Quantity Mismatch</option>
                              <option value="PRODUCT_UNAVAILABLE">Product Unavailable</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </label>
                          <label>
                            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                              Issue Notes
                            </span>
                            <input
                              name="issueNotes"
                              placeholder="Explain the blocker clearly"
                              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm"
                            />
                          </label>
                          <button className="h-12 rounded-2xl bg-violet-600 px-6 text-sm font-black text-white hover:bg-violet-700">
                            Save Physical Check
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                        This team work is already ready for QC or completed.
                      </div>
                    )}
                  </form>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
