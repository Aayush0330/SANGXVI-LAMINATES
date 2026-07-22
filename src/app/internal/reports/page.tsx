import type { ReactNode } from "react";
import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrderDisplayName } from "@/lib/order-fulfillment";
import { getOrdersWithRelations } from "@/lib/order-queries";
import {
  CollectionStatus,
  FieldVisitStatus,
  InventoryInquiryStatus,
  OrderStatus,
  UserStatus,
  WorkTaskStatus,
} from "@/generated/prisma/client";

type SearchParams = {
  report?: string;
  range?: string;
  status?: string;
  q?: string;
};

type ReportType =
  | "overview"
  | "orders"
  | "inventory"
  | "inquiries"
  | "collections"
  | "field-visits"
  | "tasks"
  | "users";

const reportOptions: { value: ReportType; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "orders", label: "Orders" },
  { value: "inventory", label: "Inventory" },
  { value: "inquiries", label: "Inquiries / Missed Sales" },
  { value: "collections", label: "Collections" },
  { value: "field-visits", label: "Field Visits" },
  { value: "tasks", label: "Jira Tasks" },
  { value: "users", label: "Users" },
];

const rangeOptions = [
  { value: "30", label: "Last 30 Days" },
  { value: "7", label: "Last 7 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "365", label: "Last 12 Months" },
  { value: "all", label: "All Time" },
];

const orderStatusOptions = ["ALL", ...Object.values(OrderStatus)];
const collectionStatusOptions = ["ALL", ...Object.values(CollectionStatus)];
const inquiryStatusOptions = ["ALL", ...Object.values(InventoryInquiryStatus)];
const fieldVisitStatusOptions = ["ALL", ...Object.values(FieldVisitStatus)];
const taskStatusOptions = ["ALL", ...Object.values(WorkTaskStatus)];
const userStatusOptions = ["ALL", ...Object.values(UserStatus)];

function getReportType(value?: string): ReportType {
  return reportOptions.some((option) => option.value === value)
    ? (value as ReportType)
    : "overview";
}

function getRange(value?: string) {
  if (value === "7" || value === "90" || value === "365" || value === "all") {
    return value;
  }

  return "30";
}

function getDateRange(range: string) {
  if (range === "all") return { startDate: null, label: "All time" };

  const days = Number(range);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - days + 1);

  return {
    startDate,
    label: `Last ${days} days`,
  };
}

function hasDateInRange(date: Date, startDate: Date | null) {
  if (!startDate) return true;
  return date >= startDate;
}

