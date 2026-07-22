import { prisma } from "./db";
import { createWorkflowNotification } from "./notifications";
import { createTaskActivity, getTaskNotificationRecipients } from "./work-tasks";

const THIRTY_MINUTES = 30 * 60 * 1000;

function isClosed(status: string) {
  return status === "DONE" || status === "CANCELLED";
}

async function notifyTaskReminder({
  taskId,
  title,
  taskNumber,
  teamId,
  assigneeId,
  notificationTitle,
  message,
  urgent = false,
}: {
  taskId: string;
  title: string;
  taskNumber: string;
  teamId: string;
  assigneeId?: string | null;
  notificationTitle: string;
  message: string;
  urgent?: boolean;
}) {
  const recipientUserIds = await getTaskNotificationRecipients({
    teamId,
    assigneeId,
    includeAllTeamMembers: !assigneeId,
  });

  await createWorkflowNotification({
    title: notificationTitle,
    message: `${taskNumber}: ${title}. ${message}`,
    module: "tasks",
    href: "/account/tasks",
    recipientUserIds,
    recipientRoles: urgent ? ["owner", "manager"] : [],
    priority: urgent ? "URGENT" : "HIGH",
  });

  await createTaskActivity({
    taskId,
    eventType: "REMINDER_SENT",
    message: `${notificationTitle}: ${message}`,
  });
}

export async function sendDueTaskReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + THIRTY_MINUTES);

  const tasks = await prisma.workTask.findMany({
    where: {
      status: {
        notIn: ["DONE", "CANCELLED"],
      },
      OR: [
        {
          calendarReminderAt: {
            lte: now,
          },
          calendarReminderSentAt: null,
        },
        {
          dueAt: {
            gte: now,
            lte: soon,
          },
          dueReminderSentAt: null,
        },
        {
          dueAt: {
            lt: now,
          },
          overdueReminderSentAt: null,
        },
      ],
    },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      teamId: true,
      assigneeId: true,
      status: true,
      dueAt: true,
      calendarReminderAt: true,
      calendarReminderSentAt: true,
      dueReminderSentAt: true,
      overdueReminderSentAt: true,
    },
    take: 100,
  });

  let sent = 0;

  for (const task of tasks) {
    if (isClosed(task.status)) {
      continue;
    }

    const updates: {
      calendarReminderSentAt?: Date;
      dueReminderSentAt?: Date;
      overdueReminderSentAt?: Date;
    } = {};

    if (task.calendarReminderAt && task.calendarReminderAt <= now && !task.calendarReminderSentAt) {
      await notifyTaskReminder({
        taskId: task.id,
        title: task.title,
        taskNumber: task.taskNumber,
        teamId: task.teamId,
        assigneeId: task.assigneeId,
        notificationTitle: "Task reminder",
        message: "Calendar reminder time has reached.",
      });
      updates.calendarReminderSentAt = now;
      sent += 1;
    }

    if (task.dueAt && task.dueAt >= now && task.dueAt <= soon && !task.dueReminderSentAt) {
      await notifyTaskReminder({
        taskId: task.id,
        title: task.title,
        taskNumber: task.taskNumber,
        teamId: task.teamId,
        assigneeId: task.assigneeId,
        notificationTitle: "Task due soon",
        message: "This task is due within 30 minutes.",
      });
      updates.dueReminderSentAt = now;
      sent += 1;
    }

    if (task.dueAt && task.dueAt < now && !task.overdueReminderSentAt) {
      await notifyTaskReminder({
        taskId: task.id,
        title: task.title,
        taskNumber: task.taskNumber,
        teamId: task.teamId,
        assigneeId: task.assigneeId,
        notificationTitle: "Task overdue",
        message: "This task is overdue and needs review.",
        urgent: true,
      });
      updates.overdueReminderSentAt = now;
      sent += 1;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.workTask.update({
        where: {
          id: task.id,
        },
        data: updates,
      });
    }
  }

  return {
    checked: tasks.length,
    sent,
  };
}
