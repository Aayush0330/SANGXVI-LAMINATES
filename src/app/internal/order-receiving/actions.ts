"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OrderStatus, PhysicalCheckStatus, WorkTeamType } from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { recordOrderStatusHistory, type HistoryClient } from "@/lib/order-status-history";
import { hasAnyRole } from "@/lib/permissions";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  ensurePhysicalVerificationTask,
  setAutomatedTaskStatus,
  workflowTaskKeys,
} from "@/lib/workflow-tasks";

const RECEIVING_ALLOWED_ROLES = ["owner", "manager", "order_team"] as const;
const LEGACY_ASSIGNABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_STOCK_CHECK,
  OrderStatus.STOCK_CHECKED,
  OrderStatus.STOCK_BLOCKED,
  OrderStatus.BACKORDERED,
  OrderStatus.READY_FOR_DISPATCH,
];

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function receivingUrl(type: "error" | "success", value: string) {
  return `/internal/order-receiving?${type}=${encodeURIComponent(value)}`;
}

async function assertReceivingAccess() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_order_receiving",
    "/internal/order-receiving",
  );

  if (
    !hasAccess ||
    !hasAnyRole(currentUser.roles, RECEIVING_ALLOWED_ROLES)
  ) {
    redirect(receivingUrl("error", "permission-denied"));
  }

  return currentUser;
}

export async function confirmOrderReceivedAction(formData: FormData) {
  const currentUser = await assertReceivingAccess();
  const orderId = cleanText(formData.get("orderId"));
  const receivingNotes = cleanText(formData.get("receivingNotes"));

  if (!orderId) {
    redirect(receivingUrl("error", "missing-order"));
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      receivedAt: true,
    },
  });

  if (!order) {
    redirect(receivingUrl("error", "order-not-found"));
  }

  if (order.receivedAt) {
    await prisma.order.update({
      where: { id: order.id },
      data: { receivingNotes: receivingNotes || null },
    });

    await createSecurityAuditLog({
      eventType: "ORDER_RECEIVING_UPDATED",
      user: currentUser,
      path: "/internal/order-receiving",
      description: `Receiving notes updated for ${order.orderNumber}.`,
    });

    revalidatePath("/internal/order-receiving");
    redirect(receivingUrl("success", "receiving-updated"));
  }

  if (order.status !== OrderStatus.NEW_ORDER) {
    redirect(receivingUrl("error", "invalid-status"));
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PENDING_TEAM_ASSIGNMENT,
        receivedById: currentUser.id,
        receivedByName: currentUser.name,
        receivedAt: new Date(),
        receivingNotes: receivingNotes || null,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.PENDING_TEAM_ASSIGNMENT,
      title: "Order Received",
      description:
        receivingNotes ||
        "Order Receiving Team confirmed the order. Product-wise Physical Dispatch Team assignment is pending.",
      currentUser,
    });

    await setAutomatedTaskStatus({
      client: tx,
      automationKey: workflowTaskKeys.orderReceiving(order.id),
      status: "REVIEW",
      actor: currentUser,
      message: `${currentUser.name} confirmed receiving. Physical Team assignment is pending.`,
    });

    await createWorkflowNotification({
      client: tx,
      title: "Physical team assignment required",
      message: `${order.orderNumber} is received. Assign every product to a Physical Dispatch Team.`,
      module: "ORDERS",
      href: "/internal/order-receiving",
      orderId: order.id,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "order_team"],
      priority: "HIGH_ALERT",
    });
  });

  await createSecurityAuditLog({
    eventType: "ORDER_RECEIVED",
    user: currentUser,
    path: "/internal/order-receiving",
    description: `${order.orderNumber} confirmed and moved to Physical Team assignment.`,
  });

  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(receivingUrl("success", "order-received"));
}

