"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  isGoogleCalendarConfigured,
  syncTaskToGoogleCalendar,
} from "@/lib/google-calendar";
import { createWorkflowNotification } from "@/lib/notifications";
import { sendDueTaskReminders } from "@/lib/work-task-reminders";
import { hasPermission } from "@/lib/permissions";
import { UserRole, WorkTeamMemberRole, WorkTeamType } from "@/generated/prisma/client";
import { createSecurityAuditLog } from "@/lib/security-audit";
import {
  createTaskActivity,
  generateTaskNumber,
  getTaskNotificationRecipients,
  normalizeCalendarStatus,
  normalizeDateTimeLocal,
  normalizeTaskType,
  taskPriorities,
  taskStatuses,
  userCanAccessTask,
} from "@/lib/work-tasks";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanOptional(value: FormDataEntryValue | null) {
  const text = cleanText(value);
  return text || null;
}

function normalizeStatus(value: string) {
  return taskStatuses.includes(value as (typeof taskStatuses)[number]) ? value : "TODO";
}

async function updateTaskCalendarSyncSuccess({
  taskId,
  eventId,
}: {
  taskId: string;
  eventId: string;
}) {
  await prisma.$executeRaw`
    UPDATE public."WorkTask"
    SET
      "calendarStatus" = 'SYNCED',
      "calendarEventId" = ${eventId},
      "calendarSyncedAt" = CURRENT_TIMESTAMP,
      "googleSyncError" = NULL
    WHERE "id" = ${taskId}
  `;
}

async function updateTaskCalendarSyncFailure({
  taskId,
  message,
}: {
  taskId: string;
  message: string;
}) {
  try {
    await prisma.$executeRaw`
      UPDATE public."WorkTask"
      SET
        "calendarStatus" = 'SYNC_FAILED',
        "googleSyncError" = ${message.slice(0, 1000)}
      WHERE "id" = ${taskId}
    `;
  } catch {
    // If the deployment is missing the latest Jira calendar migration, do not
    // crash the screen while reporting the original Google sync failure.
  }
}

function normalizePriority(value: string) {
  return taskPriorities.includes(value as (typeof taskPriorities)[number]) ? value : "MEDIUM";
}

function taskRedirect(message: string): never {
  redirect(`/internal/tasks?error=${encodeURIComponent(message)}`);
}

async function validateTaskRelations({
  teamId,
  assigneeId,
  parentTaskId,
}: {
  teamId: string;
  assigneeId?: string | null;
  parentTaskId?: string | null;
}) {
  const [team, assigneeMembership, parentTask] = await Promise.all([
    prisma.workTeam.findFirst({
      where: { id: teamId, isActive: true },
      select: { id: true, name: true },
    }),
    assigneeId
      ? prisma.workTeamMember.findUnique({
          where: {
            teamId_userId: {
              teamId,
              userId: assigneeId,
            },
          },
          select: {
            userId: true,
          },
        })
      : null,
    parentTaskId
      ? prisma.workTask.findUnique({
          where: { id: parentTaskId },
          select: {
            id: true,
            teamId: true,
            status: true,
            parentTaskId: true,
            taskNumber: true,
          },
        })
      : null,
  ]);

  if (!team) {
    taskRedirect("invalid-team");
  }

  if (assigneeId && !assigneeMembership) {
    taskRedirect("assignee-must-belong-to-selected-team");
  }

  if (parentTaskId) {
    if (!parentTask) {
      taskRedirect("parent-task-not-found");
    }

    if (parentTask.teamId !== teamId) {
      taskRedirect("parent-task-must-belong-to-same-team");
    }

    if (parentTask.parentTaskId) {
      taskRedirect("nested-subtasks-are-not-allowed");
    }

    if (parentTask.status === "DONE" || parentTask.status === "CANCELLED") {
      taskRedirect("cannot-add-subtask-to-closed-task");
    }
  }

  return { team };
}

