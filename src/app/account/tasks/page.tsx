import Link from "next/link";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingPath } from "@/lib/current-user";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasPermission, roleLabels, type UserRole } from "@/lib/permissions";
import {
  formatTaskDate,
  getCalendarStatusLabel,
  getTaskGoogleCalendarUrl,
  getTaskModuleLabel,
  getWorkflowTaskHref,
  getTaskTypeLabel,
  isTaskOverdue,
  taskPriorityLabels,
  taskStatuses,
  taskStatusLabels,
} from "@/lib/work-tasks";
import {
  addWorkTaskComment,
  markWorkTaskCalendarSynced,
  syncWorkTaskGoogleCalendar,
  updateWorkTaskStatus,
} from "@/app/internal/tasks/actions";

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-300 dark:focus:ring-cyan-300/10";

const selectClass = `${inputClass} appearance-none pr-12`;

const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 1rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "18px 18px",
} as const;

const priorityStyle: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  HIGH: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  URGENT:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  CRITICAL: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

const statusStyle: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  IN_PROGRESS:
    "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  REVIEW:
    "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  BLOCKED:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  DONE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  CANCELLED: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

type MyTask = Awaited<ReturnType<typeof getMyTasks>>[number];

function roleToAppRole(role: string): UserRole {
  return role.toLowerCase() as UserRole;
}

