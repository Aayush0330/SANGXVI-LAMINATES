import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getOrdersWithRelations } from "@/lib/order-queries";
import { InventoryInquiryStatus } from "@/generated/prisma/client";
import { getAppRolesFromUser } from "@/lib/user-role-utils";

type ReportType =
  | "overview"
  | "orders"
  | "inventory"
  | "inquiries"
  | "collections"
  | "field-visits"
  | "tasks"
  | "users";

function getReportType(value: string | null): ReportType {
  const allowed: ReportType[] = ["overview", "orders", "inventory", "inquiries", "collections", "field-visits", "tasks", "users"];
  return allowed.includes(value as ReportType) ? (value as ReportType) : "overview";
}

function getRange(value: string | null) {
  if (value === "7" || value === "90" || value === "365" || value === "all") return value;
  return "30";
}

function getDateRange(range: string) {
  if (range === "all") return null;
  const days = Number(range);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - days + 1);
  return startDate;
}

function hasDateInRange(date: Date, startDate: Date | null) {
  if (!startDate) return true;
  return date >= startDate;
}

function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return values.filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase());
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "";
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

function makeCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvResponse(csv: string, fileName: string) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const appRoles = getAppRolesFromUser(session.user);

  if (!appRoles.some((role) => hasPermission(role, "view_reports"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const reportType = getReportType(request.nextUrl.searchParams.get("report"));
  const range = getRange(request.nextUrl.searchParams.get("range"));
  const selectedStatus = request.nextUrl.searchParams.get("status") || "ALL";
  const searchQuery = (request.nextUrl.searchParams.get("q") || "").trim();
  const startDate = getDateRange(range);

  const [products, orders, users, collections, fieldVisits, tasks, inquiries] = await Promise.all([
    prisma.product.findMany({ include: { category: true, brand: true }, orderBy: { createdAt: "desc" } }),
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

  const orderRows = orders
    .filter((order) => {
      const statusMatches = selectedStatus === "ALL" || order.status === selectedStatus;
      const rangeMatches = hasDateInRange(order.createdAt, startDate);
      const queryMatches = matchesQuery([
        order.orderNumber,
        order.dealer.name,
        order.dealer.email,
        order.items.map((item) => `${item.product.name} ${item.product.code}`).join(" "),
      ], searchQuery);
      return statusMatches && rangeMatches && queryMatches;
    })
    .map((order) => {
      const totalQuantity = order.items.reduce(
        (total, item) => total + (item.requestedQuantity || item.quantity),
        0,
      );
      const subtotal = order.items.reduce((total, item) => total + item.lineSubtotal, 0);
      const taxAmount = order.items.reduce((total, item) => total + item.taxAmount, 0);
      const totalAmount = order.items.reduce((total, item) => total + item.lineTotal, 0);
      return [
        "Order",
        order.orderNumber,
        order.status,
        order.dealer.name,
        order.dealer.email,
        order.items.length,
        totalQuantity,
        subtotal,
        taxAmount,
        totalAmount,
        order.items
          .map(
            (item) =>
              `${item.product.name} (${item.product.code}) x ${item.requestedQuantity || item.quantity} @ ${item.unitPrice} + ${item.gstRate}% GST [${item.priceSource}] = ${item.lineTotal}`,
          )
          .join("; "),
        formatDateTime(order.createdAt),
      ];
    });

  const productRows = products
    .filter((product) => {
      const statusMatches = selectedStatus === "ALL" || product.status === selectedStatus;
      return statusMatches && matchesQuery([
        product.name,
        product.code,
        product.stack,
        product.unit,
        product.category.name,
        product.brand.name,
      ], searchQuery);
    })
    .map((product) => {
      const suggestedReorder = product.quantity <= product.minimumStock
        ? Math.max(product.maximumStock - product.quantity, 0)
        : 0;

      return [
        "Inventory",
        product.code,
        product.name,
        product.category.name,
        product.brand.name,
        product.stack,
        product.unit,
        product.status,
        product.quantity,
        product.blocked,
        product.minimumStock,
        product.maximumStock,
        suggestedReorder,
        formatDateTime(product.updatedAt),
      ];
    });

  const inquiryRows = inquiries
    .filter((inquiry) => {
      const statusMatches = selectedStatus === "ALL" || inquiry.status === selectedStatus;
      const rangeMatches = hasDateInRange(inquiry.createdAt, startDate);
      const queryMatches = matchesQuery([
        inquiry.inquiryNumber,
        inquiry.productName,
        inquiry.product?.code,
        inquiry.dealerName,
        inquiry.customerName,
        inquiry.customerPhone,
        inquiry.source,
        inquiry.status,
        inquiry.orderNumber,
      ], searchQuery);
      return statusMatches && rangeMatches && queryMatches;
    })
    .map((inquiry) => [
      "Inquiry",
      inquiry.inquiryNumber,
      inquiry.status,
      inquiry.productName,
      inquiry.product?.code || "",
      inquiry.quantityAsked,
      inquiry.dealerName || "",
      inquiry.customerName || "",
      inquiry.customerPhone || "",
      inquiry.source,
      inquiry.orderNumber || "",
      inquiry.description || "",
      inquiry.status === InventoryInquiryStatus.MISSED_SALE ? "Yes" : "No",
      formatDateTime(inquiry.nextFollowUpAt),
      formatDateTime(inquiry.createdAt),
    ]);

  const collectionRows = collections
    .filter((collection) => {
      const statusMatches = selectedStatus === "ALL" || collection.status === selectedStatus;
      const rangeMatches = hasDateInRange(collection.createdAt, startDate);
      const queryMatches = matchesQuery([
        collection.collectionNumber,
        collection.dealerName,
        collection.contactPerson,
        collection.contactPhone,
        collection.assignedTo?.name,
      ], searchQuery);
      return statusMatches && rangeMatches && queryMatches;
    })
    .map((collection) => [
      "Collection",
      collection.collectionNumber,
      collection.status,
      collection.dealerName,
      collection.assignedTo?.name || "",
      collection.amountToCollect,
      collection.amountCollected,
      Math.max(collection.amountToCollect - collection.amountCollected, 0),
      collection.paymentMode,
      formatDateTime(collection.dueAt),
      formatDateTime(collection.createdAt),
    ]);

  const fieldVisitRows = fieldVisits
    .filter((visit) => {
      const statusMatches = selectedStatus === "ALL" || visit.status === selectedStatus;
      const rangeMatches = hasDateInRange(visit.createdAt, startDate);
      const queryMatches = matchesQuery([
        visit.visitNumber,
        visit.shopName,
        visit.dealerName,
        visit.contactPerson,
        visit.contactPhone,
        visit.createdByName,
      ], searchQuery);
      return statusMatches && rangeMatches && queryMatches;
    })
    .map((visit) => [
      "Field Visit",
      visit.visitNumber,
      visit.status,
      visit.shopName,
      visit.dealerName || "",
      visit.contactPerson || "",
      visit.contactPhone || "",
      visit.createdByName || "",
      formatDateTime(visit.nextFollowUpAt),
      formatDateTime(visit.createdAt),
    ]);

  const taskRows = tasks
    .filter((task) => {
      const statusMatches = selectedStatus === "ALL" || task.status === selectedStatus;
      const rangeMatches = hasDateInRange(task.createdAt, startDate);
      const queryMatches = matchesQuery([
        task.taskNumber,
        task.title,
        task.description,
        task.team.name,
        task.assignee?.name,
        task.relatedModule,
        task.relatedReference,
      ], searchQuery);
      return statusMatches && rangeMatches && queryMatches;
    })
    .map((task) => [
      "Task",
      task.taskNumber,
      task.title,
      task.status,
      task.priority,
      task.taskType,
      task.team.name,
      task.assignee?.name || "Team pool",
      task.relatedModule || "",
      task.relatedReference || "",
      task.calendarStatus,
      formatDateTime(task.dueAt),
      formatDateTime(task.createdAt),
    ]);

  const userRows = users
    .filter((user) => {
      const statusMatches = selectedStatus === "ALL" || user.status === selectedStatus;
      return statusMatches && matchesQuery([user.name, user.email, user.phone, user.role], searchQuery);
    })
    .map((user) => [
      "User",
      user.name,
      user.email,
      user.phone || "",
      user.role,
      user.status,
      user.mustChangePassword ? "Yes" : "No",
      formatDateTime(user.createdAt),
      formatDateTime(user.updatedAt),
    ]);

  let rows: Array<Array<string | number | null | undefined>> = [];
  let fileName = "sanghvi-report.csv";

  if (reportType === "orders") {
    rows = [["Type", "Order Number", "Status", "Dealer", "Dealer Email", "Items", "Total Qty", "Subtotal", "Tax", "Order Total", "Frozen Price Lines", "Created At"], ...orderRows];
    fileName = "sanghvi-orders-report.csv";
  } else if (reportType === "inventory") {
    rows = [["Type", "Code", "Product", "Category", "Brand / Company", "Stack", "Unit", "Status", "Available", "Blocked", "Minimum", "Maximum", "Suggested Reorder", "Updated At"], ...productRows];
    fileName = "sanghvi-inventory-report.csv";
  } else if (reportType === "inquiries") {
    rows = [["Type", "Inquiry Number", "Status", "Product", "Product Code", "Quantity Asked", "Dealer", "Customer", "Customer Phone", "Source", "Order Number", "Description", "Missed Sale", "Next Follow Up", "Created At"], ...inquiryRows];
    fileName = "sanghvi-inquiries-missed-sales-report.csv";
  } else if (reportType === "collections") {
    rows = [["Type", "Collection Number", "Status", "Dealer/Customer", "Assigned To", "Amount To Collect", "Amount Collected", "Pending", "Payment Mode", "Due At", "Created At"], ...collectionRows];
    fileName = "sanghvi-collections-report.csv";
  } else if (reportType === "field-visits") {
    rows = [["Type", "Visit Number", "Status", "Shop", "Dealer", "Contact Person", "Contact Phone", "Created By", "Next Follow Up", "Created At"], ...fieldVisitRows];
    fileName = "sanghvi-field-visits-report.csv";
  } else if (reportType === "tasks") {
    rows = [["Type", "Task Number", "Title", "Status", "Priority", "Task Type", "Team", "Assignee", "Related Module", "Related Reference", "Calendar Status", "Due At", "Created At"], ...taskRows];
    fileName = "sanghvi-tasks-report.csv";
  } else if (reportType === "users") {
    rows = [["Type", "Name", "Email", "Phone", "Role", "Status", "Must Change Password", "Created At", "Updated At"], ...userRows];
    fileName = "sanghvi-users-report.csv";
  } else {
    rows = [
      ["Report", "Field 1", "Field 2", "Field 3", "Field 4", "Field 5", "Field 6", "Field 7", "Field 8", "Field 9", "Field 10", "Field 11", "Field 12", "Field 13"],
      ...orderRows,
      ...productRows,
      ...inquiryRows,
      ...collectionRows,
      ...fieldVisitRows,
      ...taskRows,
      ...userRows,
    ];
    fileName = "sanghvi-overview-report.csv";
  }

  return csvResponse(makeCsv(rows), fileName);
}
