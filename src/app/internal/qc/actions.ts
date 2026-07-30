"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  OrderStatus,
  PhysicalCheckStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { recordOrderStatusHistory, type HistoryClient } from "@/lib/order-status-history";
import { hasAnyRole } from "@/lib/permissions";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  ensureQcReworkTask,
  setAutomatedTaskStatus,
  workflowTaskKeys,
} from "@/lib/workflow-tasks";

const QC_ROLES = ["owner", "manager", "qc_team"] as const;

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function qcUrl(
  type: "error" | "success",
  value: string,
  focusOrderId?: string,
) {
  const params = new URLSearchParams({ [type]: value });
  if (focusOrderId) params.set("order", focusOrderId);
  return `/internal/qc?${params.toString()}${focusOrderId ? "#qc-detail" : ""}`;
}

class QcStateError extends Error {}

async function assertQcAccess() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_qc",
    "/internal/qc",
  );

  if (!hasAccess || !hasAnyRole(currentUser.roles, QC_ROLES)) {
    redirect(qcUrl("error", "permission-denied"));
  }

  return currentUser;
}

export async function approveQcAction(formData: FormData) {
  const currentUser = await assertQcAccess();
  const orderId = cleanText(formData.get("orderId"));
  const focusOrderId = cleanText(formData.get("focusOrderId")) || orderId;
  const qcNotes = cleanText(formData.get("qcNotes"));
  const feedbackUrl = (type: "error" | "success", value: string) =>
    qcUrl(type, value, focusOrderId);

  if (!orderId) {
    redirect(feedbackUrl("error", "missing-order"));
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { physicalAssignmentItem: true },
      },
      physicalAssignments: {
        include: { team: true },
      },
    },
  });

  if (!order) {
    redirect(feedbackUrl("error", "order-not-found"));
  }

  if (order.status !== OrderStatus.PENDING_QC) {
    redirect(feedbackUrl("error", "invalid-status"));
  }

  if (
    order.physicalAssignments.length === 0 ||
    order.physicalAssignments.some(
      (assignment) => assignment.status !== PhysicalCheckStatus.READY_FOR_QC,
    )
  ) {
    redirect(feedbackUrl("error", "physical-checks-incomplete"));
  }

  const incompleteItem = order.items.find((item) => {
    const orderedQuantity =
      item.requestedQuantity > 0 ? item.requestedQuantity : item.quantity;
    const physicalItem = item.physicalAssignmentItem;
    return (
      item.quantity !== orderedQuantity ||
      item.blockedQuantity !== orderedQuantity ||
      item.deliveredQuantity !== 0 ||
      item.cancelledQuantity !== 0 ||
      !physicalItem ||
      physicalItem.verifiedQuantity !== orderedQuantity ||
      physicalItem.damagedQuantity !== 0 ||
      physicalItem.shortQuantity !== 0
    );
  });

  if (incompleteItem) {
    redirect(feedbackUrl("error", "full-quantity-required"));
  }

  try {
    await prisma.$transaction(async (tx) => {
    const transitioned = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING_QC },
      data: { status: OrderStatus.QC_APPROVED },
    });
    if (transitioned.count !== 1) throw new QcStateError();

    const assignmentsUpdated = await tx.orderPhysicalAssignment.updateMany({
      where: {
        orderId: order.id,
        status: PhysicalCheckStatus.READY_FOR_QC,
      },
      data: {
        status: PhysicalCheckStatus.COMPLETED,
        qcRejectedById: null,
        qcRejectedByName: null,
        qcRejectedAt: null,
        qcNotes: qcNotes || null,
      },
    });
    if (assignmentsUpdated.count !== order.physicalAssignments.length) {
      throw new QcStateError();
    }

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.QC_APPROVED,
      title: "QC Approved",
      description:
        qcNotes ||
        "QC approved all physically verified products. Transport and driver can now be assigned by the QC Team.",
      currentUser,
    });

    await setAutomatedTaskStatus({
      client: tx,
      automationKey: workflowTaskKeys.qcReview(order.id),
      status: "DONE",
      actor: currentUser,
      message: `${currentUser.name} approved QC for ${order.orderNumber}.`,
    });

    await createWorkflowNotification({
      client: tx,
      title: `Transport assignment required: ${order.orderNumber}`,
      message:
        "QC is approved. Select the transport option and driver to start delivery.",
      module: "TRANSPORT",
      href: "/internal/qc",
      orderId: order.id,
      actor: currentUser,
      recipientRoles: ["owner", "manager", "qc_team"],
      priority: "HIGH_ALERT",
    });
    });
  } catch (error) {
    if (error instanceof QcStateError) {
      redirect(feedbackUrl("error", "invalid-status"));
    }
    throw error;
  }

  await createSecurityAuditLog({
    eventType: "QC_APPROVED",
    user: currentUser,
    path: "/internal/qc",
    description: `${order.orderNumber} approved by QC.`,
  });

  revalidatePath("/internal/qc");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(feedbackUrl("success", "qc-approved"));
}