async function notifyTaskStakeholders({
  taskId,
  taskNumber,
  title,
  teamId,
  assigneeId,
  actor,
  event,
  message,
  urgent = false,
  includeAllTeamMembers = false,
  includeManagers = false,
}: {
  taskId: string;
  taskNumber: string;
  title: string;
  teamId: string;
  assigneeId?: string | null;
  actor: Awaited<ReturnType<typeof getCurrentUser>>;
  event: string;
  message: string;
  urgent?: boolean;
  includeAllTeamMembers?: boolean;
  includeManagers?: boolean;
}) {
  const recipientUserIds = await getTaskNotificationRecipients({
    teamId,
    assigneeId,
    includeAllTeamMembers,
    excludeUserId: actor.id,
  });

  await createWorkflowNotification({
    title: event,
    message: `${taskNumber}: ${title}. ${message}`,
    module: "tasks",
    href: "/account/tasks",
    actor,
    recipientUserIds,
    recipientRoles: includeManagers ? ["owner", "manager"] : [],
    priority: urgent ? "URGENT" : "NORMAL",
  });

  await createTaskActivity({
    taskId,
    actorId: actor.id,
    eventType: "NOTIFICATION_SENT",
    message: `${event} notification sent to task stakeholders.`,
  });
}

const roleTaskLabels: Partial<Record<UserRole, string>> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  ACCOUNTANT: "Accountant",
  DISPATCH_TEAM: "Physical Team Staff",
  ORDER_TEAM: "Order Receiving Team",
  QC_TEAM: "QC Team",
  DRIVER_TRANSPORT: "Driver / Transport",
  COLLECTION_TEAM: "Collection Team",
  SALES_FIELD_TEAM: "Sales / Field Team",
};

const assignableTaskRoles = new Set<UserRole>([
  UserRole.OWNER,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.DISPATCH_TEAM,
  UserRole.ORDER_TEAM,
  UserRole.QC_TEAM,
  UserRole.DRIVER_TRANSPORT,
  UserRole.COLLECTION_TEAM,
  UserRole.SALES_FIELD_TEAM,
]);

type ManualAssignmentMode = "PERSON" | "ROLE" | "PHYSICAL_TEAM";

type ManualPurpose =
  | "FOLLOW_UP"
  | "OFFICE_WORK"
  | "PAYMENT_COLLECTION"
  | "FIELD_VISIT"
  | "REMINDER"
  | "OTHER";

function normalizeAssignmentMode(value: string): ManualAssignmentMode {
  if (value === "ROLE" || value === "PHYSICAL_TEAM") {
    return value;
  }

  return "PERSON";
}

function normalizeManualPurpose(value: string): ManualPurpose {
  if (
    value === "FOLLOW_UP" ||
    value === "OFFICE_WORK" ||
    value === "PAYMENT_COLLECTION" ||
    value === "FIELD_VISIT" ||
    value === "REMINDER"
  ) {
    return value;
  }

  return "OTHER";
}

function getManualPurposeConfig(purpose: ManualPurpose) {
  switch (purpose) {
    case "FOLLOW_UP":
      return { taskType: "FOLLOW_UP", relatedModule: "GENERAL", label: "Follow-up" };
    case "OFFICE_WORK":
      return { taskType: "TASK", relatedModule: "GENERAL", label: "Office work" };
    case "PAYMENT_COLLECTION":
      return { taskType: "FOLLOW_UP", relatedModule: "PAYMENT", label: "Payment / collection" };
    case "FIELD_VISIT":
      return { taskType: "TASK", relatedModule: "FIELD_VISIT", label: "Field visit" };
    case "REMINDER":
      return { taskType: "REMINDER", relatedModule: "GENERAL", label: "Reminder" };
    case "OTHER":
      return { taskType: "TASK", relatedModule: "GENERAL", label: "Manual task" };
  }
}

