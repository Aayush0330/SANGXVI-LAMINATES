import { randomUUID } from "crypto";
import {
  Prisma,
  UserRole,
  WorkTeamMemberRole,
  WorkTeamType,
  type WorkTaskPriority,
  type WorkTaskStatus,
} from "@/generated/prisma/client";
import type { AppUser } from "@/lib/current-user";
import { createWorkflowNotification } from "@/lib/notifications";

export type WorkflowTaskClient = Prisma.TransactionClient;

export const workflowStages = {
  ORDER_RECEIVING: "ORDER_RECEIVING",
  PHYSICAL_VERIFICATION: "PHYSICAL_VERIFICATION",
  QC_REVIEW: "QC_REVIEW",
  QC_REWORK: "QC_REWORK",
  PROOF_ASSISTANCE: "PROOF_ASSISTANCE",
} as const;

const rolePoolLabels: Partial<Record<UserRole, string>> = {
  [UserRole.OWNER]: "Owner Workflow Pool",
  [UserRole.MANAGER]: "Manager Workflow Pool",
  [UserRole.ORDER_TEAM]: "Order Receiving Workflow Pool",
  [UserRole.QC_TEAM]: "QC Workflow Pool",
  [UserRole.DRIVER_TRANSPORT]: "Driver Workflow Pool",
};

type LockedTaskRow = {
  id: string;
  taskNumber: string;
  title: string;
  teamId: string;
  assigneeId: string | null;
  status: string;
  statusBeforeBlock: string | null;
  workflowPauseReason?: string | null;
  workflowPausePreviousStatus?: string | null;
};