async function getMyTasks(
  userId: string,
  userRoles: string[],
  canManageAll: boolean,
) {
  const workflowRoleMarkers = Array.from(
    new Set(
      userRoles.flatMap((role) => {
        switch (role) {
          case "owner":
          case "manager":
            return ["[SYSTEM_WORKFLOW_ROLE:MANAGER]"];
          case "order_team":
            return ["[SYSTEM_WORKFLOW_ROLE:ORDER_TEAM]"];
          case "qc_team":
            return ["[SYSTEM_WORKFLOW_ROLE:QC_TEAM]"];
          default:
            return [];
        }
      }),
    ),
  );
  const tasks = await prisma.workTask.findMany({
    where: canManageAll
      ? {}
      : {
          OR: [
            {
              assigneeId: userId,
            },
            {
              team: {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            },
            ...(workflowRoleMarkers.length > 0
              ? [
                  {
                    team: {
                      description: { in: workflowRoleMarkers },
                    },
                  },
                ]
              : []),
          ],
        },
    include: {
      team: {
        include: {
          parentTeam: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      parentTask: {
        select: {
          taskNumber: true,
          title: true,
        },
      },
      subTasks: {
        select: {
          id: true,
          status: true,
        },
      },
      comments: {
        include: {
          createdBy: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
      },
      activities: {
        orderBy: {
          createdAt: "desc",
        },
        take: 3,
      },
    },
    orderBy: [
      {
        dueAt: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  if (tasks.length === 0) {
    return [] as Array<
      (typeof tasks)[number] & {
        orderId: string | null;
        isAutomated: boolean;
        workflowStage: string | null;
      }
    >;
  }

  const metadataRows = await prisma.$queryRaw<
    Array<{
      id: string;
      orderId: string | null;
      isAutomated: boolean;
      workflowStage: string | null;
    }>
  >(Prisma.sql`
    SELECT "id", "orderId", "isAutomated", "workflowStage"
    FROM public."WorkTask"
    WHERE "id" IN (${Prisma.join(tasks.map((task) => task.id))})
  `);
  const metadataById = new Map(metadataRows.map((row) => [row.id, row]));

  return tasks.map((task) => ({
    ...task,
    orderId: metadataById.get(task.id)?.orderId ?? null,
    isAutomated: metadataById.get(task.id)?.isAutomated ?? false,
    workflowStage: metadataById.get(task.id)?.workflowStage ?? null,
  }));
}

function TaskItem({ task }: { task: MyTask }) {
  const overdue = isTaskOverdue(task.dueAt, task.status);

  const openSubtasks = task.subTasks.filter(
    (subtask) => subtask.status !== "DONE" && subtask.status !== "CANCELLED",
  ).length;

  const teamName = `${task.team.parentTeam ? `${task.team.parentTeam.name} → ` : ""}${task.team.name}`;

  const calendarUrl = getTaskGoogleCalendarUrl({
    title: task.title,
    taskNumber: task.taskNumber,
    dueAt: task.dueAt,
    calendarReminderAt: task.calendarReminderAt,
    calendarNotes: task.calendarNotes,
    teamName,
    assigneeName: task.assignee?.name ?? null,
    priority: task.priority,
    status: task.status,
    taskType: task.taskType,
    relatedModule: task.relatedModule,
    relatedReference: task.relatedReference,
    description: task.description,
  });


  const workflowHref = getWorkflowTaskHref({
    relatedModule: task.relatedModule,
    orderId: task.orderId,
  });

  const calendarSetupRequired =
    task.googleSyncError?.includes("Google Calendar is not configured") ?? false;

  const showSyncedAt =
    task.calendarStatus === "SYNCED" &&
    Boolean(task.calendarSyncedAt) &&
    !task.googleSyncError;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
            {task.taskNumber}
          </p>

          <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-slate-100">
            {task.title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {task.description || "No description added."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${priorityStyle[task.priority]}`}
          >
            {taskPriorityLabels[task.priority]}
          </span>

          <span
            className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${statusStyle[task.status]}`}
          >
            {taskStatusLabels[task.status]}
          </span>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {getTaskTypeLabel(task.taskType)}
          </span>

          {task.isAutomated ? (
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300">
              Automated Workflow
            </span>
          ) : null}

          {task.workflowStage ? (
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
              {task.workflowStage.replaceAll("_", " ")}
            </span>
          ) : null}

          {overdue ? (
            <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              Overdue
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-500 dark:text-slate-400">Team</p>

          <p className="mt-2 text-sm font-black text-slate-950 dark:text-slate-100">
            {task.team.parentTeam ? `${task.team.parentTeam.name} → ` : ""}
            {task.team.name}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-500 dark:text-slate-400">Assignee</p>

          <p className="mt-2 text-sm font-black text-slate-950 dark:text-slate-100">
            {task.assignee
              ? `${task.assignee.name} · ${
                  roleLabels[roleToAppRole(task.assignee.role)] ??
                  task.assignee.role
                }`
              : "Team pool"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-500 dark:text-slate-400">Due</p>

          <p
            className={`mt-2 text-sm font-black ${
              overdue
                ? "text-rose-700 dark:text-rose-300"
                : "text-slate-950 dark:text-slate-100"
            }`}
          >
            {formatTaskDate(task.dueAt)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-500 dark:text-slate-400">Calendar</p>

          <p className="mt-2 text-sm font-black text-cyan-700 dark:text-cyan-300">
            {getCalendarStatusLabel(task.calendarStatus)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {getTaskModuleLabel(task.relatedModule)}
          {task.relatedReference ? ` · ${task.relatedReference}` : ""}
        </span>

        {task.calendarReminderAt ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300">
            Reminder: {formatTaskDate(task.calendarReminderAt)}
          </span>
        ) : null}

        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {task.subTasks.length === 0
            ? "No subtasks"
            : `${task.subTasks.length - openSubtasks}/${task.subTasks.length} closed`}
        </span>
      </div>

      {workflowHref ? (
        <div className="mt-4">
          <Link
            href={workflowHref}
            className="inline-flex rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-100 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-300 dark:hover:bg-cyan-400/15"
          >
            Open Order Workflow →
          </Link>
        </div>
      ) : null}

      {task.blockerReason ? (
        <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-bold leading-5 text-orange-800 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-200">
          Blocker: {task.blockerReason}
        </p>
      ) : null}

      {task.parentTask ? (
        <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
          Subtask of {task.parentTask.taskNumber}: {task.parentTask.title}
        </p>
      ) : null}

      {task.lastReviewedAt ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Reviewed: {formatTaskDate(task.lastReviewedAt)}
          {task.reviewNotes ? ` · ${task.reviewNotes}` : ""}
        </p>
      ) : null}

      {calendarUrl ? (
        <div className="mt-5 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <form action={syncWorkTaskGoogleCalendar}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="returnTo" value="/account/tasks" />

              <button className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20">
                Sync Google Calendar
              </button>
            </form>

            <a
              href={calendarUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-center text-sm font-black text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-300 dark:hover:bg-cyan-400/20"
            >
              Open Calendar Draft
            </a>
          </div>

          <form action={markWorkTaskCalendarSynced}>
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="returnTo" value="/account/tasks" />

            <button className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
              Mark Manual Calendar Synced
            </button>
          </form>

          {task.googleSyncError ? (
            <p
              className={`rounded-2xl border px-4 py-3 text-xs font-bold leading-5 ${
                calendarSetupRequired
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
                  : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300"
              }`}
            >
              {calendarSetupRequired
                ? "Google Calendar integration is not connected yet. Add Google credentials in .env, then use Sync Google Calendar. Until then, use Open Calendar Draft."
                : `Google sync error: ${task.googleSyncError}`}
            </p>
          ) : null}

          {showSyncedAt ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              Synced at {formatTaskDate(task.calendarSyncedAt)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-xs font-bold leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Ask manager to add a due date before syncing this task with Google
          Calendar.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
        {task.isAutomated && ["BLOCKED", "DONE", "CANCELLED"].includes(task.status) ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold leading-6 text-cyan-800 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
            This automated task is synchronized with the order workflow. Closed and blocked states are updated by the related ERP action.
          </div>
        ) : (
          <form
            action={updateWorkTaskStatus}
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
          >
            <input type="hidden" name="taskId" value={task.id} />

            <p className="text-sm font-black text-slate-950 dark:text-slate-100">
              Update Status
            </p>

            <select
              name="status"
              defaultValue={task.status}
              className={`${selectClass} mt-3`}
              style={selectArrowStyle}
            >
              {(task.isAutomated
                ? taskStatuses.filter((status) =>
                    ["TODO", "IN_PROGRESS", "REVIEW"].includes(status),
                  )
                : taskStatuses
              ).map((status) => (
                <option key={status} value={status}>
                  {taskStatusLabels[status]}
                </option>
              ))}
            </select>

            <button className="mt-3 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
              Save Status
            </button>
          </form>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-sm font-black text-slate-950 dark:text-slate-100">
            Comments / Updates
          </p>

          <form action={addWorkTaskComment} className="mt-3 space-y-3">
            <input type="hidden" name="taskId" value={task.id} />

            <textarea
              name="body"
              placeholder="Add progress update, blocker, or completion note"
              className={`${inputClass} min-h-24`}
              required
            />

            <button className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
              Add Comment
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {task.comments.length === 0 && task.activities.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No updates yet.
              </p>
            ) : null}

            {task.comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"
              >
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {comment.body}
                </p>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                  {comment.createdBy?.name ?? "Unknown"} ·{" "}
                  {formatTaskDate(comment.createdAt)}
                </p>
              </div>
            ))}

            {task.activities.map((activity) => (
              <p
                key={activity.id}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
              >
                {activity.message} · {formatTaskDate(activity.createdAt)}
              </p>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }> ;
}) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission(
    "view_my_work_tasks",
    "/account/tasks",
  );

  if (!hasAccess) {
    redirect("/login");
  }

  const canManageAll = hasPermission(currentUser.roles, "manage_work_tasks");
  const dashboardHref = getPortalLandingPath(currentUser.role);
  const tasks = await getMyTasks(currentUser.id, currentUser.roles, canManageAll);

  const urgentTasks = tasks.filter(
    (task) => task.priority === "URGENT" || task.priority === "CRITICAL",
  ).length;

  const overdueTasks = tasks.filter((task) =>
    isTaskOverdue(task.dueAt, task.status),
  ).length;

  const completedTasks = tasks.filter((task) => task.status === "DONE").length;

  const automatedTasks = tasks.filter((task) => task.isAutomated).length;

  const blockedTasks = tasks.filter(
    (task) => task.status === "BLOCKED" || task.taskType === "BLOCKER",
  ).length;

  const reviewTasks = tasks.filter((task) => task.status === "REVIEW").length;

  const calendarReadyTasks = tasks.filter(
    (task) => task.calendarStatus === "READY_TO_SYNC",
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {params.error === "automated-task-workflow-controlled" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            This automated task is controlled by the related ERP workflow. Complete, cancel or resolve it from the linked order action.
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600 dark:text-cyan-300">
                My Work
              </p>

              <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-slate-100">
                My Work
              </h1>

              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Automated order workflow tasks, role-pool assignments, team work,
                blockers and reminders across every role you hold.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={dashboardHref}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-300"
              >
                ← Back to Dashboard
              </Link>

              {canManageAll ? (
                <Link
                  href="/internal/tasks"
                  className="rounded-2xl border border-blue-300 px-5 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-50 dark:border-cyan-400/30 dark:text-cyan-300 dark:hover:bg-cyan-400/10"
                >
                  Open Team Board
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-8">
          {[
            ["My/Team Tasks", tasks.length, "text-slate-950 dark:text-slate-100"],
            ["Automated", automatedTasks, "text-cyan-700 dark:text-cyan-300"],
            ["Blocked", blockedTasks, "text-orange-600 dark:text-orange-300"],
            [
              "Urgent/Critical",
              urgentTasks,
              "text-orange-600 dark:text-orange-300",
            ],
            ["Overdue", overdueTasks, "text-rose-700 dark:text-rose-300"],
            ["Review", reviewTasks, "text-purple-700 dark:text-purple-300"],
            [
              "Calendar Ready",
              calendarReadyTasks,
              "text-cyan-700 dark:text-cyan-300",
            ],
            ["Completed", completedTasks, "text-emerald-700 dark:text-emerald-300"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {label}
              </p>

              <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="space-y-5">
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center dark:border-slate-800">
              <p className="text-xl font-black text-slate-950 dark:text-slate-100">
                No tasks assigned yet
              </p>

              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No active tasks assigned.
              </p>
            </div>
          ) : (
            tasks.map((task) => <TaskItem key={task.id} task={task} />)
          )}
        </section>
      </div>
    </main>
  );
}