async function getOrCreateSystemTaskTeam({
  name,
  marker,
  currentUserId,
}: {
  name: string;
  marker: string;
  currentUserId: string;
}) {
  const existing = await prisma.workTeam.findFirst({
    where: {
      teamType: WorkTeamType.GENERAL,
      description: marker,
    },
    select: {
      id: true,
      name: true,
      teamType: true,
    },
  });

  if (existing) {
    await prisma.workTeam.update({
      where: { id: existing.id },
      data: {
        name,
        isActive: true,
        updatedById: currentUserId,
      },
    });

    return existing;
  }

  return prisma.workTeam.create({
    data: {
      name,
      description: marker,
      teamType: WorkTeamType.GENERAL,
      isActive: true,
      createdById: currentUserId,
      updatedById: currentUserId,
    },
    select: {
      id: true,
      name: true,
      teamType: true,
    },
  });
}

async function resolveManualTaskAssignment({
  assignmentMode,
  assignmentValue,
  currentUserId,
}: {
  assignmentMode: ManualAssignmentMode;
  assignmentValue: string;
  currentUserId: string;
}) {
  if (assignmentMode === "PHYSICAL_TEAM") {
    const team = await prisma.workTeam.findFirst({
      where: {
        id: assignmentValue,
        isActive: true,
        teamType: WorkTeamType.PHYSICAL_DISPATCH,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!team) {
      taskRedirect("physical-team-required");
    }

    return {
      team,
      assigneeId: null,
      assignmentLabel: team.name,
    };
  }

  if (assignmentMode === "ROLE") {
    const role = assignmentValue as UserRole;

    if (!assignableTaskRoles.has(role)) {
      taskRedirect("invalid-task-role");
    }

    const roleLabel = roleTaskLabels[role] ?? role.replaceAll("_", " ");
    const team = await getOrCreateSystemTaskTeam({
      name: `${roleLabel} Task Pool`,
      marker: `[SYSTEM_TASK_ROLE:${role}]`,
      currentUserId,
    });

    const activeUsers = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { role },
          {
            roleAssignments: {
              some: { role },
            },
          },
        ],
      },
      select: { id: true },
    });

    const activeUserIds = activeUsers.map((user) => user.id);

    if (activeUserIds.length > 0) {
      await prisma.$transaction(
        activeUserIds.map((userId) =>
          prisma.workTeamMember.upsert({
            where: {
              teamId_userId: {
                teamId: team.id,
                userId,
              },
            },
            update: {},
            create: {
              teamId: team.id,
              userId,
              role: WorkTeamMemberRole.MEMBER,
              addedById: currentUserId,
            },
          }),
        ),
      );

      await prisma.workTeamMember.deleteMany({
        where: {
          teamId: team.id,
          userId: { notIn: activeUserIds },
        },
      });
    } else {
      await prisma.workTeamMember.deleteMany({
        where: { teamId: team.id },
      });
    }

    return {
      team,
      assigneeId: null,
      assignmentLabel: roleLabel,
    };
  }

  const person = await prisma.user.findFirst({
    where: {
      id: assignmentValue,
      status: "ACTIVE",
      role: { not: UserRole.DEALER },
    },
    select: {
      id: true,
      name: true,
      workTeamMemberships: {
        where: {
          team: { isActive: true },
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              teamType: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!person) {
    taskRedirect("invalid-task-assignee");
  }

  const preferredMembership =
    person.workTeamMemberships.find(
      (membership) => membership.team.teamType === WorkTeamType.PHYSICAL_DISPATCH,
    ) ?? person.workTeamMemberships[0];

  let team = preferredMembership?.team ?? null;

  if (!team) {
    team = await getOrCreateSystemTaskTeam({
      name: "Direct Manual Assignments",
      marker: "[SYSTEM_TASK_DIRECT_ASSIGNMENTS]",
      currentUserId,
    });

    await prisma.workTeamMember.upsert({
      where: {
        teamId_userId: {
          teamId: team.id,
          userId: person.id,
        },
      },
      update: {},
      create: {
        teamId: team.id,
        userId: person.id,
        role: WorkTeamMemberRole.MEMBER,
        addedById: currentUserId,
      },
    });
  }

  return {
    team: {
      id: team.id,
      name: team.name,
    },
    assigneeId: person.id,
    assignmentLabel: person.name,
  };
}

export async function createWorkTask(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_tasks",
    "/internal/tasks",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const creationKind = cleanText(formData.get("creationKind")) === "BLOCKER" ? "BLOCKER" : "MANUAL";
  const purpose = normalizeManualPurpose(cleanText(formData.get("purpose")));
  const assignmentMode = normalizeAssignmentMode(cleanText(formData.get("assignmentMode")));
  const assignmentValue = cleanText(formData.get("assignmentValue"));
  const title = cleanText(formData.get("title"));
  const description = cleanOptional(formData.get("description"));
  const blockerReason = cleanOptional(formData.get("blockerReason"));
  const priority = normalizePriority(cleanText(formData.get("priority")));
  const dueAt = normalizeDateTimeLocal(formData.get("dueAt"));
  const calendarReminderAt = normalizeDateTimeLocal(formData.get("calendarReminderAt"));
  const relatedReference = cleanOptional(formData.get("relatedReference"));
  const calendarNotes = cleanOptional(formData.get("calendarNotes"));

  if (
    !title ||
    title.length > 180 ||
    !assignmentValue ||
    (description?.length ?? 0) > 4000 ||
    (blockerReason?.length ?? 0) > 1200 ||
    (relatedReference?.length ?? 0) > 180 ||
    (calendarNotes?.length ?? 0) > 1200
  ) {
    taskRedirect("manual-task-details-required");
  }

  if (dueAt === undefined || calendarReminderAt === undefined) {
    taskRedirect("invalid-calendar-or-due-date");
  }

  if (creationKind === "BLOCKER" && !blockerReason) {
    taskRedirect("blocker-reason-required");
  }

  const resolvedAssignment = await resolveManualTaskAssignment({
    assignmentMode,
    assignmentValue,
    currentUserId: currentUser.id,
  });

  const purposeConfig = getManualPurposeConfig(purpose);
  const taskType = creationKind === "BLOCKER" ? "BLOCKER" : purposeConfig.taskType;
  const relatedModule = creationKind === "BLOCKER" ? "GENERAL" : purposeConfig.relatedModule;
  const calendarStatus = dueAt ? "READY_TO_SYNC" : "NOT_SYNCED";
  const taskNumber = await generateTaskNumber();

  const task = await prisma.workTask.create({
    data: {
      taskNumber,
      title,
      description,
      teamId: resolvedAssignment.team.id,
      assigneeId: resolvedAssignment.assigneeId,
      priority: priority as never,
      taskType,
      status: creationKind === "BLOCKER" ? "BLOCKED" : "TODO",
      dueAt,
      relatedModule: relatedModule === "GENERAL" ? null : relatedModule,
      relatedReference,
      blockerReason: creationKind === "BLOCKER" ? blockerReason : null,
      calendarStatus,
      calendarReminderAt,
      calendarNotes,
      createdById: currentUser.id,
    },
  });

  await createTaskActivity({
    taskId: task.id,
    actorId: currentUser.id,
    eventType: creationKind === "BLOCKER" ? "BLOCKER_REPORTED" : "MANUAL_TASK_CREATED",
    message:
      creationKind === "BLOCKER"
        ? `Blocker reported and assigned to ${resolvedAssignment.assignmentLabel}.`
        : `${purposeConfig.label} created for ${resolvedAssignment.assignmentLabel}.`,
  });

  if (calendarStatus === "READY_TO_SYNC") {
    await createTaskActivity({
      taskId: task.id,
      actorId: currentUser.id,
      eventType: "CALENDAR_READY",
      message: "Task is ready to be added to Google Calendar when integration is connected.",
    });
  }

  await Promise.allSettled([
    notifyTaskStakeholders({
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      teamId: resolvedAssignment.team.id,
      assigneeId: resolvedAssignment.assigneeId,
      actor: currentUser,
      event:
        creationKind === "BLOCKER"
          ? "New blocker requires action"
          : resolvedAssignment.assigneeId
            ? "New manual task assigned to you"
            : "New manual task assigned",
      message: `${resolvedAssignment.assignmentLabel} is responsible for this work.`,
      urgent: creationKind === "BLOCKER" || priority === "URGENT" || priority === "CRITICAL",
      includeAllTeamMembers: !resolvedAssignment.assigneeId,
      includeManagers: creationKind === "BLOCKER" || priority === "CRITICAL",
    }),
    createSecurityAuditLog({
      eventType: "WORK_TASK_CREATED",
      user: currentUser,
      path: "/internal/tasks",
      description: `Created ${creationKind === "BLOCKER" ? "blocker" : "manual task"} ${task.taskNumber}: ${task.title}.`,
    }),
  ]);

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
  redirect(
    `/internal/tasks?success=${creationKind === "BLOCKER" ? "blocker-created" : "task-created"}&taskNumber=${encodeURIComponent(task.taskNumber)}`,
  );
}

async function getWorkTaskAutomationState(taskId: string) {
  const rows = await prisma.$queryRaw<Array<{ isAutomated: boolean }>>`
    SELECT "isAutomated"
    FROM public."WorkTask"
    WHERE "id" = ${taskId}
    LIMIT 1
  `;
  return rows[0]?.isAutomated ?? false;
}

export async function updateWorkTaskStatus(formData: FormData) {
  const currentUser = await getCurrentUser();
  const taskId = cleanText(formData.get("taskId"));
  const status = normalizeStatus(cleanText(formData.get("status")));

  if (!taskId) {
    redirect("/account/tasks?error=task-missing");
  }

  const canManageAll = hasPermission(currentUser.roles, "manage_work_tasks");
  const canAccess = canManageAll || (await userCanAccessTask(currentUser, taskId));

  if (!canAccess) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: "/account/tasks",
      description: "User tried to update a task without membership or assignment.",
    });
    redirect("/account/tasks?error=task-access-denied");
  }

  const existingTask = await prisma.workTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      status: true,
      teamId: true,
      assigneeId: true,
      taskType: true,
      priority: true,
      subTasks: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!existingTask) {
    redirect("/account/tasks?error=task-not-found");
  }

  const isAutomated = await getWorkTaskAutomationState(taskId);

  if (
    isAutomated &&
    (status === "DONE" || status === "CANCELLED" || status === "BLOCKED")
  ) {
    redirect("/account/tasks?error=automated-task-workflow-controlled");
  }

  const openSubtasks = existingTask.subTasks.filter(
    (subtask) => subtask.status !== "DONE" && subtask.status !== "CANCELLED",
  );

  if (status === "DONE" && openSubtasks.length > 0) {
    redirect("/account/tasks?error=close-subtasks-before-done");
  }

  await prisma.workTask.update({
    where: { id: taskId },
    data: {
      status: status as never,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });

  await createTaskActivity({
    taskId,
    actorId: currentUser.id,
    eventType: "STATUS_CHANGED",
    message: `${currentUser.name} moved status from ${existingTask.status} to ${status}.`,
  });

  if (status === "BLOCKED" || status === "REVIEW" || status === "DONE") {
    await notifyTaskStakeholders({
      taskId,
      taskNumber: existingTask.taskNumber,
      title: existingTask.title,
      teamId: existingTask.teamId,
      assigneeId: existingTask.assigneeId,
      actor: currentUser,
      event: status === "BLOCKED" ? "Task blocked" : `Task moved to ${status}`,
      message:
        status === "BLOCKED"
          ? "Manager/team lead review is required."
          : `${currentUser.name} updated the task status.`,
      urgent: status === "BLOCKED",
      includeManagers: status === "BLOCKED",
    });
  }

  await createSecurityAuditLog({
    eventType: "WORK_TASK_STATUS_CHANGED",
    user: currentUser,
    path: "/internal/tasks",
    description: `Changed ${existingTask.taskNumber} status to ${status}.`,
  });

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
}

