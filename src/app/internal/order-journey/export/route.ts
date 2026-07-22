import { NextRequest, NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { getAppRolesFromUser } from "@/lib/user-role-utils";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { getOrderSourceLabel } from "@/lib/dealer-directory";

function csv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const appRoles = getAppRolesFromUser(session.user);
  if (!appRoles.some((role) => hasPermission(role, "view_order_journey"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = request.nextUrl.searchParams.get("status") ?? "ALL";
  const teamId = request.nextUrl.searchParams.get("team") ?? "ALL";
  const attentionOnly = request.nextUrl.searchParams.get("attention") === "1";
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    include: {
      dealer: { select: { name: true, email: true } },
      assignedDriver: { select: { name: true } },
      transportOption: { select: { name: true } },
      items: { include: { product: true } },
      physicalAssignments: { include: { team: { select: { name: true } } } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      deliveryProofs: { where: { isActive: true }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = orders.filter((order) => {
    const hasProblem = order.physicalAssignments.some((assignment) =>
      ["ISSUE_REPORTED", "QC_REWORK"].includes(assignment.status),
    );
    const needsAttention =
      hasProblem ||
      order.updatedAt < staleBefore;
    const haystack = [
      order.orderNumber,
      order.dealer.name,
      order.dealer.email,
      ...order.items.map((item) => `${item.product.name} ${item.product.code}`),
      ...order.physicalAssignments.map((item) => item.team.name),
    ].join(" ").toLowerCase();
    return (
      (status === "ALL" || order.status === status) &&
      (teamId === "ALL" || order.physicalAssignments.some((item) => item.teamId === teamId)) &&
      (!attentionOnly || needsAttention) &&
      (!q || haystack.includes(q))
    );
  });

  const rows = [
    ["Order", "Dealer", "Source", "Status", "Subtotal", "Tax", "Order Total", "Frozen Price Lines", "Received", "Physical Teams", "Assignment Statuses", "Open Problems", "Driver", "Transport", "Proofs", "Timeline Updates", "Created", "Updated"],
    ...filtered.map((order) => {
      const subtotal = order.items.reduce((total, item) => total + Number(item.lineSubtotal), 0);
      const taxAmount = order.items.reduce((total, item) => total + Number(item.taxAmount), 0);
      const totalAmount = order.items.reduce((total, item) => total + Number(item.lineTotal), 0);
      return [
      order.orderNumber,
      order.dealer.name,
      getOrderSourceLabel(order.source),
      order.status,
      subtotal,
      taxAmount,
      totalAmount,
      order.items.map((item) => `${item.product.name} x ${item.requestedQuantity || item.quantity} @ ${item.unitPrice} + ${item.gstRate}% GST [${item.priceSource}] = ${item.lineTotal}`).join(" | "),
      order.receivedAt?.toISOString() ?? "",
      order.physicalAssignments.map((item) => item.team.name).join(" | "),
      order.physicalAssignments.map((item) => item.status).join(" | "),
      order.physicalAssignments.filter((item) => item.issueNotes).map((item) => `${item.issueType}: ${item.issueNotes}`).join(" | "),
      order.assignedDriver?.name ?? "",
      order.transportOption?.name ?? order.transportLabel ?? "",
      order.deliveryProofs.length,
      order.statusHistory.length,
      order.createdAt.toISOString(),
      order.updatedAt.toISOString(),
      ];
    }),
  ];

  return new NextResponse(rows.map((row) => row.map(csv).join(",")).join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="order-journey-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
