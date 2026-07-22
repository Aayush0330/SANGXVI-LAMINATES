"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  OrderStatus,
  PhysicalCheckIssueType,
  PhysicalCheckStatus,
  ProductStatus,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createWorkflowNotification } from "@/lib/notifications";
import { getCancellationClosureQuantities } from "@/lib/order-fulfillment";
import { recordOrderStatusHistory, type HistoryClient } from "@/lib/order-status-history";
import { hasAnyRole } from "@/lib/permissions";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  closeStockBlockTimeline,
  recordStockBlockTimeline,
} from "@/lib/stock-block-timeline";
import {
  cancelAutomatedTasksForOrder,
  ensureQcReviewTask,
  resumeAutomatedTask,
  resumeAutomatedTasksForOrder,
  setAutomatedTaskStatus,
  workflowTaskKeys,
} from "@/lib/workflow-tasks";

const PHYSICAL_ROLES = ["owner", "manager", "dispatch_team"] as const;
const MANAGER_ROLES = ["owner", "manager"] as const;
const CANCELLATION_REQUESTED_STATUS = "CANCELLATION_REQUESTED" as OrderStatus;

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function dispatchUrl(type: "error" | "success", value: string) {
  return `/internal/dispatch?${type}=${encodeURIComponent(value)}`;
}

function getProductStatus(quantity: number, minimumStock: number) {
  if (quantity <= 0) return ProductStatus.OUT_OF_STOCK;
  if (quantity <= minimumStock) return ProductStatus.LOW_STOCK;
  return ProductStatus.AVAILABLE;
}

function parseIssueType(value: string) {
  const valid = new Set(Object.values(PhysicalCheckIssueType));
  return valid.has(value as PhysicalCheckIssueType)
    ? (value as PhysicalCheckIssueType)
    : null;
}

async function assertPhysicalAccess() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_dispatch",
    "/internal/dispatch",
  );

  if (!hasAccess || !hasAnyRole(currentUser.roles, PHYSICAL_ROLES)) {
    redirect(dispatchUrl("error", "permission-denied"));
  }

  return currentUser;
}