export async function addWorkTaskComment(formData: FormData) {
  const currentUser = await getCurrentUser();
  const taskId = cleanText(formData.get("taskId"));
  const body = cleanText(formData.get("body"));

  if (!taskId || !body || body.length > 4000) {
    redirect("/account/tasks?error=comment-invalid");
  }

  const canManageAll = hasPermission(currentUser.roles, "manage_work_tasks");
  const canAccess = canManageAll || (await userCanAccessTask(currentUser, taskId));

  if (!canAccess) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: "/account/tasks",
      description: "User tried to comment on a task without membership or assignment.",
    });
    redirect("/account/tasks?error=task-access-denied");
  }

  const [comment, task] = await prisma.$transaction([
    prisma.workTaskComment.create({
      data: {
        taskId,
        createdById: currentUser.id,
        body,
      },
    }),
    prisma.workTask.findUnique({
      where: { id: taskId },
      select: {
        taskNumber: true,
        title: true,
        teamId: true,
        assigneeId: true,
      },
    }),
  ]);

  await createTaskActivity({
    taskId,
    actorId: currentUser.id,
    eventType: "COMMENT_ADDED",
    message: `${currentUser.name} added a comment.`,
  });

  if (task) {
    await notifyTaskStakeholders({
      taskId,
      taskNumber: task.taskNumber,
      title: task.title,
      teamId: task.teamId,
      assigneeId: task.assigneeId,
      actor: currentUser,
      event: "Task comment added",
      message: body.slice(0, 160),
    });
  }

  await createSecurityAuditLog({
    eventType: "WORK_TASK_COMMENTED",
    user: currentUser,
    path: "/account/tasks",
    description: `Added comment ${comment.id} to task ${taskId}.`,
  });

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
}

