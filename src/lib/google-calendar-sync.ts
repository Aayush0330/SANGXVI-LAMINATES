import "server-only";

import { prisma } from "@/lib/db";
import {
  isGoogleCalendarConfigured,
  syncOrderToGoogleCalendar,
  syncTaskToGoogleCalendar,
} from "@/lib/google-calendar";
import { deriveOrderPayment } from "@/lib/order-payment";

export type CalendarEntitySyncResult = {
  entityId: string;
  status: "synced" | "not_configured" | "not_found" | "not_eligible" | "failed";
  eventId?: string;
  error?: string;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

export async function syncTaskCalendarById(
  taskId: string,
): Promise<CalendarEntitySyncResult> {
  if (!isGoogleCalendarConfigured()) {
    return { entityId: taskId, status: "not_configured" };
  }

  const task = await prisma.workTask.findUnique({
    where: { id: taskId },
    include: {
      team: {
        include: {
          parentTeam: {
            select: { name: true },
          },
        },
      },
      assignee: {
        select: { name: true },
      },
    },
  });

  if (!task) {
    return { entityId: taskId, status: "not_found" };
  }

  if (!task.dueAt) {
    await prisma.workTask.update({
      where: { id: task.id },
      data: {
        calendarStatus: "NOT_SYNCED",
        googleSyncError: null,
      },
    });
    return { entityId: taskId, status: "not_eligible" };
  }

  const teamName = `${task.team.parentTeam ? `${task.team.parentTeam.name} → ` : ""}${task.team.name}`;

  try {
    const synced = await syncTaskToGoogleCalendar({
      title: task.title,
      taskNumber: task.taskNumber,
      description: task.description,
      teamName,
      assigneeName: task.assignee?.name ?? null,
      priority: String(task.priority),
      status: String(task.status),
      taskType: task.taskType,
      relatedModule: task.relatedModule,
      relatedReference: task.relatedReference,
      dueAt: task.dueAt,
      calendarReminderAt: task.calendarReminderAt,
      calendarNotes: task.calendarNotes,
      calendarEventId: task.calendarEventId,
    });

    await prisma.workTask.update({
      where: { id: task.id },
      data: {
        calendarStatus: "SYNCED",
        calendarEventId: synced.eventId,
        calendarSyncedAt: new Date(),
        googleSyncError: null,
      },
    });

    return {
      entityId: task.id,
      status: "synced",
      eventId: synced.eventId,
    };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.workTask.update({
      where: { id: task.id },
      data: {
        calendarStatus: "SYNC_FAILED",
        googleSyncError: message,
      },
    });
    return {
      entityId: task.id,
      status: "failed",
      error: message,
    };
  }
}

export async function syncOrderCalendarById(
  orderId: string,
): Promise<CalendarEntitySyncResult> {
  if (!isGoogleCalendarConfigured()) {
    return { entityId: orderId, status: "not_configured" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      dealer: {
        select: {
          name: true,
          phone: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              code: true,
              name: true,
              unit: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    return { entityId: orderId, status: "not_found" };
  }

  const {
    orderAmount,
    amountReceived,
    balanceAmount,
    paymentStatus,
  } = deriveOrderPayment({
    orderAmount: order.items.reduce(
      (sum, item) => sum + Number(item.lineTotal),
      0,
    ),
    amountReceived: order.amountReceived,
  });

  try {
    const synced = await syncOrderToGoogleCalendar({
      orderId: order.id,
      orderNumber: order.orderNumber,
      dealerName: order.dealer.name,
      dealerPhone: order.dealer.phone,
      status: String(order.status),
      paymentTag: String(order.paymentTag),
      paymentStatus,
      orderAmount,
      amountReceived,
      balanceAmount,
      priority: order.priority,
      source: String(order.source),
      requiredBy: order.requiredBy,
      paymentTimelineAt: order.paymentTimelineAt,
      createdAt: order.createdAt,
      productLines: order.items.map(
        (item) =>
          `${item.product.code} · ${item.product.name} · ${item.requestedQuantity || item.quantity} ${item.product.unit}`,
      ),
      notes: order.notes,
      calendarEventId: order.orderCalendarEventId,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        orderAmount,
        amountReceived,
        balanceAmount,
        paymentStatus,
        orderCalendarStatus: "SYNCED",
        orderCalendarEventId: synced.eventId,
        orderCalendarSyncedAt: new Date(),
        orderCalendarSyncError: null,
      },
    });

    return {
      entityId: order.id,
      status: "synced",
      eventId: synced.eventId,
    };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        orderAmount,
        amountReceived,
        balanceAmount,
        paymentStatus,
        orderCalendarStatus: "SYNC_FAILED",
        orderCalendarSyncError: message,
      },
    });
    return {
      entityId: order.id,
      status: "failed",
      error: message,
    };
  }
}

export async function syncPendingGoogleCalendarEvents(limit = 30) {
  const batchSize = Math.min(100, Math.max(1, Math.floor(limit)));

  if (!isGoogleCalendarConfigured()) {
    return {
      configured: false,
      checked: 0,
      synced: 0,
      failed: 0,
    };
  }

  const [orders, tasks] = await Promise.all([
    prisma.order.findMany({
      where: {
        orderCalendarStatus: {
          in: ["READY_TO_SYNC", "SYNC_FAILED"],
        },
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    }),
    prisma.workTask.findMany({
      where: {
        dueAt: { not: null },
        calendarStatus: {
          in: ["READY_TO_SYNC", "SYNC_FAILED"],
        },
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    }),
  ]);

  const candidates = [
    ...orders.map((order) => ({ type: "order" as const, id: order.id })),
    ...tasks.map((task) => ({ type: "task" as const, id: task.id })),
  ].slice(0, batchSize);

  const results: CalendarEntitySyncResult[] = [];

  for (const candidate of candidates) {
    results.push(
      candidate.type === "order"
        ? await syncOrderCalendarById(candidate.id)
        : await syncTaskCalendarById(candidate.id),
    );
  }

  return {
    configured: true,
    checked: results.length,
    synced: results.filter((result) => result.status === "synced").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
}