async function getAccessibleAssignment(
  assignmentId: string,
  currentUser: Awaited<ReturnType<typeof assertPhysicalAccess>>,
) {
  return prisma.orderPhysicalAssignment.findFirst({
    where: {
      id: assignmentId,
      ...(hasAnyRole(currentUser.roles, MANAGER_ROLES)
        ? {}
        : { team: { members: { some: { userId: currentUser.id } } } }),
    },
    include: {
      team: {
        include: {
          members: {
            where: { user: { status: "ACTIVE" } },
            select: { userId: true },
          },
        },
      },
      order: {
        include: {
          dealer: { select: { id: true, name: true } },
          physicalAssignments: { select: { id: true, status: true } },
        },
      },
      items: {
        include: {
          orderItem: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function startPhysicalCheckAction(formData: FormData) {
  const currentUser = await assertPhysicalAccess();
  const assignmentId = cleanText(formData.get("assignmentId"));

  if (!assignmentId) {
    redirect(dispatchUrl("error", "missing-assignment"));
  }

  const assignment = await getAccessibleAssignment(assignmentId, currentUser);

  if (!assignment) {
    redirect(dispatchUrl("error", "assignment-not-found"));
  }

  const canStartCheck = [
    PhysicalCheckStatus.ASSIGNED,
    PhysicalCheckStatus.QC_REWORK,
  ].some((status) => status === assignment.status);

  if (!canStartCheck) {
    redirect(dispatchUrl("error", "invalid-assignment-status"));
  }

  const previousOrderStatus = assignment.order.status;
  const startingQcRework =
    assignment.status === PhysicalCheckStatus.QC_REWORK;

  await prisma.$transaction(async (tx) => {
    await tx.orderPhysicalAssignment.update({
      where: { id: assignment.id },
      data: {
        status: PhysicalCheckStatus.IN_PROGRESS,
        startedById: currentUser.id,
        startedByName: currentUser.name,
        startedAt: new Date(),
        issueType: null,
        issueNotes: null,
      },
    });

    if (assignment.status === PhysicalCheckStatus.QC_REWORK) {
      await setAutomatedTaskStatus({
        client: tx,
        automationKey: workflowTaskKeys.qcRework(assignment.id),
        status: "IN_PROGRESS",
        actor: currentUser,
        message: `${currentUser.name} started the QC rework cycle.`,
      });
    } else {
      await setAutomatedTaskStatus({
        client: tx,
        automationKey: workflowTaskKeys.physicalVerification(assignment.id),
        status: "IN_PROGRESS",
        actor: currentUser,
        message: `${currentUser.name} started physical verification for ${assignment.order.orderNumber}.`,
      });
    }

    const assignmentStates = await tx.orderPhysicalAssignment.findMany({
      where: { orderId: assignment.orderId },
      select: { status: true },
    });
    const nextOrderStatus = assignmentStates.some(
      (row) => row.status === PhysicalCheckStatus.ISSUE_REPORTED,
    )
      ? OrderStatus.PHYSICAL_CHECK_ISSUE
      : startingQcRework || assignmentStates.some(
            (row) => row.status === PhysicalCheckStatus.QC_REWORK,
          )
        ? OrderStatus.QC_REWORK
        : OrderStatus.PHYSICAL_CHECK_IN_PROGRESS;

    if (assignment.order.status !== nextOrderStatus) {
      await tx.order.update({
        where: { id: assignment.orderId },
        data: { status: nextOrderStatus },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: assignment.orderId,
        fromStatus: previousOrderStatus,
        toStatus: nextOrderStatus,
        title:
          assignment.status === PhysicalCheckStatus.QC_REWORK
            ? "QC Rework Started"
            : "Physical Check Started",
        description: `${assignment.team.name} started physical verification.`,
        currentUser,
      });
    }
  });

  await createSecurityAuditLog({
    eventType: "PHYSICAL_CHECK_STARTED",
    user: currentUser,
    path: "/internal/dispatch",
    description: `${assignment.team.name} started ${assignment.order.orderNumber}.`,
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(dispatchUrl("success", "check-started"));
}

export async function completePhysicalCheckAction(formData: FormData) {
  const currentUser = await assertPhysicalAccess();
  const assignmentId = cleanText(formData.get("assignmentId"));
  const issueType = parseIssueType(cleanText(formData.get("issueType")));
  const issueNotes = cleanText(formData.get("issueNotes"));

  if (!assignmentId) {
    redirect(dispatchUrl("error", "missing-assignment"));
  }

  const assignment = await getAccessibleAssignment(assignmentId, currentUser);

  if (!assignment) {
    redirect(dispatchUrl("error", "assignment-not-found"));
  }

  // Starting a QC rework changes the assignment status to IN_PROGRESS. Keep
  // using the QC-rejection metadata so completion, blockers and audit events
  // continue to synchronize the rework task instead of the original physical
  // verification task.
  const isQcRework =
    assignment.status === PhysicalCheckStatus.QC_REWORK ||
    Boolean(assignment.qcRejectedAt);

  const canCompleteCheck = [
    PhysicalCheckStatus.IN_PROGRESS,
    PhysicalCheckStatus.ISSUE_REPORTED,
    PhysicalCheckStatus.QC_REWORK,
  ].some((status) => status === assignment.status);

  if (!canCompleteCheck) {
    redirect(dispatchUrl("error", "invalid-assignment-status"));
  }

  const checkedItems = assignment.items.map((item) => {
    const verifiedQuantity = Number(
      formData.get(`verifiedQuantity__${item.id}`) ?? -1,
    );
    const damagedQuantity = Number(
      formData.get(`damagedQuantity__${item.id}`) ?? 0,
    );
    const notes = cleanText(formData.get(`notes__${item.id}`));

    return {
      item,
      verifiedQuantity,
      damagedQuantity,
      shortQuantity: Math.max(0, item.assignedQuantity - verifiedQuantity),
      notes,
    };
  });

  const invalidItem = checkedItems.some(
    ({ item, verifiedQuantity, damagedQuantity }) =>
      !Number.isInteger(verifiedQuantity) ||
      verifiedQuantity < 0 ||
      verifiedQuantity > item.assignedQuantity ||
      !Number.isInteger(damagedQuantity) ||
      damagedQuantity < 0 ||
      damagedQuantity > verifiedQuantity,
  );

  if (invalidItem) {
    redirect(dispatchUrl("error", "invalid-check-quantity"));
  }

  const hasQuantityIssue = checkedItems.some(
    ({ shortQuantity, damagedQuantity }) =>
      shortQuantity > 0 || damagedQuantity > 0,
  );
  const hasIssue = Boolean(issueType || issueNotes || hasQuantityIssue);

  if (hasIssue) {
    const inferredIssue =
      issueType ??
      (checkedItems.some(({ damagedQuantity }) => damagedQuantity > 0)
        ? PhysicalCheckIssueType.DAMAGED_PRODUCT
        : PhysicalCheckIssueType.SHORT_QUANTITY);

    await prisma.$transaction(async (tx) => {
      for (const item of checkedItems) {
        const orderItem = item.item.orderItem;
        const existingBlocked = orderItem.blockedQuantity;

        if (existingBlocked > 0) {
          const updatedProduct = await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              quantity: { increment: existingBlocked },
              blocked: { decrement: existingBlocked },
            },
          });

          await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              status: getProductStatus(
                updatedProduct.quantity,
                updatedProduct.minimumStock,
              ),
            },
          });

          await closeStockBlockTimeline({
            client: tx,
            orderId: assignment.orderId,
            orderItemId: orderItem.id,
            productId: orderItem.productId,
            quantity: existingBlocked,
            currentUser,
            status: "RELEASED",
            releaseReason: "PHYSICAL_CHECK_BLOCKER",
            notes: `${existingBlocked} quantity released because the full ordered quantity was not verified.`,
          });

          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: { blockedQuantity: 0 },
          });
        }

        await tx.orderPhysicalAssignmentItem.update({
          where: { id: item.item.id },
          data: {
            verifiedQuantity: item.verifiedQuantity,
            damagedQuantity: item.damagedQuantity,
            shortQuantity: item.shortQuantity,
            notes: item.notes || null,
            checkedById: currentUser.id,
            checkedByName: currentUser.name,
            checkedAt: new Date(),
          },
        });
      }

      await tx.orderPhysicalAssignment.update({
        where: { id: assignment.id },
        data: {
          status: PhysicalCheckStatus.ISSUE_REPORTED,
          issueType: inferredIssue,
          issueNotes:
            issueNotes ||
            "Physical verification found a quantity, damage, or availability issue.",
          completedById: currentUser.id,
          completedByName: currentUser.name,
          completedAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: assignment.orderId },
        data: { status: OrderStatus.PHYSICAL_CHECK_ISSUE },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: assignment.orderId,
        fromStatus: assignment.order.status,
        toStatus: OrderStatus.PHYSICAL_CHECK_ISSUE,
        title: "Physical Check Issue Reported",
        description: `${assignment.team.name}: ${issueNotes || inferredIssue.replaceAll("_", " ")}.`,
        currentUser,
      });

      if (isQcRework) {
        await setAutomatedTaskStatus({
          client: tx,
          automationKey: workflowTaskKeys.qcRework(assignment.id),
          status: "BLOCKED",
          actor: currentUser,
          message: `${assignment.team.name} reported a blocker during QC rework.`,
          blockerReason: issueNotes || inferredIssue.replaceAll("_", " "),
        });
      } else {
        await setAutomatedTaskStatus({
          client: tx,
          automationKey: workflowTaskKeys.physicalVerification(assignment.id),
          status: "BLOCKED",
          actor: currentUser,
          message: `${assignment.team.name} reported a physical verification blocker.`,
          blockerReason: issueNotes || inferredIssue.replaceAll("_", " "),
        });
      }

      await createWorkflowNotification({
        client: tx,
        title: `Physical check blocker: ${assignment.order.orderNumber}`,
        message: `${assignment.team.name} reported ${inferredIssue.replaceAll("_", " ").toLowerCase()}. Review and resolve before QC.`,
        module: "DISPATCH",
        href: "/internal/dispatch",
        orderId: assignment.orderId,
        actor: currentUser,
        recipientRoles: ["owner", "manager"],
        priority: "BLOCKER",
      });

      await createWorkflowNotification({
        client: tx,
        title: `Order blocked during physical check: ${assignment.order.orderNumber}`,
        message: `${assignment.team.name} reported ${inferredIssue.replaceAll("_", " ").toLowerCase()}. Track the blocked order in Workflow Control.`,
        module: "ORDER_RECEIVING",
        href: "/internal/order-receiving",
        orderId: assignment.orderId,
        actor: currentUser,
        recipientRoles: ["order_team"],
        priority: "BLOCKER",
      });
    });

    await createSecurityAuditLog({
      eventType: "PHYSICAL_CHECK_ISSUE_REPORTED",
      user: currentUser,
      path: "/internal/dispatch",
      description: `${assignment.order.orderNumber}: ${assignment.team.name} reported ${inferredIssue}.`,
    });

    revalidatePath("/internal/dispatch");
    revalidatePath("/internal/order-receiving");
    revalidatePath("/internal/qc");
    revalidatePath("/dealer/orders");
    revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

    redirect(dispatchUrl("success", "issue-reported"));
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const checked of checkedItems) {
        const orderItem = checked.item.orderItem;
        const desiredBlocked =
          orderItem.requestedQuantity > 0
            ? orderItem.requestedQuantity
            : orderItem.quantity;
        const existingBlocked = orderItem.blockedQuantity;
        const additionalBlock = Math.max(0, desiredBlocked - existingBlocked);
        const releaseQuantity = Math.max(0, existingBlocked - desiredBlocked);

        if (additionalBlock > 0) {
          const updated = await tx.product.updateMany({
            where: {
              id: orderItem.productId,
              quantity: { gte: additionalBlock },
            },
            data: {
              quantity: { decrement: additionalBlock },
              blocked: { increment: additionalBlock },
            },
          });

          if (updated.count !== 1) {
            throw new Error("PRODUCT_STOCK_CHANGED");
          }

          const updatedProduct = await tx.product.findUniqueOrThrow({
            where: { id: orderItem.productId },
          });

          await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              status: getProductStatus(
                updatedProduct.quantity,
                updatedProduct.minimumStock,
              ),
            },
          });

          await recordStockBlockTimeline({
            client: tx,
            order: {
              id: assignment.orderId,
              orderNumber: assignment.order.orderNumber,
            },
            item: {
              id: orderItem.id,
              productId: orderItem.productId,
              orderId: assignment.orderId,
            },
            quantity: additionalBlock,
            currentUser,
            blockReason: "PHYSICAL_CHECK_VERIFIED",
            notes: `${assignment.team.name} physically verified and blocked ${additionalBlock} ${orderItem.product.unit}.`,
          });
        }

        if (releaseQuantity > 0) {
          const updatedProduct = await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              quantity: { increment: releaseQuantity },
              blocked: { decrement: releaseQuantity },
            },
          });

          await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              status: getProductStatus(
                updatedProduct.quantity,
                updatedProduct.minimumStock,
              ),
            },
          });

          await closeStockBlockTimeline({
            client: tx,
            orderId: assignment.orderId,
            orderItemId: orderItem.id,
            productId: orderItem.productId,
            quantity: releaseQuantity,
            currentUser,
            status: "RELEASED",
            releaseReason: "FULL_QUANTITY_RECONCILIATION",
            notes: `${releaseQuantity} excess legacy blocked quantity released before full verification.`,
          });
        }

        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { blockedQuantity: desiredBlocked },
        });

        await tx.orderPhysicalAssignmentItem.update({
          where: { id: checked.item.id },
          data: {
            verifiedQuantity: desiredBlocked,
            damagedQuantity: 0,
            shortQuantity: 0,
            notes: checked.notes || null,
            checkedById: currentUser.id,
            checkedByName: currentUser.name,
            checkedAt: new Date(),
          },
        });
      }

      await tx.orderPhysicalAssignment.update({
        where: { id: assignment.id },
        data: {
          status: PhysicalCheckStatus.READY_FOR_QC,
          completedById: currentUser.id,
          completedByName: currentUser.name,
          completedAt: new Date(),
          issueType: null,
          issueNotes: null,
          qcNotes: null,
          revision: { increment: isQcRework ? 1 : 0 },
        },
      });

      const remainingAssignments = await tx.orderPhysicalAssignment.findMany({
        where: { orderId: assignment.orderId },
        select: { status: true },
      });
      const allReady = remainingAssignments.every((row) =>
        [PhysicalCheckStatus.READY_FOR_QC, PhysicalCheckStatus.COMPLETED].some(
          (status) => status === row.status,
        ),
      );
      const hasQcRework = remainingAssignments.some(
        (row) => row.status === PhysicalCheckStatus.QC_REWORK,
      );
      const hasIssue = remainingAssignments.some(
        (row) => row.status === PhysicalCheckStatus.ISSUE_REPORTED,
      );
      const nextOrderStatus = allReady
        ? OrderStatus.PENDING_QC
        : hasQcRework
          ? OrderStatus.QC_REWORK
          : hasIssue
            ? OrderStatus.PHYSICAL_CHECK_ISSUE
            : OrderStatus.PHYSICAL_CHECK_IN_PROGRESS;

      await tx.order.update({
        where: { id: assignment.orderId },
        data: { status: nextOrderStatus },
      });

      await recordOrderStatusHistory({
        client: tx as unknown as HistoryClient,
        orderId: assignment.orderId,
        fromStatus: assignment.order.status,
        toStatus: nextOrderStatus,
        title: allReady
          ? "All Physical Checks Completed"
          : "Physical Team Check Completed",
        description: allReady
          ? "All assigned Physical Dispatch Teams completed verification. Order is ready for QC."
          : `${assignment.team.name} completed verification. Other assigned teams are still working.`,
        currentUser,
      });

      if (isQcRework) {
        await setAutomatedTaskStatus({
          client: tx,
          automationKey: workflowTaskKeys.qcRework(assignment.id),
          status: "DONE",
          actor: currentUser,
          message: `${assignment.team.name} completed the requested QC rework.`,
        });
      } else {
        await setAutomatedTaskStatus({
          client: tx,
          automationKey: workflowTaskKeys.physicalVerification(assignment.id),
          status: "DONE",
          actor: currentUser,
          message: `${assignment.team.name} completed full physical verification for ${assignment.order.orderNumber}.`,
        });
      }

      if (allReady) {
        await ensureQcReviewTask(tx, {
          orderId: assignment.orderId,
          orderNumber: assignment.order.orderNumber,
          actor: currentUser,
        });
        await resumeAutomatedTask({
          client: tx,
          automationKey: workflowTaskKeys.qcReview(assignment.orderId),
          actor: currentUser,
          message: "All Physical Teams are ready. QC review resumed.",
          fallbackStatus: "TODO",
        });
      }

      await createWorkflowNotification({
        client: tx,
        title: allReady
          ? `QC required: ${assignment.order.orderNumber}`
          : `Physical check completed: ${assignment.team.name}`,
        message: allReady
          ? "All physical teams completed verification. QC can now inspect the order."
          : `${assignment.team.name} completed its assigned product check.`,
        module: allReady ? "QC" : "DISPATCH",
        href: allReady ? "/internal/qc" : "/internal/dispatch",
        orderId: assignment.orderId,
        actor: currentUser,
        recipientRoles: allReady
          ? ["owner", "manager", "qc_team"]
          : ["owner", "manager"],
        priority: allReady ? "HIGH_ALERT" : "NORMAL",
      });

      if (!allReady) {
        await createWorkflowNotification({
          client: tx,
          title: `Physical check progress: ${assignment.order.orderNumber}`,
          message: `${assignment.team.name} completed its assigned product check. Other teams are still working.`,
          module: "ORDER_RECEIVING",
          href: "/internal/order-receiving",
          orderId: assignment.orderId,
          actor: currentUser,
          recipientRoles: ["order_team"],
          priority: "NORMAL",
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_STOCK_CHANGED") {
      await prisma.$transaction(async (tx) => {
        for (const assignmentItem of assignment.items) {
          const orderItem = assignmentItem.orderItem;
          if (orderItem.blockedQuantity <= 0) continue;

          const updatedProduct = await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              quantity: { increment: orderItem.blockedQuantity },
              blocked: { decrement: orderItem.blockedQuantity },
            },
          });

          await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              status: getProductStatus(
                updatedProduct.quantity,
                updatedProduct.minimumStock,
              ),
            },
          });

          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: { blockedQuantity: 0 },
          });

          await closeStockBlockTimeline({
            client: tx,
            orderId: assignment.orderId,
            orderItemId: orderItem.id,
            productId: orderItem.productId,
            quantity: orderItem.blockedQuantity,
            currentUser,
            status: "RELEASED",
            releaseReason: "FULL_STOCK_NOT_AVAILABLE",
            notes: "Incomplete reserved stock released because the complete ordered quantity is unavailable.",
          });
        }

        await tx.orderPhysicalAssignmentItem.updateMany({
          where: { assignmentId: assignment.id },
          data: {
            verifiedQuantity: null,
            damagedQuantity: 0,
            shortQuantity: 0,
            checkedById: null,
            checkedByName: null,
            checkedAt: null,
          },
        });

        await tx.orderPhysicalAssignment.update({
          where: { id: assignment.id },
          data: {
            status: PhysicalCheckStatus.ISSUE_REPORTED,
            issueType: PhysicalCheckIssueType.PRODUCT_UNAVAILABLE,
            issueNotes:
              "Full ordered quantity is not available. Add complete stock, resolve the blocker with a note, and restart physical verification.",
          },
        });
        await tx.order.update({
          where: { id: assignment.orderId },
          data: { status: OrderStatus.PHYSICAL_CHECK_ISSUE },
        });

        await setAutomatedTaskStatus({
          client: tx,
          automationKey:
            isQcRework
              ? workflowTaskKeys.qcRework(assignment.id)
              : workflowTaskKeys.physicalVerification(assignment.id),
          status: "BLOCKED",
          actor: currentUser,
          message: "Stock changed before the complete quantity could be reserved.",
          blockerReason: "Full ordered quantity is no longer available. Add stock and restart verification.",
        });
      });

      redirect(dispatchUrl("error", "stock-changed"));
    }

    throw error;
  }

  await createSecurityAuditLog({
    eventType:
      isQcRework
        ? "QC_REWORK_COMPLETED"
        : "PHYSICAL_CHECK_COMPLETED",
    user: currentUser,
    path: "/internal/dispatch",
    description: `${assignment.team.name} completed physical verification for ${assignment.order.orderNumber}.`,
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/qc");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(dispatchUrl("success", "check-completed"));
}


export async function resolvePhysicalBlockerAction(formData: FormData) {
  const currentUser = await assertPhysicalAccess();

  if (!hasAnyRole(currentUser.roles, MANAGER_ROLES)) {
    redirect(dispatchUrl("error", "permission-denied"));
  }

  const assignmentId = cleanText(formData.get("assignmentId"));
  const resolutionNote = cleanText(formData.get("resolutionNote"));

  if (!assignmentId) redirect(dispatchUrl("error", "missing-assignment"));
  if (!resolutionNote) redirect(dispatchUrl("error", "resolution-note-required"));

  const assignment = await prisma.orderPhysicalAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      team: {
        include: {
          members: {
            where: { user: { status: "ACTIVE" } },
            select: { userId: true },
          },
        },
      },
      order: true,
      items: {
        include: {
          orderItem: { include: { product: true } },
        },
      },
    },
  });

  if (!assignment) redirect(dispatchUrl("error", "assignment-not-found"));
  if (assignment.status !== PhysicalCheckStatus.ISSUE_REPORTED) {
    redirect(dispatchUrl("error", "invalid-assignment-status"));
  }

  const insufficientItem = assignment.items.find((item) => {
    const orderedQuantity =
      item.orderItem.requestedQuantity > 0
        ? item.orderItem.requestedQuantity
        : item.orderItem.quantity;
    const completeAvailableQuantity =
      item.orderItem.product.quantity + item.orderItem.blockedQuantity;
    return completeAvailableQuantity < orderedQuantity;
  });

  if (insufficientItem) {
    redirect(dispatchUrl("error", "full-stock-required"));
  }

  await prisma.$transaction(async (tx) => {
    // Legacy issue records may still hold an incomplete reservation. Release it
    // before restarting verification so the next check always begins from
    // one complete, unambiguous stock quantity.
    for (const assignmentItem of assignment.items) {
      const blockedQuantity = assignmentItem.orderItem.blockedQuantity;
      if (blockedQuantity <= 0) continue;

      const product = assignmentItem.orderItem.product;
      const nextQuantity = product.quantity + blockedQuantity;
      const nextBlocked = Math.max(0, product.blocked - blockedQuantity);

      await tx.product.update({
        where: { id: product.id },
        data: {
          quantity: nextQuantity,
          blocked: nextBlocked,
          status: getProductStatus(nextQuantity, product.minimumStock),
        },
      });

      await tx.orderItem.update({
        where: { id: assignmentItem.orderItemId },
        data: { blockedQuantity: 0 },
      });

      await closeStockBlockTimeline({
        client: tx,
        orderId: assignment.orderId,
        orderItemId: assignmentItem.orderItemId,
        productId: product.id,
        quantity: blockedQuantity,
        currentUser,
        status: "RELEASED",
        releaseReason: "MANUAL_RELEASE",
        notes: `Released ${blockedQuantity} legacy incomplete reservation before full verification restart.`,
      });
    }

    await tx.orderPhysicalAssignmentItem.updateMany({
      where: { assignmentId: assignment.id },
      data: {
        verifiedQuantity: null,
        damagedQuantity: 0,
        shortQuantity: 0,
        notes: null,
        checkedById: null,
        checkedByName: null,
        checkedAt: null,
      },
    });

    await tx.orderPhysicalAssignment.update({
      where: { id: assignment.id },
      data: {
        status: PhysicalCheckStatus.ASSIGNED,
        startedById: null,
        startedByName: null,
        startedAt: null,
        completedById: null,
        completedByName: null,
        completedAt: null,
        issueType: null,
        issueNotes: null,
      },
    });

    const otherAssignments = await tx.orderPhysicalAssignment.findMany({
      where: { orderId: assignment.orderId, id: { not: assignment.id } },
      select: { status: true },
    });
    const nextStatus = otherAssignments.some(
      (row) => row.status === PhysicalCheckStatus.ISSUE_REPORTED,
    )
      ? OrderStatus.PHYSICAL_CHECK_ISSUE
      : OrderStatus.PHYSICAL_CHECK_ASSIGNED;

    await tx.order.update({
      where: { id: assignment.orderId },
      data: { status: nextStatus },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: assignment.orderId,
      fromStatus: assignment.order.status,
      toStatus: nextStatus,
      title: "Stock Blocker Resolved",
      description: `${assignment.team.name}: ${resolutionNote}. Full physical verification must restart before QC.`,
      currentUser,
    });

    if (assignment.revision > 0 || assignment.qcRejectedAt) {
      await resumeAutomatedTask({
        client: tx,
        automationKey: workflowTaskKeys.qcRework(assignment.id),
        actor: currentUser,
        message: `${currentUser.name} resolved the rework blocker: ${resolutionNote}`,
        fallbackStatus: "TODO",
      });
    } else {
      await resumeAutomatedTask({
        client: tx,
        automationKey: workflowTaskKeys.physicalVerification(assignment.id),
        actor: currentUser,
        message: `${currentUser.name} resolved the stock blocker: ${resolutionNote}`,
        fallbackStatus: "TODO",
      });
    }

    await createWorkflowNotification({
      client: tx,
      title: `Physical verification restart: ${assignment.order.orderNumber}`,
      message: "Full stock is available. Restart the complete physical verification for every assigned item.",
      module: "DISPATCH",
      href: "/internal/dispatch",
      orderId: assignment.orderId,
      actor: currentUser,
      recipientUserIds: assignment.team.members.map((member) => member.userId),
      priority: "HIGH_ALERT",
    });
  });

  await createSecurityAuditLog({
    eventType: "PHYSICAL_CHECK_COMPLETED",
    user: currentUser,
    path: "/internal/dispatch",
    description: `${assignment.order.orderNumber}: ${resolutionNote}`,
  });

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/qc");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");

  redirect(dispatchUrl("success", "blocker-resolved"));
}