export async function requestQcReworkAction(formData: FormData) {
  const currentUser = await assertQcAccess();
  const assignmentId = cleanText(formData.get("assignmentId"));
  const focusOrderId = cleanText(formData.get("focusOrderId"));
  const qcNotes = cleanText(formData.get("qcNotes"));
  const feedbackUrl = (type: "error" | "success", value: string) =>
    qcUrl(type, value, focusOrderId);

  if (!assignmentId) {
    redirect(feedbackUrl("error", "missing-assignment"));
  }

  if (!qcNotes) {
    redirect(feedbackUrl("error", "rework-note-required"));
  }

  const assignment = await prisma.orderPhysicalAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      team: {
        include: {
          members: {
            where: { user: { status: UserStatus.ACTIVE } },
            select: { userId: true },
          },
        },
      },
      order: true,
    },
  });

  if (!assignment) {
    redirect(feedbackUrl("error", "assignment-not-found"));
  }

  if (
    assignment.order.status !== OrderStatus.PENDING_QC ||
    assignment.status !== PhysicalCheckStatus.READY_FOR_QC
  ) {
    redirect(feedbackUrl("error", "invalid-rework-status"));
  }

  try {
    await prisma.$transaction(async (tx) => {
    const orderTransitioned = await tx.order.updateMany({
      where: {
        id: assignment.orderId,
        status: OrderStatus.PENDING_QC,
      },
      data: { status: OrderStatus.QC_REWORK },
    });
    if (orderTransitioned.count !== 1) throw new QcStateError();

    const assignmentTransitioned =
      await tx.orderPhysicalAssignment.updateMany({
      where: {
        id: assignment.id,
        status: PhysicalCheckStatus.READY_FOR_QC,
      },
      data: {
        status: PhysicalCheckStatus.QC_REWORK,
        qcRejectedById: currentUser.id,
        qcRejectedByName: currentUser.name,
        qcRejectedAt: new Date(),
        qcNotes,
      },
    });
    if (assignmentTransitioned.count !== 1) throw new QcStateError();

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: assignment.orderId,
      fromStatus: assignment.order.status,
      toStatus: OrderStatus.QC_REWORK,
      title: "QC Rework Requested",
      description: `${assignment.team.name}: ${qcNotes}`,
      currentUser,
    });

    await setAutomatedTaskStatus({
      client: tx,
      automationKey: workflowTaskKeys.qcReview(assignment.orderId),
      status: "BLOCKED",
      actor: currentUser,
      message: `${currentUser.name} returned ${assignment.team.name} for QC rework.`,
      blockerReason: qcNotes,
    });

    await ensureQcReworkTask(tx, {
      orderId: assignment.orderId,
      orderNumber: assignment.order.orderNumber,
      assignmentId: assignment.id,
      teamId: assignment.teamId,
      teamName: assignment.team.name,
      note: qcNotes,
      actor: currentUser,
    });

    await createWorkflowNotification({
      client: tx,
      title: `QC rework: ${assignment.order.orderNumber}`,
      message: `${assignment.team.name} must correct and recheck its assigned products. QC note: ${qcNotes}`,
      module: "QC",
      href: "/internal/dispatch",
      orderId: assignment.orderId,
      actor: currentUser,
      recipientUserIds: assignment.team.members.map((member) => member.userId),
      priority: "BLOCKER",
    });
    });
  } catch (error) {
    if (error instanceof QcStateError) {
      redirect(feedbackUrl("error", "invalid-rework-status"));
    }
    throw error;
  }

  await createSecurityAuditLog({
    eventType: "QC_REWORK_REQUESTED",
    user: currentUser,
    path: "/internal/qc",
    description: `${assignment.order.orderNumber} sent back to ${assignment.team.name}: ${qcNotes}`,
  });

  revalidatePath("/internal/qc");
  revalidatePath("/internal/dispatch");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(feedbackUrl("success", "rework-requested"));
}