function taskNumber() {
  return `TASK-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export const workflowTaskKeys = {
  orderReceiving: (orderId: string) => `ORDER:${orderId}:RECEIVING`,
  physicalVerification: (assignmentId: string) =>
    `PHYSICAL:${assignmentId}:VERIFICATION`,
  qcReview: (orderId: string) => `ORDER:${orderId}:QC_REVIEW`,
  qcRework: (assignmentId: string) => `PHYSICAL:${assignmentId}:QC_REWORK`,
  proofAssistance: (orderId: string) => `ORDER:${orderId}:PROOF_ASSISTANCE`,
};

async function getOrCreateRolePool(
  client: WorkflowTaskClient,
  role: UserRole,
  actorId?: string | null,
) {
  const marker = `[SYSTEM_WORKFLOW_ROLE:${role}]`;
  const name = rolePoolLabels[role] ?? `${role.replaceAll("_", " ")} Workflow Pool`;

  let team = await client.workTeam.findFirst({
    where: {
      teamType: WorkTeamType.GENERAL,
      description: marker,
    },
    select: { id: true, name: true },
  });

  if (!team) {
    team = await client.workTeam.create({
      data: {
        name,
        description: marker,
        teamType: WorkTeamType.GENERAL,
        isActive: true,
        createdById: actorId ?? null,
        updatedById: actorId ?? null,
      },
      select: { id: true, name: true },
    });
  } else {
    await client.workTeam.update({
      where: { id: team.id },
      data: {
        name,
        isActive: true,
        updatedById: actorId ?? undefined,
      },
    });
  }

  const poolRoles = role === UserRole.MANAGER
    ? [UserRole.OWNER, UserRole.MANAGER]
    : [role];

  const users = await client.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { role: { in: poolRoles } },
        {
          roleAssignments: {
            some: { role: { in: poolRoles } },
          },
        },
      ],
    },
    select: { id: true },
  });

  const userIds = users.map((user) => user.id);

  for (const userId of userIds) {
    await client.workTeamMember.upsert({
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
        addedById: actorId ?? null,
      },
    });
  }

  await client.workTeamMember.deleteMany({
    where: {
      teamId: team.id,
      ...(userIds.length > 0 ? { userId: { notIn: userIds } } : {}),
    },
  });

  return { ...team, userIds };
}

async function getTeamRecipients(client: WorkflowTaskClient, teamId: string) {
  const rows = await client.workTeamMember.findMany({
    where: {
      teamId,
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

async function lockedTaskByKey(
  client: WorkflowTaskClient,
  automationKey: string,
) {
  const rows = await client.$queryRaw<LockedTaskRow[]>`
    SELECT
      "id",
      "taskNumber",
      "title",
      "teamId",
      "assigneeId",
      "status"::text AS "status",
      "statusBeforeBlock"::text AS "statusBeforeBlock",
      "workflowPauseReason",
      "workflowPausePreviousStatus"::text AS "workflowPausePreviousStatus"
    FROM public."WorkTask"
    WHERE "automationKey" = ${automationKey}
    LIMIT 1
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function createActivity(
  client: WorkflowTaskClient,
  taskId: string,
  actorId: string | null | undefined,
  eventType: string,
  message: string,
) {
  await client.workTaskActivity.create({
    data: {
      taskId,
      actorId: actorId ?? null,
      eventType,
      message,
    },
  });
}

async function ensureAutomatedTask({
  client,
  automationKey,
  orderId,
  workflowStage,
  sourceEvent,
  title,
  description,
  relatedModule,
  relatedReference,
  priority = "HIGH",
  taskType = "TASK",
  teamId,
  role,
  assigneeId,
  actor,
  reopenClosed = false,
  notificationTitle,
  notificationMessage,
}: {
  client: WorkflowTaskClient;
  automationKey: string;
  orderId: string;
  workflowStage: string;
  sourceEvent: string;
  title: string;
  description: string;
  relatedModule: string;
  relatedReference: string;
  priority?: WorkTaskPriority;
  taskType?: string;
  teamId?: string;
  role?: UserRole;
  assigneeId?: string | null;
  actor: AppUser;
  reopenClosed?: boolean;
  notificationTitle: string;
  notificationMessage: string;
}) {
  let resolvedTeamId = teamId;
  let recipientUserIds: string[] = [];

  if (role) {
    const rolePool = await getOrCreateRolePool(client, role, actor.id);
    resolvedTeamId = rolePool.id;
    recipientUserIds = rolePool.userIds;
  }

  if (!resolvedTeamId) {
    throw new Error(`WORKFLOW_TASK_TEAM_REQUIRED:${automationKey}`);
  }

  if (recipientUserIds.length === 0) {
    recipientUserIds = await getTeamRecipients(client, resolvedTeamId);
  }

  const refreshExistingTask = async (existing: LockedTaskRow) => {
    const shouldReopen =
      reopenClosed &&
      (existing.status === "DONE" || existing.status === "CANCELLED");
    const nextStatus = shouldReopen ? "TODO" : existing.status;

    await client.$executeRaw`
      UPDATE public."WorkTask"
      SET
        "title" = ${title.slice(0, 250)},
        "description" = ${description.slice(0, 2000)},
        "teamId" = ${resolvedTeamId},
        "assigneeId" = ${assigneeId ?? null},
        "priority" = ${priority}::public."WorkTaskPriority",
        "taskType" = ${taskType},
        "relatedModule" = ${relatedModule},
        "relatedReference" = ${relatedReference},
        "sourceEvent" = ${sourceEvent},
        "status" = ${nextStatus}::public."WorkTaskStatus",
        "statusBeforeBlock" = CASE WHEN ${shouldReopen} THEN NULL ELSE "statusBeforeBlock" END,
        "workflowPauseReason" = CASE WHEN ${shouldReopen} THEN NULL ELSE "workflowPauseReason" END,
        "workflowPausePreviousStatus" = CASE WHEN ${shouldReopen} THEN NULL ELSE "workflowPausePreviousStatus" END,
        "blockerReason" = CASE WHEN ${shouldReopen} THEN NULL ELSE "blockerReason" END,
        "completedAt" = CASE WHEN ${shouldReopen} THEN NULL ELSE "completedAt" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existing.id}
    `;

    if (shouldReopen) {
      await createActivity(
        client,
        existing.id,
        actor.id,
        "WORKFLOW_TASK_REOPENED",
        `${actor.name} reopened this automated workflow task after the workflow restarted.`,
      );
      await createWorkflowNotification({
        client,
        title: notificationTitle,
        message: notificationMessage,
        module: "tasks",
        href: "/account/tasks",
        orderId,
        actor,
        recipientUserIds,
        priority:
          priority === "CRITICAL" || priority === "URGENT"
            ? "URGENT"
            : "HIGH",
      });
    }

    return { id: existing.id, created: false, reopened: shouldReopen };
  };

  const existing = await lockedTaskByKey(client, automationKey);
  if (existing) {
    return refreshExistingTask(existing);
  }

  const id = randomUUID();
  const number = taskNumber();
  const inserted = await client.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public."WorkTask" (
      "id",
      "taskNumber",
      "title",
      "description",
      "teamId",
      "assigneeId",
      "createdById",
      "orderId",
      "automationKey",
      "isAutomated",
      "workflowStage",
      "sourceEvent",
      "status",
      "priority",
      "taskType",
      "relatedModule",
      "relatedReference",
      "calendarStatus",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${number},
      ${title.slice(0, 250)},
      ${description.slice(0, 2000)},
      ${resolvedTeamId},
      ${assigneeId ?? null},
      NULL,
      ${orderId},
      ${automationKey},
      TRUE,
      ${workflowStage},
      ${sourceEvent},
      'TODO'::public."WorkTaskStatus",
      ${priority}::public."WorkTaskPriority",
      ${taskType},
      ${relatedModule},
      ${relatedReference},
      'NOT_SYNCED',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("automationKey") DO NOTHING
    RETURNING "id"
  `;

  if (inserted.length === 0) {
    const racedTask = await lockedTaskByKey(client, automationKey);
    if (!racedTask) {
      throw new Error(`WORKFLOW_TASK_IDEMPOTENCY_FAILURE:${automationKey}`);
    }
    return refreshExistingTask(racedTask);
  }

  await createActivity(
    client,
    id,
    actor.id,
    "WORKFLOW_TASK_CREATED",
    `${actor.name} triggered automatic task creation from ${sourceEvent.replaceAll("_", " ").toLowerCase()}.`,
  );

  await createWorkflowNotification({
    client,
    title: notificationTitle,
    message: notificationMessage,
    module: "tasks",
    href: "/account/tasks",
    orderId,
    actor,
    recipientUserIds,
    priority:
      priority === "CRITICAL" || priority === "URGENT" ? "URGENT" : "HIGH",
  });

  return { id, created: true, reopened: false };
}

export async function setAutomatedTaskStatus({
  client,
  automationKey,
  status,
  actor,
  message,
  blockerReason,
}: {
  client: WorkflowTaskClient;
  automationKey: string;
  status: WorkTaskStatus;
  actor: AppUser;
  message: string;
  blockerReason?: string | null;
}) {
  const task = await lockedTaskByKey(client, automationKey);
  if (!task) return null;
  if (task.status === status && (status !== "BLOCKED" || blockerReason === undefined)) {
    return task.id;
  }

  const statusBeforeBlock =
    status === "BLOCKED" && task.status !== "BLOCKED" ? task.status : null;

  await client.$executeRaw`
    UPDATE public."WorkTask"
    SET
      "status" = ${status}::public."WorkTaskStatus",
      "statusBeforeBlock" = CASE
        WHEN ${status} = 'BLOCKED' THEN COALESCE("statusBeforeBlock", ${statusBeforeBlock}::public."WorkTaskStatus")
        ELSE NULL
      END,
      "blockerReason" = CASE
        WHEN ${status} = 'BLOCKED' THEN ${blockerReason ?? message}
        ELSE NULL
      END,
      "completedAt" = CASE WHEN ${status} = 'DONE' THEN CURRENT_TIMESTAMP ELSE NULL END,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${task.id}
  `;

  await createActivity(client, task.id, actor.id, "WORKFLOW_STATUS_SYNC", message);
  return task.id;
}

export async function resumeAutomatedTask({
  client,
  automationKey,
  actor,
  message,
  fallbackStatus = "TODO",
}: {
  client: WorkflowTaskClient;
  automationKey: string;
  actor: AppUser;
  message: string;
  fallbackStatus?: WorkTaskStatus;
}) {
  const task = await lockedTaskByKey(client, automationKey);
  if (!task) return null;
  const restored =
    task.statusBeforeBlock && task.statusBeforeBlock !== "BLOCKED"
      ? task.statusBeforeBlock
      : fallbackStatus;

  await client.$executeRaw`
    UPDATE public."WorkTask"
    SET
      "status" = ${restored}::public."WorkTaskStatus",
      "statusBeforeBlock" = NULL,
      "blockerReason" = NULL,
      "completedAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${task.id}
  `;
  await createActivity(client, task.id, actor.id, "WORKFLOW_TASK_RESUMED", message);
  return task.id;
}

export async function pauseAutomatedTasksForOrder({
  client,
  orderId,
  actor,
  reason,
}: {
  client: WorkflowTaskClient;
  orderId: string;
  actor: AppUser;
  reason: string;
}) {
  const tasks = await client.$queryRaw<LockedTaskRow[]>`
    SELECT
      "id", "taskNumber", "title", "teamId", "assigneeId",
      "status"::text AS "status",
      "statusBeforeBlock"::text AS "statusBeforeBlock",
      "workflowPauseReason",
      "workflowPausePreviousStatus"::text AS "workflowPausePreviousStatus"
    FROM public."WorkTask"
    WHERE "orderId" = ${orderId}
      AND "isAutomated" = TRUE
      AND "status" NOT IN ('DONE'::public."WorkTaskStatus", 'CANCELLED'::public."WorkTaskStatus")
    FOR UPDATE
  `;

  for (const task of tasks) {
    await client.$executeRaw`
      UPDATE public."WorkTask"
      SET
        "workflowPausePreviousStatus" = "status",
        "workflowPauseReason" = 'CANCELLATION_REQUESTED',
        "status" = CASE
          WHEN "status" = 'BLOCKED'::public."WorkTaskStatus" THEN "status"
          ELSE 'BLOCKED'::public."WorkTaskStatus"
        END,
        "blockerReason" = CASE
          WHEN "status" = 'BLOCKED'::public."WorkTaskStatus" THEN "blockerReason"
          ELSE ${reason}
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${task.id}
    `;
    await createActivity(client, task.id, actor.id, "ORDER_WORKFLOW_PAUSED", reason);
  }
}

export async function resumeAutomatedTasksForOrder({
  client,
  orderId,
  actor,
  message,
}: {
  client: WorkflowTaskClient;
  orderId: string;
  actor: AppUser;
  message: string;
}) {
  const tasks = await client.$queryRaw<LockedTaskRow[]>`
    SELECT
      "id", "taskNumber", "title", "teamId", "assigneeId",
      "status"::text AS "status",
      "statusBeforeBlock"::text AS "statusBeforeBlock",
      "workflowPauseReason",
      "workflowPausePreviousStatus"::text AS "workflowPausePreviousStatus"
    FROM public."WorkTask"
    WHERE "orderId" = ${orderId}
      AND "isAutomated" = TRUE
      AND "workflowPauseReason" = 'CANCELLATION_REQUESTED'
    FOR UPDATE
  `;

  for (const task of tasks) {
    const wasAlreadyBlocked = task.workflowPausePreviousStatus === "BLOCKED";
    const next = wasAlreadyBlocked
      ? "BLOCKED"
      : task.workflowPausePreviousStatus ?? "TODO";

    await client.$executeRaw`
      UPDATE public."WorkTask"
      SET
        "status" = ${next}::public."WorkTaskStatus",
        "workflowPauseReason" = NULL,
        "workflowPausePreviousStatus" = NULL,
        "blockerReason" = CASE WHEN ${wasAlreadyBlocked} THEN "blockerReason" ELSE NULL END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${task.id}
    `;
    await createActivity(client, task.id, actor.id, "ORDER_WORKFLOW_RESUMED", message);
  }
}

export async function cancelAutomatedTasksForOrder({
  client,
  orderId,
  actor,
  message,
}: {
  client: WorkflowTaskClient;
  orderId: string;
  actor: AppUser;
  message: string;
}) {
  const tasks = await client.$queryRaw<LockedTaskRow[]>`
    SELECT
      "id", "taskNumber", "title", "teamId", "assigneeId",
      "status"::text AS "status",
      "statusBeforeBlock"::text AS "statusBeforeBlock",
      "workflowPauseReason",
      "workflowPausePreviousStatus"::text AS "workflowPausePreviousStatus"
    FROM public."WorkTask"
    WHERE "orderId" = ${orderId}
      AND "isAutomated" = TRUE
      AND "status" NOT IN ('DONE'::public."WorkTaskStatus", 'CANCELLED'::public."WorkTaskStatus")
    FOR UPDATE
  `;

  for (const task of tasks) {
    await client.$executeRaw`
      UPDATE public."WorkTask"
      SET
        "status" = 'CANCELLED'::public."WorkTaskStatus",
        "statusBeforeBlock" = NULL,
        "workflowPauseReason" = NULL,
        "workflowPausePreviousStatus" = NULL,
        "blockerReason" = NULL,
        "completedAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${task.id}
    `;
    await createActivity(client, task.id, actor.id, "ORDER_WORKFLOW_CANCELLED", message);
  }
}

export function ensureOrderReceivingTask(
  client: WorkflowTaskClient,
  input: { orderId: string; orderNumber: string; actor: AppUser },
) {
  return ensureAutomatedTask({
    client,
    automationKey: workflowTaskKeys.orderReceiving(input.orderId),
    orderId: input.orderId,
    workflowStage: workflowStages.ORDER_RECEIVING,
    sourceEvent: "ORDER_PLACED",
    title: `Receive and assign ${input.orderNumber}`,
    description:
      "Confirm the dealer order, review quantities and assign every product line to an active Physical Team.",
    relatedModule: "ORDER_RECEIVING",
    relatedReference: input.orderNumber,
    priority: "HIGH",
    taskType: "APPROVAL",
    role: UserRole.ORDER_TEAM,
    actor: input.actor,
    notificationTitle: `Receiving task: ${input.orderNumber}`,
    notificationMessage: `${input.orderNumber} is waiting for order receiving and Physical Team assignment.`,
  });
}

export function ensurePhysicalVerificationTask(
  client: WorkflowTaskClient,
  input: {
    orderId: string;
    orderNumber: string;
    assignmentId: string;
    teamId: string;
    teamName: string;
    actor: AppUser;
  },
) {
  return ensureAutomatedTask({
    client,
    automationKey: workflowTaskKeys.physicalVerification(input.assignmentId),
    orderId: input.orderId,
    workflowStage: workflowStages.PHYSICAL_VERIFICATION,
    sourceEvent: "PHYSICAL_TEAM_ASSIGNED",
    title: `Verify ${input.orderNumber} · ${input.teamName}`,
    description:
      "Verify the complete ordered quantity for every assigned product. Report a blocker when full stock or correct goods are unavailable.",
    relatedModule: "DISPATCH",
    relatedReference: input.orderNumber,
    priority: "HIGH",
    taskType: "TASK",
    teamId: input.teamId,
    actor: input.actor,
    reopenClosed: true,
    notificationTitle: `Physical verification task: ${input.orderNumber}`,
    notificationMessage: `${input.teamName} received an automatic physical verification task for ${input.orderNumber}.`,
  });
}

export function ensureQcReviewTask(
  client: WorkflowTaskClient,
  input: { orderId: string; orderNumber: string; actor: AppUser },
) {
  return ensureAutomatedTask({
    client,
    automationKey: workflowTaskKeys.qcReview(input.orderId),
    orderId: input.orderId,
    workflowStage: workflowStages.QC_REVIEW,
    sourceEvent: "PHYSICAL_VERIFICATION_COMPLETED",
    title: `QC review ${input.orderNumber}`,
    description:
      "Inspect every fully verified product line. Approve the order or return the affected Physical Team assignment for rework.",
    relatedModule: "QC",
    relatedReference: input.orderNumber,
    priority: "HIGH",
    taskType: "APPROVAL",
    role: UserRole.QC_TEAM,
    actor: input.actor,
    reopenClosed: true,
    notificationTitle: `QC task: ${input.orderNumber}`,
    notificationMessage: `${input.orderNumber} completed physical verification and is ready for QC.`,
  });
}

export function ensureQcReworkTask(
  client: WorkflowTaskClient,
  input: {
    orderId: string;
    orderNumber: string;
    assignmentId: string;
    teamId: string;
    teamName: string;
    note: string;
    actor: AppUser;
  },
) {
  return ensureAutomatedTask({
    client,
    automationKey: workflowTaskKeys.qcRework(input.assignmentId),
    orderId: input.orderId,
    workflowStage: workflowStages.QC_REWORK,
    sourceEvent: "QC_REJECTED",
    title: `QC rework ${input.orderNumber} · ${input.teamName}`,
    description: `QC returned this assignment for correction. Note: ${input.note}`,
    relatedModule: "DISPATCH",
    relatedReference: input.orderNumber,
    priority: "URGENT",
    taskType: "BLOCKER",
    teamId: input.teamId,
    actor: input.actor,
    reopenClosed: true,
    notificationTitle: `QC rework task: ${input.orderNumber}`,
    notificationMessage: `${input.teamName} must rework ${input.orderNumber}. QC note: ${input.note}`,
  });
}

export function ensureProofAssistanceTask(
  client: WorkflowTaskClient,
  input: {
    orderId: string;
    orderNumber: string;
    driverName: string;
    note?: string | null;
    actor: AppUser;
  },
) {
  return ensureAutomatedTask({
    client,
    automationKey: workflowTaskKeys.proofAssistance(input.orderId),
    orderId: input.orderId,
    workflowStage: workflowStages.PROOF_ASSISTANCE,
    sourceEvent: "MANAGER_PROOF_HELP_REQUESTED",
    title: `Upload proof for ${input.orderNumber}`,
    description: `${input.driverName} requested manager assistance for delivery proof upload${input.note ? `: ${input.note}` : "."}`,
    relatedModule: "DELIVERY_PROOF",
    relatedReference: input.orderNumber,
    priority: "URGENT",
    taskType: "FOLLOW_UP",
    role: UserRole.MANAGER,
    actor: input.actor,
    reopenClosed: true,
    notificationTitle: `Proof assistance task: ${input.orderNumber}`,
    notificationMessage: `${input.driverName} requested manager assistance for ${input.orderNumber}.`,
  });
}
