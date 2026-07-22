import { randomUUID } from "crypto";
import { prisma } from "./db";
import type { AppUser } from "./current-user";

export const taskStatusLabels: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const taskPriorityLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
  CRITICAL: "Critical",
};

export const taskTypeLabels: Record<string, string> = {
  TASK: "Task",
  ISSUE: "Issue",
  BLOCKER: "Blocker",
  FOLLOW_UP: "Follow-up",
  APPROVAL: "Approval",
  REMINDER: "Reminder",
};

export const taskModuleLabels: Record<string, string> = {
  GENERAL: "General",
  INVENTORY: "Inventory",
  ORDER_RECEIVING: "Order Receiving",
  DISPATCH: "Dispatch",
  QC: "QC",
  TRANSPORT: "Transport",
  COLLECTION: "Collection",
  FIELD_VISIT: "Field Visit",
  DEALER: "Dealer",
  ATTENDANCE: "Attendance",
  PAYMENT: "Payment",
  DELIVERY_PROOF: "Delivery Proof",
};

export const taskCalendarStatusLabels: Record<string, string> = {
  NOT_SYNCED: "Not Synced",
  READY_TO_SYNC: "Ready to Sync",
  SYNCED: "Synced",
  SYNC_FAILED: "Sync Failed",
};

export const taskStatuses = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;

export const taskPriorities = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
  "CRITICAL",
] as const;

export const taskTypes = [
  "TASK",
  "ISSUE",
  "BLOCKER",
  "FOLLOW_UP",
  "APPROVAL",
  "REMINDER",
] as const;

export const taskModules = [
  "GENERAL",
  "INVENTORY",
  "ORDER_RECEIVING",
  "DISPATCH",
  "QC",
  "TRANSPORT",
  "COLLECTION",
  "FIELD_VISIT",
  "DEALER",
  "ATTENDANCE",
  "PAYMENT",
  "DELIVERY_PROOF",
] as const;

export const taskCalendarStatuses = [
  "NOT_SYNCED",
  "READY_TO_SYNC",
  "SYNCED",
  "SYNC_FAILED",
] as const;

export function formatTaskDate(date?: Date | string | null) {
  if (!date) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}

export function formatTaskDateTimeInput(date?: Date | string | null) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(date))
    .replace(" ", "T");
}

function formatGoogleCalendarDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function getTaskGoogleCalendarUrl({
  title,
  taskNumber,
  dueAt,
  calendarReminderAt,
  calendarNotes,
  teamName,
  assigneeName,
  priority,
  status,
  taskType,
  relatedModule,
  relatedReference,
  description,
}: {
  title: string;
  taskNumber: string;
  dueAt?: Date | string | null;
  calendarReminderAt?: Date | string | null;
  calendarNotes?: string | null;
  teamName?: string | null;
  assigneeName?: string | null;
  priority?: string | null;
  status?: string | null;
  taskType?: string | null;
  relatedModule?: string | null;
  relatedReference?: string | null;
  description?: string | null;
}) {
  if (!dueAt) {
    return null;
  }

  const start = new Date(dueAt);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const reminder = calendarReminderAt ? new Date(calendarReminderAt) : null;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const eventTitle = `[${taskNumber}] ${title}`;
  const details = [
    description,
    calendarNotes ? `Calendar notes: ${calendarNotes}` : null,
    `Task type: ${getTaskTypeLabel(taskType)}`,
    `Priority: ${taskPriorityLabels[priority ?? "MEDIUM"] ?? priority ?? "Medium"}`,
    `Status: ${taskStatusLabels[status ?? "TODO"] ?? status ?? "To Do"}`,
    teamName ? `Team: ${teamName}` : null,
    assigneeName ? `Assignee: ${assigneeName}` : "Assignee: Team pool",
    relatedModule ? `Related module: ${getTaskModuleLabel(relatedModule)}` : null,
    relatedReference ? `Related reference: ${relatedReference}` : null,
    reminder && !Number.isNaN(reminder.getTime())
      ? `Reminder: ${formatTaskDate(reminder)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle,
    dates: `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(end)}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function isTaskOverdue(dueAt?: Date | string | null, status?: string | null) {
  if (!dueAt || status === "DONE" || status === "CANCELLED") {
    return false;
  }

  return new Date(dueAt).getTime() < Date.now();
}

export function normalizeDateTimeLocal(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return undefined;
  }

  const date = new Date(`${raw}:00+05:30`);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

export function normalizeTaskType(value: string) {
  return taskTypes.includes(value as (typeof taskTypes)[number]) ? value : "TASK";
}

export function normalizeTaskModule(value: string) {
  return taskModules.includes(value as (typeof taskModules)[number])
    ? value
    : "GENERAL";
}

export function normalizeCalendarStatus(value: string) {
  return taskCalendarStatuses.includes(value as (typeof taskCalendarStatuses)[number])
    ? value
    : "NOT_SYNCED";
}

export function getTaskModuleLabel(module?: string | null) {
  if (!module) {
    return "General";
  }

  return (
    taskModuleLabels[module] ??
    module
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function getTaskTypeLabel(type?: string | null) {
  return taskTypeLabels[type ?? "TASK"] ?? "Task";
}

export function getCalendarStatusLabel(status?: string | null) {
  return taskCalendarStatusLabels[status ?? "NOT_SYNCED"] ?? "Not Synced";
}

export function getWorkflowTaskHref({
  relatedModule,
  orderId,
}: {
  relatedModule?: string | null;
  orderId?: string | null;
}) {
  if (!orderId) return null;

  switch (relatedModule) {
    case "ORDER_RECEIVING":
      return `/internal/order-receiving?orderId=${encodeURIComponent(orderId)}`;
    case "DISPATCH":
      return `/internal/dispatch?orderId=${encodeURIComponent(orderId)}`;
    case "QC":
      return `/internal/qc?orderId=${encodeURIComponent(orderId)}`;
    case "DELIVERY_PROOF":
      return `/internal/delivery-proofs?orderId=${encodeURIComponent(orderId)}`;
    default:
      return `/internal/orders?orderId=${encodeURIComponent(orderId)}`;
  }
}

export function progressPercent(tasks: { status: string }[]) {
  if (tasks.length === 0) {
    return 0;
  }

  const closed = tasks.filter(
    (task) => task.status === "DONE" || task.status === "CANCELLED",
  ).length;

  return Math.round((closed / tasks.length) * 100);
}

export function workloadLabel(activeCount: number) {
  if (activeCount >= 12) {
    return "Heavy";
  }

  if (activeCount >= 6) {
    return "Medium";
  }

  if (activeCount > 0) {
    return "Light";
  }

  return "Clear";
}

export async function generateTaskNumber() {
  const year = new Date().getFullYear();
  return `TASK-${year}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export async function userCanAccessTeamTree(user: AppUser, teamId: string) {
  if (user.role === "owner" || user.role === "manager") {
    return true;
  }

  const membership = await prisma.workTeamMember.findFirst({
    where: {
      userId: user.id,
      teamId,
    },
  });

  return Boolean(membership);
}

export async function userCanManageTeam(user: AppUser, teamId: string) {
  if (user.role === "owner" || user.role === "manager") {
    return true;
  }

  const membership = await prisma.workTeamMember.findFirst({
    where: {
      userId: user.id,
      teamId,
      role: "LEAD",
    },
  });

  return Boolean(membership);
}

export async function userCanAccessTask(user: AppUser, taskId: string) {
  if (user.role === "owner" || user.role === "manager") {
    return true;
  }

  const task = await prisma.workTask.findUnique({
    where: { id: taskId },
    select: {
      assigneeId: true,
      teamId: true,
    },
  });

  if (!task) {
    return false;
  }

  if (task.assigneeId === user.id) {
    return true;
  }

  const membership = await prisma.workTeamMember.findFirst({
    where: {
      userId: user.id,
      teamId: task.teamId,
    },
  });

  return Boolean(membership);
}

export async function getTaskNotificationRecipients({
  teamId,
  assigneeId,
  includeAllTeamMembers = false,
  excludeUserId,
}: {
  teamId: string;
  assigneeId?: string | null;
  includeAllTeamMembers?: boolean;
  excludeUserId?: string | null;
}) {
  const members = await prisma.workTeamMember.findMany({
    where: includeAllTeamMembers
      ? {
          teamId,
        }
      : {
          teamId,
          OR: [
            {
              role: "LEAD",
            },
            ...(assigneeId
              ? [
                  {
                    userId: assigneeId,
                  },
                ]
              : []),
          ],
        },
    select: {
      userId: true,
    },
  });

  return Array.from(
    new Set([
      ...members.map((member) => member.userId),
      ...(assigneeId ? [assigneeId] : []),
    ]),
  ).filter((userId) => userId !== excludeUserId);
}

export async function createTaskActivity({
  taskId,
  actorId,
  eventType,
  message,
}: {
  taskId: string;
  actorId?: string | null;
  eventType: string;
  message: string;
}) {
  await prisma.workTaskActivity.create({
    data: {
      taskId,
      actorId: actorId ?? null,
      eventType,
      message,
    },
  });
}