export async function assignTransportFromQcAction(formData: FormData) {
  const currentUser = await assertQcAccess();
  const orderId = cleanText(formData.get("orderId"));
  const focusOrderId = cleanText(formData.get("focusOrderId")) || orderId;
  const driverId = cleanText(formData.get("driverId"));
  const transportOptionId = cleanText(formData.get("transportOptionId"));
  const feedbackUrl = (type: "error" | "success", value: string) =>
    qcUrl(type, value, focusOrderId);

  if (!orderId) redirect(feedbackUrl("error", "missing-order"));
  if (!driverId) redirect(feedbackUrl("error", "missing-driver"));
  if (!transportOptionId) redirect(feedbackUrl("error", "missing-transport"));

  const [order, driver, transportOption] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        physicalAssignments: { select: { status: true } },
      },
    }),
    prisma.user.findFirst({
      where: {
        id: driverId,
        status: UserStatus.ACTIVE,
        OR: [
          { role: UserRole.DRIVER_TRANSPORT },
          { roleAssignments: { some: { role: UserRole.DRIVER_TRANSPORT } } },
        ],
      },
      select: { id: true, name: true, phone: true },
    }),
    prisma.transportOption.findFirst({
      where: { id: transportOptionId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  if (!order) redirect(feedbackUrl("error", "order-not-found"));
  if (!driver) redirect(feedbackUrl("error", "driver-not-found"));
  if (!transportOption) redirect(feedbackUrl("error", "transport-not-found"));
  if (order.status !== OrderStatus.QC_APPROVED) {
    redirect(feedbackUrl("error", "transport-status-invalid"));
  }

  const incompleteDelivery =
    order.physicalAssignments.length === 0 ||
    order.physicalAssignments.some(
      (assignment) => assignment.status !== PhysicalCheckStatus.COMPLETED,
    ) ||
    order.items.some((item) => {
      const orderedQuantity =
        item.requestedQuantity > 0 ? item.requestedQuantity : item.quantity;
      return (
        item.quantity !== orderedQuantity ||
        item.blockedQuantity !== orderedQuantity ||
        item.deliveredQuantity !== 0 ||
        item.cancelledQuantity !== 0
      );
    });

  if (incompleteDelivery) {
    redirect(feedbackUrl("error", "full-quantity-required"));
  }

  try {
    await prisma.$transaction(async (tx) => {
    const transitioned = await tx.order.updateMany({
      where: { id: order.id, status: OrderStatus.QC_APPROVED },
      data: {
        status: OrderStatus.TRANSPORT_ASSIGNED,
        assignedDriverId: driver.id,
        transportOptionId: transportOption.id,
        transportLabel: transportOption.name,
      },
    });
    if (transitioned.count !== 1) throw new QcStateError();

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.TRANSPORT_ASSIGNED,
      title: "Transport Assigned by QC",
      description: `${transportOption.name} assigned to ${driver.name}.`,
      currentUser,
    });

    await createWorkflowNotification({
      client: tx,
      title: `Delivery assigned: ${order.orderNumber}`,
      message: `Use ${transportOption.name} for this delivery. Open the field portal for full details.`,
      module: "DELIVERY",
      href: "/field/deliveries",
      orderId: order.id,
      actor: currentUser,
      recipientUserIds: [driver.id],
      priority: "HIGH_ALERT",
    });
    });
  } catch (error) {
    if (error instanceof QcStateError) {
      redirect(feedbackUrl("error", "transport-status-invalid"));
    }
    throw error;
  }

  await createSecurityAuditLog({
    eventType: "TRANSPORT_ASSIGNED",
    user: currentUser,
    path: "/internal/qc",
    description: `${order.orderNumber} assigned to ${driver.name} via ${transportOption.name} by QC.`,
  });

  revalidatePath("/internal/qc");
  revalidatePath("/field/deliveries");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(feedbackUrl("success", "transport-assigned"));
}
