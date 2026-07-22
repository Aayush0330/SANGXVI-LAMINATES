import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderSourceLabel } from "@/lib/dealer-directory";
import {
  getOrderStatusLabel,
  getLightOrderStatusClass,
} from "@/lib/order-fulfillment";
import { getOrderStatusHistoryMap } from "@/lib/order-status-history";

type SearchParams = {
  q?: string;
  status?: string;
  team?: string;
  orderId?: string;
  attention?: string;
};

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function titleCase(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCurrentOwner(status: string, assignments: Array<{ status: string }>) {
  if (status === "NEW_ORDER") return "Order Receiving";
  if (assignments.some((item) => ["ISSUE_REPORTED", "QC_REWORK"].includes(item.status)))
    return "Supervisor / Order Receiving";
  if (
    assignments.some((item) =>
      ["ASSIGNED", "IN_PROGRESS"].includes(item.status),
    )
  )
    return "Physical Team";
  if (status === "PENDING_QC") return "Quality Control";
  if (["TRANSPORT_ASSIGNED", "ON_THE_WAY"].includes(status))
    return "Driver / Transport";
  if (["DELIVERED", "INVOICE_UPLOADED"].includes(status)) return "Completed";
  if (["CANCELLED"].includes(status)) return "Closed";
  return "Operations";
}

function getAttention({
  status,
  lastMovementAt,
  hasProblem,
  now,
}: {
  status: string;
  lastMovementAt: Date;
  hasProblem: boolean;
  now: Date;
}) {
  const closed = ["DELIVERED", "INVOICE_UPLOADED", "CANCELLED"].includes(status);
  if (closed) return { stuck: false, overdue: false, reason: "Completed" };
  const staleHours = (now.getTime() - lastMovementAt.getTime()) / 3_600_000;
  const stuck = hasProblem || staleHours >= 24;
  return {
    stuck,
    overdue: false,
    reason: hasProblem
      ? "Open operational problem"
      : staleHours >= 24
          ? `No movement for ${Math.floor(staleHours)} hours`
          : "Moving normally",
  };
}

export default async function OrderJourneyPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { hasAccess, currentUser } = await checkPermission(
    "view_order_journey",
    "/internal/order-journey",
  );
  const isSupervisor =
    currentUser.roles.includes("owner") ||
    currentUser.roles.includes("manager");

  if (!hasAccess || !isSupervisor) {
    return (
      <AccessDeniedCard
        title="Order Journey Access Denied"
        description="Only the Owner or Manager can access the complete operational order audit."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const params = await searchParams;
  const now = new Date();
  const query = (params?.q ?? "").trim().toLowerCase();
  const selectedStatus = params?.status ?? "ALL";
  const selectedTeam = params?.team ?? "ALL";
  const attentionOnly = params?.attention === "1";

  const [orders, teams] = await Promise.all([
    prisma.order.findMany({
      include: {
        dealer: { select: { name: true, email: true, phone: true } },
        assignedDriver: { select: { name: true, email: true, phone: true } },
        transportOption: { select: { name: true } },
        items: { include: { product: true }, orderBy: { createdAt: "asc" } },
        physicalAssignments: {
          include: {
            team: { select: { id: true, name: true } },
            items: {
              include: { orderItem: { include: { product: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        deliveryProofs: {
          where: { isActive: true },
          select: {
            id: true,
            proofType: true,
            uploadMode: true,
            deliveredByName: true,
            fileName: true,
            note: true,
            uploadedAt: true,
            uploadedBy: { select: { name: true } },
          },
          orderBy: { uploadedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 160,
    }),
    prisma.workTeam.findMany({
      where: { teamType: "PHYSICAL_DISPATCH" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const historyMap = await getOrderStatusHistoryMap(
    prisma,
    orders.map((order) => order.id),
  );

  const enrichedOrders = orders.map((order) => {
    const history = historyMap.get(order.id) ?? [];
    const latestAssignmentUpdate = order.physicalAssignments.reduce(
      (latest, assignment) =>
        assignment.updatedAt > latest ? assignment.updatedAt : latest,
      order.updatedAt,
    );
    const latestHistoryUpdate =
      history.at(-1)?.createdAt ?? order.createdAt;
    const lastMovementAt =
      latestAssignmentUpdate > latestHistoryUpdate
        ? latestAssignmentUpdate
        : latestHistoryUpdate;
    const hasProblem = order.physicalAssignments.some((assignment) =>
      ["ISSUE_REPORTED", "QC_REWORK"].includes(assignment.status),
    );
    return {
      ...order,
      history,
      lastMovementAt,
      attention: getAttention({
        status: order.status,
        lastMovementAt,
        hasProblem,
        now,
      }),
      currentOwner: getCurrentOwner(order.status, order.physicalAssignments),
    };
  });

  const filteredOrders = enrichedOrders.filter((order) => {
    const matchesStatus =
      selectedStatus === "ALL" || order.status === selectedStatus;
    const matchesTeam =
      selectedTeam === "ALL" ||
      order.physicalAssignments.some(
        (assignment) => assignment.teamId === selectedTeam,
      );
    const matchesAttention =
      !attentionOnly || order.attention.stuck || order.attention.overdue;
    const haystack = [
      order.orderNumber,
      order.dealer.name,
      order.dealer.email,
      order.currentOwner,
      getOrderSourceLabel(order.source),
      ...order.items.map((item) => `${item.product.name} ${item.product.code}`),
      ...order.physicalAssignments.map((item) => item.team.name),
    ]
      .join(" ")
      .toLowerCase();
    return (
      matchesStatus &&
      matchesTeam &&
      matchesAttention &&
      (!query || haystack.includes(query))
    );
  });

  const selectedOrder =
    filteredOrders.find((order) => order.id === params?.orderId) ??
    filteredOrders[0] ??
    null;
  const selectedPricing = selectedOrder
    ? selectedOrder.items.reduce(
        (summary, item) => ({
          subtotal: summary.subtotal + Number(item.lineSubtotal),
          tax: summary.tax + Number(item.taxAmount),
          total: summary.total + Number(item.lineTotal),
        }),
        { subtotal: 0, tax: 0, total: 0 },
      )
    : null;
  const attentionCount = enrichedOrders.filter(
    (order) => order.attention.stuck || order.attention.overdue,
  ).length;
  const activeCount = enrichedOrders.filter(
    (order) =>
      !["DELIVERED", "INVOICE_UPLOADED", "CANCELLED"].includes(order.status),
  ).length;
  const exportHref = `/internal/order-journey/export?q=${encodeURIComponent(params?.q ?? "")}&status=${encodeURIComponent(selectedStatus)}&team=${encodeURIComponent(selectedTeam)}&attention=${attentionOnly ? "1" : "0"}`;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">
              Supervisor Audit
            </p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">Order Journey</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              One operational record showing the responsible stage, movement time,
              problems, decisions, QC, transport, delivery and evidence.
            </p>
          </div>
          <Link
            href={exportHref}
            className="w-fit rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
          >
            Export Audit CSV
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Orders tracked", enrichedOrders.length],
            ["Active workflow", activeCount],
            ["Need attention", attentionCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <form className="grid gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(220px,1fr)_200px_220px_auto_auto]">
        <input
          name="q"
          defaultValue={params?.q}
          placeholder="Search order, dealer, product or team..."
          className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <select name="status" defaultValue={selectedStatus} className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
          <option value="ALL">All statuses</option>
          {[...new Set(enrichedOrders.map((order) => order.status))].map((status) => (
            <option key={status} value={status}>{getOrderStatusLabel(status)}</option>
          ))}
        </select>
        <select name="team" defaultValue={selectedTeam} className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
          <option value="ALL">All physical teams</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">
          <input type="checkbox" name="attention" value="1" defaultChecked={attentionOnly} />
          Attention only
        </label>
        <button className="h-12 rounded-xl bg-blue-600 px-5 text-sm font-black text-white">Apply</button>
      </form>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="max-h-[72rem] space-y-3 overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-white p-3">
          {filteredOrders.length === 0 ? (
            <p className="p-8 text-center text-sm font-semibold text-slate-500">No matching orders found.</p>
          ) : filteredOrders.map((order) => (
            <Link
              key={order.id}
              href={`/internal/order-journey?orderId=${order.id}&q=${encodeURIComponent(params?.q ?? "")}&status=${selectedStatus}&team=${selectedTeam}${attentionOnly ? "&attention=1" : ""}`}
              className={`block rounded-2xl border p-4 transition ${
                selectedOrder?.id === order.id
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 hover:border-blue-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{order.orderNumber}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{order.dealer.name}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">{getOrderSourceLabel(order.source)}</p>
                </div>
                {(order.attention.stuck || order.attention.overdue) ? (
                  <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">ATTENTION</span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${getLightOrderStatusClass(order.status)}`}>
                  {getOrderStatusLabel(order.status)}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                  {order.currentOwner}
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Last movement {formatDuration(now.getTime() - order.lastMovementAt.getTime())} ago
              </p>
            </Link>
          ))}
        </div>

        {selectedOrder ? (
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">{selectedOrder.orderNumber}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${getLightOrderStatusClass(selectedOrder.status)}`}>{getOrderStatusLabel(selectedOrder.status)}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-slate-950">{selectedOrder.dealer.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{selectedOrder.dealer.email} · {selectedOrder.dealer.phone ?? "Phone not added"}</p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-blue-600">Source: {getOrderSourceLabel(selectedOrder.source)}</p>
                </div>
                <div className={`rounded-2xl border p-4 ${selectedOrder.attention.stuck || selectedOrder.attention.overdue ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Current responsibility</p>
                  <p className="mt-1 font-black text-slate-950">{selectedOrder.currentOwner}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{selectedOrder.attention.reason}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Created", formatDateTime(selectedOrder.createdAt)],
                  ["Received", formatDateTime(selectedOrder.receivedAt)],
                  ["Last movement", formatDateTime(selectedOrder.lastMovementAt)],
                  ["Stage age", formatDuration(now.getTime() - selectedOrder.lastMovementAt.getTime())],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-bold text-slate-400">{label}</p>
                    <p className="mt-2 text-sm font-black text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-950">Products and frozen pricing</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Order-time prices remain unchanged after Product Master updates.</p>
                </div>
                {selectedPricing ? (
                  <div className="grid grid-cols-3 gap-2 text-right text-xs">
                    <div><p className="text-slate-400">Subtotal</p><p className="mt-1 font-black text-slate-800">{formatMoney(selectedPricing.subtotal)}</p></div>
                    <div><p className="text-slate-400">GST</p><p className="mt-1 font-black text-slate-800">{formatMoney(selectedPricing.tax)}</p></div>
                    <div><p className="text-slate-400">Total</p><p className="mt-1 font-black text-blue-700">{formatMoney(selectedPricing.total)}</p></div>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-black text-slate-950">{item.product.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.product.code} · Stack {item.product.stack}</p>
                    <p className="mt-2 text-xs font-bold text-slate-600">{formatMoney(Number(item.unitPrice))} each · GST {Number(item.gstRate).toFixed(2)}% · {titleCase(item.priceSource)}</p>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      {[["Ordered", item.requestedQuantity || item.quantity], ["Reserved", item.blockedQuantity], ["Delivered", item.deliveredQuantity]].map(([label, value]) => (
                        <div key={label}><p className="text-slate-400">{label}</p><p className="mt-1 font-black text-slate-800">{value}</p></div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                      <div><p className="text-slate-400">Line subtotal</p><p className="mt-1 font-black text-slate-800">{formatMoney(Number(item.lineSubtotal))}</p></div>
                      <div><p className="text-slate-400">Tax</p><p className="mt-1 font-black text-slate-800">{formatMoney(Number(item.taxAmount))}</p></div>
                      <div><p className="text-slate-400">Line total</p><p className="mt-1 font-black text-blue-700">{formatMoney(Number(item.lineTotal))}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-black text-slate-950">Physical assignments and problems</h3>
              <div className="mt-4 space-y-3">
                {selectedOrder.physicalAssignments.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500">Not assigned to a physical team yet.</p>
                ) : selectedOrder.physicalAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-950">{assignment.team.name}</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{titleCase(assignment.status)}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Assigned: {formatDateTime(assignment.assignedAt)} · Started: {formatDateTime(assignment.startedAt)} · Completed: {formatDateTime(assignment.completedAt)}
                    </p>
                    {assignment.issueNotes ? (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
                        <span className="font-black">{titleCase(assignment.issueType)}:</span> {assignment.issueNotes}
                      </div>
                    ) : null}
                    {assignment.qcNotes ? <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">QC: {assignment.qcNotes}</p> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-black text-slate-950">Complete timeline</h3>
              <div className="mt-5 space-y-0">
                {selectedOrder.history.length === 0 ? (
                  <p className="text-sm font-semibold text-slate-500">No timeline entries recorded.</p>
                ) : selectedOrder.history.map((entry, index) => {
                  const nextEntry = selectedOrder.history[index + 1];
                  const stageEnd = nextEntry?.createdAt ?? new Date();
                  return (
                    <div key={entry.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                      <div className="flex flex-col items-center">
                        <span className="mt-1 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-blue-50" />
                        {index < selectedOrder.history.length - 1 ? <span className="h-full w-px bg-slate-200" /> : null}
                      </div>
                      <div className="pb-6">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-black text-slate-950">{entry.title}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">{getOrderStatusLabel(String(entry.fromStatus ?? "START"))} → {getOrderStatusLabel(String(entry.toStatus))}</p>
                          </div>
                          <span className="text-xs font-bold text-slate-400">{formatDateTime(entry.createdAt)}</span>
                        </div>
                        {entry.description ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{entry.description}</p> : null}
                        <p className="mt-2 text-xs font-semibold text-slate-400">
                          By {entry.changedByName} · {titleCase(entry.changedByRole)} · Stage duration {formatDuration(stageEnd.getTime() - entry.createdAt.getTime())}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-black text-slate-950">Transport and delivery evidence</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Driver</p><p className="mt-1 font-black">{selectedOrder.assignedDriver?.name ?? "Not assigned"}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Transport</p><p className="mt-1 font-black">{selectedOrder.transportOption?.name ?? selectedOrder.transportLabel ?? "Not assigned"}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-400">Proof records</p><p className="mt-1 font-black">{selectedOrder.deliveryProofs.length}</p></div>
              </div>
              <div className="mt-3 space-y-2">
                {selectedOrder.deliveryProofs.map((proof) => (
                  <div key={proof.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-black text-slate-800">{titleCase(proof.proofType)} · {proof.fileName}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Delivered by {proof.deliveredByName || selectedOrder.deliveredByName || selectedOrder.assignedDriver?.name || "Driver"} · Uploaded by {proof.uploadedBy?.name ?? "System"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {proof.uploadMode === "MANAGER_ASSISTED" ? "Manager Assisted" : proof.uploadMode === "INTERNAL_UPLOAD" ? "Internal Replacement" : "Driver Self Upload"} · {formatDateTime(proof.uploadedAt)}{proof.note ? ` · ${proof.note}` : ""}
                        </p>
                      </div>
                      <a href={`/field/deliveries/proof/${proof.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-600 transition hover:bg-blue-600 hover:text-white">
                        View Proof
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