export async function syncWorkTaskGoogleCalendar(formData: FormData) {
  const currentUser = await getCurrentUser();
  const taskId = cleanText(formData.get("taskId"));
  const returnTo = cleanText(formData.get("returnTo"));
  const redirectTo = returnTo === "/account/tasks" ? "/account/tasks" : "/internal/tasks";

  if (!isGoogleCalendarConfigured()) {
    redirect(`${redirectTo}?error=google-calendar-not-configured`);
  }

  if (!taskId) {
    redirect(`${redirectTo}?error=task-missing`);
  }

  const canManageAll = hasPermission(currentUser.roles, "manage_work_tasks");
  const canAccess = canManageAll || (await userCanAccessTask(currentUser, taskId));

  if (!canAccess) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: redirectTo,
      description: "User tried to sync a task with Google Calendar without access.",
    });
    redirect(`${redirectTo}?error=task-access-denied`);
  }

  const task = await prisma.workTask.findUnique({
    where: { id: taskId },
    include: {
      team: {
        include: {
          parentTeam: {
            select: {
              name: true,
            },
          },
        },
      },
      assignee: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!task) {
    redirect(`${redirectTo}?error=task-not-found`);
  }

  if (!task.dueAt) {
    redirect(`${redirectTo}?error=task-due-date-required-for-calendar`);
  }

  const teamName = `${task.team.parentTeam ? `${task.team.parentTeam.name} → ` : ""}${task.team.name}`;
  let calendarSyncSucceeded = false;

  try {
    const syncedEvent = await syncTaskToGoogleCalendar({
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

    await updateTaskCalendarSyncSuccess({
      taskId,
      eventId: syncedEvent.eventId,
    });

    await createTaskActivity({
      taskId,
      actorId: currentUser.id,
      eventType: "GOOGLE_CALENDAR_SYNCED",
      message: `${currentUser.name} synced this task to Google Calendar${syncedEvent.htmlLink ? ` (${syncedEvent.htmlLink})` : ""}.`,
    });

    await notifyTaskStakeholders({
      taskId,
      taskNumber: task.taskNumber,
      title: task.title,
      teamId: task.teamId,
      assigneeId: task.assigneeId,
      actor: currentUser,
      event: "Google Calendar synced",
      message: "Task has been synced with the shared Google Calendar.",
    });

    calendarSyncSucceeded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar sync failed.";

    await updateTaskCalendarSyncFailure({
      taskId,
      message,
    });

    await createTaskActivity({
      taskId,
      actorId: currentUser.id,
      eventType: "GOOGLE_CALENDAR_SYNC_FAILED",
      message: message.slice(0, 1000),
    });
  }

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");

  if (calendarSyncSucceeded) {
    redirect(`${redirectTo}?success=google-calendar-synced`);
  }

  redirect(`${redirectTo}?error=google-calendar-sync-failed`);
}

export async function markWorkTaskCalendarSynced(formData: FormData) {
  const currentUser = await getCurrentUser();
  const taskId = cleanText(formData.get("taskId"));
  const returnTo = cleanText(formData.get("returnTo"));
  const redirectTo = returnTo === "/internal/tasks" ? "/internal/tasks" : "/account/tasks";

  if (!taskId) {
    redirect(`${redirectTo}?error=task-missing`);
  }

  const canManageAll = hasPermission(currentUser.roles, "manage_work_tasks");
  const canAccess = canManageAll || (await userCanAccessTask(currentUser, taskId));

  if (!canAccess) {
    await createSecurityAuditLog({
      eventType: "ACCESS_DENIED",
      user: currentUser,
      path: redirectTo,
      description: "User tried to mark task calendar sync without access.",
    });
    redirect(`${redirectTo}?error=task-access-denied`);
  }

  const task = await prisma.workTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      teamId: true,
      assigneeId: true,
      dueAt: true,
      calendarStatus: true,
      calendarEventId: true,
    },
  });

  if (!task) {
    redirect(`${redirectTo}?error=task-not-found`);
  }

  if (!task.dueAt) {
    redirect(`${redirectTo}?error=task-due-date-required-for-calendar`);
  }

  await updateTaskCalendarSyncSuccess({
    taskId,
    eventId: task.calendarEventId ?? `manual-google-calendar-${Date.now()}`,
  });

  await createTaskActivity({
    taskId,
    actorId: currentUser.id,
    eventType: "CALENDAR_SYNCED",
    message: `${currentUser.name} marked this task as added to Google Calendar.`,
  });

  await notifyTaskStakeholders({
    taskId,
    taskNumber: task.taskNumber,
    title: task.title,
    teamId: task.teamId,
    assigneeId: task.assigneeId,
    actor: currentUser,
    event: "Task added to Google Calendar",
    message: "Calendar status has been marked as synced.",
  });

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
  redirect(redirectTo);
}