export async function assignPhysicalTeamsAction(formData: FormData) {
  const currentUser = await assertReceivingAccess();
  const orderId = cleanText(formData.get("orderId"));

  if (!orderId) {
    redirect(receivingUrl("error", "missing-order"));
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        select: {
          id: true,
          quantity: true,
          requestedQuantity: true,
          product: { select: { name: true, code: true } },
        },
      },
      physicalAssignments: {
        include: { items: true },
      },
    },
  });

  if (!order) {
    redirect(receivingUrl("error", "order-not-found"));
  }

  const assignableStatuses: OrderStatus[] = [
    OrderStatus.PENDING_TEAM_ASSIGNMENT,
    OrderStatus.PHYSICAL_CHECK_ASSIGNED,
    ...LEGACY_ASSIGNABLE_STATUSES,
  ];

  if (!assignableStatuses.includes(order.status)) {
    redirect(receivingUrl("error", "assignment-status-locked"));
  }

  if (
    order.physicalAssignments.some(
      (assignment) => assignment.status !== PhysicalCheckStatus.ASSIGNED,
    )
  ) {
    redirect(receivingUrl("error", "assignment-already-started"));
  }

  if (order.items.length === 0) {
    redirect(receivingUrl("error", "no-order-items"));
  }

  const itemAssignments = order.items.map((item) => ({
    item,
    teamId: cleanText(formData.get(`teamId__${item.id}`)),
  }));

  if (itemAssignments.some(({ teamId }) => !teamId)) {
    redirect(receivingUrl("error", "all-products-require-team"));
  }

  const uniqueTeamIds = Array.from(
    new Set(itemAssignments.map(({ teamId }) => teamId)),
  );

  const teams = await prisma.workTeam.findMany({
    where: {
      id: { in: uniqueTeamIds },
      isActive: true,
      teamType: WorkTeamType.PHYSICAL_DISPATCH,
    },
    include: {
      members: {
        where: { user: { status: "ACTIVE" } },
        select: { userId: true },
      },
    },
  });

  if (
    teams.length !== uniqueTeamIds.length ||
    teams.some((team) => team.members.length === 0)
  ) {
    redirect(receivingUrl("error", "invalid-physical-team"));
  }

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const itemsByTeam = new Map<string, typeof itemAssignments>();

  for (const assignment of itemAssignments) {
    itemsByTeam.set(assignment.teamId, [
      ...(itemsByTeam.get(assignment.teamId) ?? []),
      assignment,
    ]);
  }

  await prisma.$transaction(async (tx) => {
    if (order.physicalAssignments.length > 0) {
      for (const previousAssignment of order.physicalAssignments) {
        await setAutomatedTaskStatus({
          client: tx,
          automationKey: workflowTaskKeys.physicalVerification(previousAssignment.id),
          status: "CANCELLED",
          actor: currentUser,
          message: `${currentUser.name} replaced the Physical Team assignment before verification started.`,
        });
      }

      await tx.orderPhysicalAssignment.deleteMany({
        where: { orderId: order.id },
      });
    }

    for (const [teamId, assignedItems] of itemsByTeam.entries()) {
      const createdAssignment = await tx.orderPhysicalAssignment.create({
        data: {
          orderId: order.id,
          teamId,
          status: PhysicalCheckStatus.ASSIGNED,
          assignedById: currentUser.id,
          assignedByName: currentUser.name,
          items: {
            create: assignedItems.map(({ item }) => ({
              orderItemId: item.id,
              assignedQuantity: Math.max(
                1,
                item.requestedQuantity || item.quantity || 1,
              ),
            })),
          },
        },
      });

      const team = teamById.get(teamId)!;
      await ensurePhysicalVerificationTask(tx, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        assignmentId: createdAssignment.id,
        teamId,
        teamName: team.name,
        actor: currentUser,
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PHYSICAL_CHECK_ASSIGNED },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.PHYSICAL_CHECK_ASSIGNED,
      title: "Physical Teams Assigned",
      description: `${itemAssignments.length} product line(s) assigned across ${uniqueTeamIds.length} Physical Dispatch Team(s).`,
      currentUser,
    });

    await setAutomatedTaskStatus({
      client: tx,
      automationKey: workflowTaskKeys.orderReceiving(order.id),
      status: "DONE",
      actor: currentUser,
      message: `${currentUser.name} completed receiving and assigned all product lines to Physical Teams.`,
    });

    for (const teamId of uniqueTeamIds) {
      const team = teamById.get(teamId)!;
      const assignedItems = itemsByTeam.get(teamId) ?? [];
      const productNames = assignedItems
        .map(({ item }) => item.product.name)
        .slice(0, 3)
        .join(", ");

      await createWorkflowNotification({
        client: tx,
        title: `New physical check: ${order.orderNumber}`,
        message: `${team.name} has ${assignedItems.length} product line(s) to check${productNames ? `: ${productNames}` : ""}.`,
        module: "DISPATCH",
        href: "/internal/dispatch",
        orderId: order.id,
        actor: currentUser,
        recipientUserIds: team.members.map((member) => member.userId),
        priority: "HIGH_ALERT",
      });
    }
  });

  await createSecurityAuditLog({
    eventType: "PHYSICAL_TEAM_ASSIGNED",
    user: currentUser,
    path: "/internal/order-receiving",
    description: `${order.orderNumber}: ${itemAssignments.length} product line(s) assigned to ${uniqueTeamIds.length} physical team(s).`,
  });

  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/qc");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(receivingUrl("success", "teams-assigned"));
}