export async function approveCancellationRequestAction(formData: FormData) {
  const currentUser = await assertPhysicalAccess();

  if (!hasAnyRole(currentUser.roles, MANAGER_ROLES)) {
    redirect(dispatchUrl("error", "permission-denied"));
  }

  const orderId = cleanText(formData.get("orderId"));
  const approvalNote = cleanText(formData.get("approvalNote"));

  if (!orderId) redirect(dispatchUrl("error", "missing-order"));
  if (approvalNote.length > 1000) {
    redirect(dispatchUrl("error", "cancellation-approval-note-too-long"));
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM public."Order" WHERE "id" = ${orderId} FOR UPDATE
    `;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) return { error: "order-not-found" as const };
    if (order.status !== CANCELLATION_REQUESTED_STATUS) {
      return { error: "invalid-status" as const };
    }

    let releasedQuantity = 0;
    let cancelledRemainingQuantity = 0;

    for (const item of order.items) {
      const closure = getCancellationClosureQuantities(item);
      const blockedQuantity = item.blockedQuantity;
      cancelledRemainingQuantity += closure.cancelled;
      releasedQuantity += blockedQuantity;

      if (blockedQuantity > 0) {
        const released = await tx.product.updateMany({
          where: { id: item.productId, blocked: { gte: blockedQuantity } },
          data: {
            quantity: { increment: blockedQuantity },
            blocked: { decrement: blockedQuantity },
          },
        });
        if (released.count !== 1) {
          throw new Error(`Stock release integrity failed for ${item.product.code}.`);
        }

        const updatedProduct = await tx.product.findUniqueOrThrow({
          where: { id: item.productId },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: {
            status: getProductStatus(
              updatedProduct.quantity,
              item.product.minimumStock,
            ),
          },
        });

        await closeStockBlockTimeline({
          client: tx,
          orderId: order.id,
          orderItemId: item.id,
          productId: item.productId,
          quantity: blockedQuantity,
          currentUser,
          status: "RELEASED",
          releaseReason: "CANCELLATION_APPROVED",
          notes: `${blockedQuantity} reserved quantity released after cancellation approval.`,
        });
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          requestedQuantity: closure.requested,
          quantity: closure.workingQuantity,
          blockedQuantity: 0,
          cancelledQuantity: closure.cancelled,
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELLED,
        assignedDriverId: null,
        transportOptionId: null,
        transportLabel: null,
        cancellationDecidedAt: new Date(),
        cancellationDecidedById: currentUser.id,
        cancellationDecidedByName: currentUser.name,
        cancellationDecisionReason:
          approvalNote || "Cancellation approved by management.",
      },
    });

    await tx.orderPhysicalAssignment.updateMany({
      where: { orderId: order.id },
      data: { status: PhysicalCheckStatus.CANCELLED },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: order.status,
      toStatus: OrderStatus.CANCELLED,
      title: "Cancellation Approved",
      description: `${cancelledRemainingQuantity} ordered quantity cancelled. ${releasedQuantity} reserved quantity released.${approvalNote ? ` Note: ${approvalNote}` : ""}`,
      currentUser,
    });

    await cancelAutomatedTasksForOrder({
      client: tx,
      orderId: order.id,
      actor: currentUser,
      message: `${currentUser.name} approved cancellation for ${order.orderNumber}.`,
    });

    await createWorkflowNotification({
      client: tx,
      title: "Cancellation approved",
      message: `${order.orderNumber} cancellation was approved by ${currentUser.name}.`,
      module: "ORDERS",
      href: `/dealer/orders?selected=${order.id}`,
      orderId: order.id,
      actor: currentUser,
      recipientUserIds: [order.dealerId],
      priority: "HIGH",
    });

    return { error: null };
  });

  if (result.error) redirect(dispatchUrl("error", result.error));

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/qc");
  revalidatePath("/internal/inventory");
  revalidatePath("/dealer/orders");
  revalidatePath("/field/deliveries");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
  redirect(dispatchUrl("success", "cancellation-approved"));
}

export async function rejectCancellationRequestAction(formData: FormData) {
  const currentUser = await assertPhysicalAccess();

  if (!hasAnyRole(currentUser.roles, MANAGER_ROLES)) {
    redirect(dispatchUrl("error", "permission-denied"));
  }

  const orderId = cleanText(formData.get("orderId"));
  const rejectionReason = cleanText(formData.get("rejectionReason"));

  if (!orderId) redirect(dispatchUrl("error", "missing-order"));
  if (!rejectionReason || rejectionReason.length > 1000) {
    redirect(dispatchUrl("error", "cancellation-rejection-reason-required"));
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM public."Order" WHERE "id" = ${orderId} FOR UPDATE
    `;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        dealerId: true,
        status: true,
        cancellationPreviousStatus: true,
      },
    });

    if (!order) return { error: "order-not-found" as const };
    if (order.status !== CANCELLATION_REQUESTED_STATUS) {
      return { error: "invalid-status" as const };
    }

    const previousStatus = order.cancellationPreviousStatus;
    const invalidRestoreStatuses: OrderStatus[] = [
      OrderStatus.CANCELLATION_REQUESTED,
      OrderStatus.CANCELLED,
      OrderStatus.DELIVERED,
      OrderStatus.INVOICE_UPLOADED,
    ];

    if (!previousStatus || invalidRestoreStatuses.includes(previousStatus)) {
      return { error: "cancellation-previous-status-missing" as const };
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: previousStatus,
        cancellationDecidedAt: new Date(),
        cancellationDecidedById: currentUser.id,
        cancellationDecidedByName: currentUser.name,
        cancellationDecisionReason: rejectionReason,
      },
    });

    await recordOrderStatusHistory({
      client: tx as unknown as HistoryClient,
      orderId: order.id,
      fromStatus: CANCELLATION_REQUESTED_STATUS,
      toStatus: previousStatus,
      title: "Cancellation Rejected",
      description: `${currentUser.name} rejected the cancellation request. Reason: ${rejectionReason}`,
      currentUser,
    });

    await resumeAutomatedTasksForOrder({
      client: tx,
      orderId: order.id,
      actor: currentUser,
      message: `${currentUser.name} rejected cancellation and restored ${previousStatus.replaceAll("_", " ").toLowerCase()}.`,
    });

    await createWorkflowNotification({
      client: tx,
      title: "Cancellation request rejected",
      message: `${order.orderNumber} cancellation request was rejected. Reason: ${rejectionReason}`,
      module: "ORDERS",
      href: `/dealer/orders?selected=${order.id}`,
      orderId: order.id,
      actor: currentUser,
      recipientUserIds: [order.dealerId],
      priority: "HIGH",
    });

    return { error: null };
  });

  if (result.error) redirect(dispatchUrl("error", result.error));

  revalidatePath("/internal/dispatch");
  revalidatePath("/internal/qc");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/dealer/orders");
  revalidatePath("/internal/dashboard");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/tasks");
  redirect(dispatchUrl("success", "cancellation-rejected"));
}