function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return values.filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase());
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getOrderStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function getStatusClass(status: string) {
  if (["DELIVERED", "DONE", "COLLECTED", "VERIFIED", "GOAL_ACHIEVED", "ACTIVE", "AVAILABLE"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300";
  }

  if (["CANCELLED", "FAILED", "OUT_OF_STOCK", "MISSED_SALE", "BLOCKED", "INACTIVE"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300";
  }

  if (["LOW_STOCK", "NOT_IN_STOCK", "OVERDUE", "PARTIALLY_COLLECTED", "FOLLOW_UP_REQUIRED", "GOAL_PENDING"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";
  }

  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300";
}

function StatCard({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const valueClass = {
    default: "text-slate-950 dark:text-slate-100",
    success: "text-emerald-700 dark:text-emerald-300",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-rose-700 dark:text-rose-300",
    info: "text-blue-700 dark:text-cyan-300",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <h2 className={`mt-3 text-3xl font-black ${valueClass}`}>{value}</h2>
      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{note}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${getStatusClass(status)}`}>
      {getOrderStatusLabel(status)}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-lg font-black text-slate-950 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
        <h2 className="text-xl font-black text-slate-950 dark:text-slate-100">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { hasAccess } = await checkPermission("view_reports", "/internal/reports");

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Reports Access Denied"
        description="Your current role does not have permission to access business reports."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const params = await searchParams;
  const reportType = getReportType(params?.report);
  const range = getRange(params?.range);
  const selectedStatus = params?.status || "ALL";
  const searchQuery = (params?.q || "").trim();
  const { startDate, label: rangeLabel } = getDateRange(range);

  const [products, orders, users, collections, fieldVisits, tasks, inquiries] = await Promise.all([
    prisma.product.findMany({ orderBy: { createdAt: "desc" } }),
    getOrdersWithRelations(),
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.collectionAssignment.findMany({
      include: {
        assignedTo: { select: { name: true, email: true } },
        dealer: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.fieldVisit.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.workTask.findMany({
      include: {
        team: { select: { name: true } },
        assignee: { select: { name: true, email: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.inventoryInquiry.findMany({
      include: {
        product: { select: { code: true, name: true, stack: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const filteredOrders = orders.filter((order) => {
    const statusMatches = selectedStatus === "ALL" || order.status === selectedStatus;
    const rangeMatches = hasDateInRange(order.createdAt, startDate);
    const queryMatches = matchesQuery(
      [
        order.orderNumber,
        order.dealer.name,
        order.dealer.email,
        order.items.map((item) => `${item.product.name} ${item.product.code}`).join(" "),
      ],
      searchQuery,
    );
    return statusMatches && rangeMatches && queryMatches;
  });

  const filteredProducts = products.filter((product) => {
    const statusMatches = selectedStatus === "ALL" || product.status === selectedStatus;
    const queryMatches = matchesQuery([product.name, product.code, product.stack], searchQuery);
    return statusMatches && queryMatches;
  });

  const filteredInquiries = inquiries.filter((inquiry) => {
    const statusMatches = selectedStatus === "ALL" || inquiry.status === selectedStatus;
    const rangeMatches = hasDateInRange(inquiry.createdAt, startDate);
    const queryMatches = matchesQuery(
      [
        inquiry.inquiryNumber,
        inquiry.productName,
        inquiry.product?.code,
        inquiry.dealerName,
        inquiry.customerName,
        inquiry.customerPhone,
        inquiry.source,
        inquiry.status,
        inquiry.orderNumber,
      ],
      searchQuery,
    );
    return statusMatches && rangeMatches && queryMatches;
  });

  const filteredCollections = collections.filter((collection) => {
    const statusMatches = selectedStatus === "ALL" || collection.status === selectedStatus;
    const rangeMatches = hasDateInRange(collection.createdAt, startDate);
    const queryMatches = matchesQuery(
      [collection.collectionNumber, collection.dealerName, collection.contactPerson, collection.contactPhone, collection.assignedTo?.name],
      searchQuery,
    );
    return statusMatches && rangeMatches && queryMatches;
  });

  const filteredFieldVisits = fieldVisits.filter((visit) => {
    const statusMatches = selectedStatus === "ALL" || visit.status === selectedStatus;
    const rangeMatches = hasDateInRange(visit.createdAt, startDate);
    const queryMatches = matchesQuery([visit.visitNumber, visit.shopName, visit.dealerName, visit.contactPerson, visit.contactPhone, visit.createdByName], searchQuery);
    return statusMatches && rangeMatches && queryMatches;
  });

  const filteredTasks = tasks.filter((task) => {
    const statusMatches = selectedStatus === "ALL" || task.status === selectedStatus;
    const rangeMatches = hasDateInRange(task.createdAt, startDate);
    const queryMatches = matchesQuery([task.taskNumber, task.title, task.description, task.team.name, task.assignee?.name, task.relatedModule, task.relatedReference], searchQuery);
    return statusMatches && rangeMatches && queryMatches;
  });

  const filteredUsers = users.filter((user) => {
    const statusMatches = selectedStatus === "ALL" || user.status === selectedStatus;
    const queryMatches = matchesQuery([user.name, user.email, user.phone, user.role], searchQuery);
    return statusMatches && queryMatches;
  });

  const pendingOrders = filteredOrders.filter((order) => order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED);
  const deliveredOrders = filteredOrders.filter((order) => order.status === OrderStatus.DELIVERED);
  const totalOrderedQuantity = filteredOrders.reduce(
    (total, order) =>
      total +
      order.items.reduce(
        (itemTotal, item) => itemTotal + (item.requestedQuantity || item.quantity),
        0,
      ),
    0,
  );
  const totalOrderValue = filteredOrders.reduce(
    (total, order) =>
      total + order.items.reduce((itemTotal, item) => itemTotal + item.lineTotal, 0),
    0,
  );
  const availableStock = products.reduce((total, product) => total + product.quantity, 0);
  const blockedStock = products.reduce((total, product) => total + product.blocked, 0);
  const lowStockProducts = products.filter((product) => product.status !== "AVAILABLE" || product.quantity <= product.minimumStock);
  const collectionTotal = filteredCollections.reduce((total, collection) => total + collection.amountToCollect, 0);
  const collectionCollected = filteredCollections.reduce((total, collection) => total + collection.amountCollected, 0);
  const openTasks = filteredTasks.filter((task) => task.status !== WorkTaskStatus.DONE && task.status !== WorkTaskStatus.CANCELLED);
  const blockedTasks = filteredTasks.filter((task) => task.status === WorkTaskStatus.BLOCKED || task.taskType === "BLOCKER");
  const activeUsers = filteredUsers.filter((user) => user.status === UserStatus.ACTIVE);
  const missedSalesCount = filteredInquiries.filter((inquiry) => inquiry.status === InventoryInquiryStatus.MISSED_SALE).length;
  const notInStockCount = filteredInquiries.filter((inquiry) => inquiry.status === InventoryInquiryStatus.NOT_IN_STOCK).length;
  const missedDemandQuantity = filteredInquiries
    .filter((inquiry) => inquiry.status === InventoryInquiryStatus.MISSED_SALE || inquiry.status === InventoryInquiryStatus.NOT_IN_STOCK)
    .reduce((total, inquiry) => total + inquiry.quantityAsked, 0);

  const currentStatusOptions = reportType === "orders"
    ? orderStatusOptions
    : reportType === "inquiries"
      ? inquiryStatusOptions
      : reportType === "collections"
        ? collectionStatusOptions
      : reportType === "field-visits"
        ? fieldVisitStatusOptions
        : reportType === "tasks"
          ? taskStatusOptions
          : reportType === "users"
            ? userStatusOptions
            : ["ALL"];

  const exportHref = `/internal/reports/export?report=${encodeURIComponent(reportType)}&range=${encodeURIComponent(range)}&status=${encodeURIComponent(selectedStatus)}&q=${encodeURIComponent(searchQuery)}`;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600 dark:text-cyan-300">Reports</p>
            <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-slate-100 md:text-5xl">Business Reports</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Clean operational reports for orders, inventory, missed sales, collections, field visits, Jira tasks and user activity.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={exportHref}
              className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20"
            >
              Export CSV
            </Link>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {rangeLabel} · IST
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <form className="grid gap-4 lg:grid-cols-[220px_180px_220px_1fr_auto_auto] lg:items-end">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Report</span>
            <select name="report" defaultValue={reportType} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {reportOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Range</span>
            <select name="range" defaultValue={range} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Status</span>
            <select name="status" defaultValue={selectedStatus} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {currentStatusOptions.map((status) => (
                <option key={status} value={status}>{status === "ALL" ? "All Status" : getOrderStatusLabel(status)}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Search</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search order, dealer, team, user, product..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </label>

          <button className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">Apply</button>
          <Link href="/internal/reports" className="rounded-2xl border border-slate-200 px-6 py-3 text-center text-sm font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Reset</Link>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders" value={String(filteredOrders.length)} note={`${pendingOrders.length} pending · ${deliveredOrders.length} delivered`} tone="info" />
        <StatCard label="Order Value" value={formatMoney(totalOrderValue)} note={`${totalOrderedQuantity.toLocaleString("en-IN")} ordered units`} />
        <StatCard label="Pending Orders" value={String(pendingOrders.length)} note="Orders still in workflow" tone={pendingOrders.length ? "warning" : "success"} />
        <StatCard label="Delivered Orders" value={String(deliveredOrders.length)} note="Completed deliveries" tone="success" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Stock" value={availableStock.toLocaleString("en-IN")} note={`${blockedStock.toLocaleString("en-IN")} blocked · ${lowStockProducts.length} low`} tone={lowStockProducts.length ? "warning" : "success"} />
        <StatCard label="Missed Sales" value={String(missedSalesCount)} note={`${notInStockCount} not in stock · ${missedDemandQuantity.toLocaleString("en-IN")} qty demand`} tone={missedSalesCount ? "danger" : notInStockCount ? "warning" : "success"} />
        <StatCard label="Collections" value={formatMoney(collectionCollected)} note={`${formatMoney(collectionTotal)} assigned`} tone="success" />
        <StatCard label="Field Visits" value={String(filteredFieldVisits.length)} note="Shop/dealer visit reports" tone="info" />
        <StatCard label="Open Tasks" value={String(openTasks.length)} note={`${blockedTasks.length} blockers`} tone={blockedTasks.length ? "danger" : "success"} />
        <StatCard label="Users" value={String(filteredUsers.length)} note={`${activeUsers.length} active users`} />
        <StatCard label="Report Rows" value={String(reportType === "orders" ? filteredOrders.length : reportType === "inventory" ? filteredProducts.length : reportType === "inquiries" ? filteredInquiries.length : reportType === "collections" ? filteredCollections.length : reportType === "field-visits" ? filteredFieldVisits.length : reportType === "tasks" ? filteredTasks.length : reportType === "users" ? filteredUsers.length : filteredOrders.length + filteredProducts.length + filteredInquiries.length + filteredCollections.length + filteredFieldVisits.length + filteredTasks.length + filteredUsers.length)} note="Available in CSV export" />
      </section>

      {(reportType === "overview" || reportType === "orders") && (
        <SectionCard title="Order Report" description="Filtered dealer orders with status, dealer and item quantity.">
          {filteredOrders.length === 0 ? (
            <div className="p-6"><EmptyState title="No orders found" description="Try changing the report range, status or search query." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.15em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Order</th>
                    <th className="px-5 py-4">Dealer</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Items</th>
                    <th className="px-5 py-4">Qty</th>
                    <th className="px-5 py-4">Order Value</th>
                    <th className="px-5 py-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOrders.slice(0, reportType === "orders" ? 80 : 8).map((order) => {
                    const quantity = order.items.reduce(
                      (total, item) => total + (item.requestedQuantity || item.quantity),
                      0,
                    );
                    const orderValue = order.items.reduce(
                      (total, item) => total + item.lineTotal,
                      0,
                    );
                    return (
                      <tr key={order.id} className="text-slate-600 dark:text-slate-300">
                        <td className="px-5 py-4"><p className="font-black text-slate-950 dark:text-slate-100">{order.orderNumber}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getOrderDisplayName(order.items)}</p></td>
                        <td className="px-5 py-4"><p className="font-bold">{order.dealer.name}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.dealer.email}</p></td>
                        <td className="px-5 py-4"><StatusPill status={order.status} /></td>
                        <td className="px-5 py-4">{order.items.length}</td>
                        <td className="px-5 py-4 font-bold">{quantity}</td>
                        <td className="px-5 py-4 font-black text-slate-950 dark:text-slate-100">{formatMoney(orderValue)}</td>
                        <td className="px-5 py-4">{formatDate(order.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {(reportType === "overview" || reportType === "inventory") && (
        <SectionCard title="Inventory Report" description="Current product stock, blocked quantity and minimum stock alerts.">
          {filteredProducts.length === 0 ? (
            <div className="p-6"><EmptyState title="No products found" description="Try a different product search or status filter." /></div>
          ) : (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.slice(0, reportType === "inventory" ? 90 : 9).map((product) => (
                <article key={product.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-950 dark:text-slate-100">{product.name}</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{product.code} · Stack {product.stack}</p>
                    </div>
                    <StatusPill status={product.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Available</p><p className="mt-1 font-black">{product.quantity}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Blocked</p><p className="mt-1 font-black">{product.blocked}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Minimum</p><p className="mt-1 font-black">{product.minimumStock}</p></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(reportType === "overview" || reportType === "inquiries") && (
        <SectionCard title="Inquiry / Missed Sales Report" description="Product demand, stock-not-available requests and missed-sales tags.">
          {filteredInquiries.length === 0 ? (
            <div className="p-6"><EmptyState title="No inquiry records found" description="Try another range, status or product/dealer search." /></div>
          ) : (
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {filteredInquiries.slice(0, reportType === "inquiries" ? 100 : 6).map((inquiry) => (
                <article key={inquiry.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{inquiry.inquiryNumber}</p>
                      <h3 className="mt-2 text-lg font-black text-slate-950 dark:text-slate-100">{inquiry.productName}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {inquiry.dealerName ?? inquiry.customerName ?? "Unknown source"} · {formatDate(inquiry.createdAt)}
                      </p>
                    </div>
                    <StatusPill status={inquiry.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Asked Qty</p><p className="mt-1 font-black">{inquiry.quantityAsked.toLocaleString("en-IN")}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Source</p><p className="mt-1 font-black">{getOrderStatusLabel(inquiry.source)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Follow-up</p><p className="mt-1 text-xs font-black">{formatDateTime(inquiry.nextFollowUpAt)}</p></div>
                  </div>
                  {inquiry.description ? <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{inquiry.description}</p> : null}
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(reportType === "overview" || reportType === "collections") && (
        <SectionCard title="Collection Report" description="Payment collection assignment, collected amount and pending balance.">
          {filteredCollections.length === 0 ? (
            <div className="p-6"><EmptyState title="No collection records found" description="Try another range, status or customer search." /></div>
          ) : (
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {filteredCollections.slice(0, reportType === "collections" ? 80 : 6).map((collection) => (
                <article key={collection.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{collection.collectionNumber}</p>
                      <h3 className="mt-2 text-lg font-black text-slate-950 dark:text-slate-100">{collection.dealerName}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Assigned to {collection.assignedTo?.name ?? "Not assigned"}</p>
                    </div>
                    <StatusPill status={collection.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">To Collect</p><p className="mt-1 font-black">{formatMoney(collection.amountToCollect)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Collected</p><p className="mt-1 font-black text-emerald-700 dark:text-emerald-300">{formatMoney(collection.amountCollected)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">Pending</p><p className="mt-1 font-black text-amber-700 dark:text-amber-300">{formatMoney(Math.max(collection.amountToCollect - collection.amountCollected, 0))}</p></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(reportType === "overview" || reportType === "field-visits") && (
        <SectionCard title="Field Visit Report" description="Dealer/shop visit status, follow-up and field team activity.">
          {filteredFieldVisits.length === 0 ? (
            <div className="p-6"><EmptyState title="No field visits found" description="Try another date range or search query." /></div>
          ) : (
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {filteredFieldVisits.slice(0, reportType === "field-visits" ? 80 : 6).map((visit) => (
                <article key={visit.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{visit.visitNumber}</p>
                      <h3 className="mt-2 text-lg font-black text-slate-950 dark:text-slate-100">{visit.shopName}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">By {visit.createdByName ?? "Unknown"} · {formatDate(visit.createdAt)}</p>
                    </div>
                    <StatusPill status={visit.status} />
                  </div>
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{visit.description}</p>
                  <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">Next follow-up: {formatDateTime(visit.nextFollowUpAt)}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(reportType === "overview" || reportType === "tasks") && (
        <SectionCard title="Jira Task Report" description="Team-wise task status, priority, blockers and due dates.">
          {filteredTasks.length === 0 ? (
            <div className="p-6"><EmptyState title="No tasks found" description="Try another status, range or team/user search." /></div>
          ) : (
            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {filteredTasks.slice(0, reportType === "tasks" ? 100 : 8).map((task) => (
                <article key={task.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{task.taskNumber}</p>
                      <h3 className="mt-2 text-lg font-black text-slate-950 dark:text-slate-100">{task.title}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{task.team.name} · {task.assignee?.name ?? "Team pool"}</p>
                    </div>
                    <StatusPill status={task.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusPill status={String(task.priority)} />
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Due: {formatDateTime(task.dueAt)}</span>
                    {task.calendarStatus ? <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300">Calendar: {getOrderStatusLabel(task.calendarStatus)}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(reportType === "overview" || reportType === "users") && (
        <SectionCard title="User Report" description="Role-wise users and portal access status.">
          {filteredUsers.length === 0 ? (
            <div className="p-6"><EmptyState title="No users found" description="Try another status or search query." /></div>
          ) : (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredUsers.slice(0, reportType === "users" ? 120 : 9).map((user) => (
                <article key={user.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-950 dark:text-slate-100">{user.name}</h3>
                      <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                    </div>
                    <StatusPill status={user.status} />
                  </div>
                  <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">Role: {getOrderStatusLabel(user.role)}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