export async function reviewWorkTask(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_tasks",
    "/internal/tasks",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const taskId = cleanText(formData.get("taskId"));
  const reviewNotes = cleanOptional(formData.get("reviewNotes"));

  if (!taskId || (reviewNotes?.length ?? 0) > 1200) {
    taskRedirect("review-invalid");
  }

  const task = await prisma.workTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskNumber: true,
      title: true,
      teamId: true,
      assigneeId: true,
      subTasks: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!task) {
    taskRedirect("task-not-found");
  }

  if (await getWorkTaskAutomationState(taskId)) {
    taskRedirect("automated-task-workflow-controlled");
  }

  const openSubtasks = task.subTasks.filter(
    (subtask) => subtask.status !== "DONE" && subtask.status !== "CANCELLED",
  );

  if (openSubtasks.length > 0) {
    taskRedirect("close-subtasks-before-review-complete");
  }

  await prisma.workTask.update({
    where: { id: taskId },
    data: {
      status: "DONE",
      completedAt: new Date(),
      lastReviewedAt: new Date(),
      reviewedById: currentUser.id,
      reviewNotes,
    },
  });

  await createTaskActivity({
    taskId,
    actorId: currentUser.id,
    eventType: "TASK_REVIEWED",
    message: `${currentUser.name} completed review${reviewNotes ? `: ${reviewNotes}` : "."}`,
  });

  await notifyTaskStakeholders({
    taskId,
    taskNumber: task.taskNumber,
    title: task.title,
    teamId: task.teamId,
    assigneeId: task.assigneeId,
    actor: currentUser,
    event: "Task review completed",
    message: "Task has been reviewed and closed.",
  });

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
  redirect("/internal/tasks?success=task-reviewed");
}

export async function runWorkTaskReminderSweep() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_tasks",
    "/internal/tasks",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const result = await sendDueTaskReminders();

  await createSecurityAuditLog({
    eventType: "WORK_TASK_REMINDER_SWEEP",
    user: currentUser,
    path: "/internal/tasks",
    description: `Checked ${result.checked} tasks and sent ${result.sent} reminder notifications.`,
  });

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
  redirect(`/internal/tasks?success=reminders-sent-${result.sent}`);
}

export async function updateWorkTaskAssignment(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_tasks",
    "/internal/tasks",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const taskId = cleanText(formData.get("taskId"));
  const teamId = cleanText(formData.get("teamId"));
  const assigneeId = cleanOptional(formData.get("assigneeId"));
  const priority = normalizePriority(cleanText(formData.get("priority")));
  const taskType = normalizeTaskType(cleanText(formData.get("taskType")));
  const dueAt = normalizeDateTimeLocal(formData.get("dueAt"));
  const calendarReminderAt = normalizeDateTimeLocal(formData.get("calendarReminderAt"));
  const blockerReason = cleanOptional(formData.get("blockerReason"));
  const calendarNotes = cleanOptional(formData.get("calendarNotes"));
  const calendarStatus = normalizeCalendarStatus(cleanText(formData.get("calendarStatus")));

  if (!taskId || !teamId || (blockerReason?.length ?? 0) > 1200 || (calendarNotes?.length ?? 0) > 1200) {
    taskRedirect("assignment-invalid");
  }

  if (dueAt === undefined || calendarReminderAt === undefined) {
    taskRedirect("invalid-calendar-or-due-date");
  }

  if ((taskType === "BLOCKER" || priority === "CRITICAL") && !blockerReason) {
    taskRedirect("blocker-reason-required");
  }

  await validateTaskRelations({
    teamId,
    assigneeId,
  });

  const existingTask = await prisma.workTask.findUnique({
    where: { id: taskId },
    select: {
      taskNumber: true,
      title: true,
      assigneeId: true,
      teamId: true,
      taskType: true,
      blockerReason: true,
    },
  });

  if (!existingTask) {
    taskRedirect("task-not-found");
  }

  const isAutomated = await getWorkTaskAutomationState(taskId);

  if (
    isAutomated &&
    (
      teamId !== existingTask.teamId ||
      taskType !== existingTask.taskType ||
      blockerReason !== existingTask.blockerReason
    )
  ) {
    taskRedirect("automated-task-workflow-controlled");
  }

  const nextCalendarStatus = dueAt && calendarStatus === "NOT_SYNCED"
    ? "READY_TO_SYNC"
    : calendarStatus;

  const task = await prisma.workTask.update({
    where: { id: taskId },
    data: {
      teamId,
      assigneeId,
      priority: priority as never,
      taskType,
      dueAt,
      blockerReason,
      calendarStatus: nextCalendarStatus,
      calendarReminderAt,
      calendarNotes,
    },
  });

  await createTaskActivity({
    taskId: task.id,
    actorId: currentUser.id,
    eventType: "TASK_UPDATED",
    message: `${currentUser.name} updated team, assignee, priority, blocker or calendar details.`,
  });

  const assignmentChanged = existingTask.assigneeId !== assigneeId || existingTask.teamId !== teamId;

  await notifyTaskStakeholders({
    taskId: task.id,
    taskNumber: task.taskNumber,
    title: task.title,
    teamId,
    assigneeId,
    actor: currentUser,
    event: assigneeId
      ? assignmentChanged
        ? "Task assigned to you"
        : "Task assignment updated"
      : "Team task updated",
    message: assigneeId
      ? "This task is assigned to you. Please check My Tasks."
      : "Team pool task has been updated.",
    includeAllTeamMembers: !assigneeId,
  });

  if (taskType === "BLOCKER" || priority === "CRITICAL") {
    await notifyTaskStakeholders({
      taskId: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      teamId,
      assigneeId,
      actor: currentUser,
      event: "Blocker task updated",
      message: blockerReason ?? "Blocker review required.",
      urgent: true,
      includeManagers: true,
    });
  }

  await createSecurityAuditLog({
    eventType: "WORK_TASK_UPDATED",
    user: currentUser,
    path: "/internal/tasks",
    description: `Updated task ${task.taskNumber}.`,
  });

  revalidatePath("/internal/tasks");
  revalidatePath("/account/tasks");
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
}
