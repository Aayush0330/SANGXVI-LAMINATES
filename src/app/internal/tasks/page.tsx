import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  formatTaskDate,
  formatTaskDateTimeInput,
  getTaskModuleLabel,
  getTaskTypeLabel,
  isTaskOverdue,
  progressPercent,
  taskPriorities,
  taskPriorityLabels,
  taskStatuses,
  taskStatusLabels,
  taskTypes,
  workloadLabel,
} from "@/lib/work-tasks";
import { TaskKanbanBoard, type KanbanTask } from "@/components/task-kanban-board";
import {
  TaskCreateDrawer,
  type TaskPersonOption,
  type TaskPhysicalTeamOption,
  type TaskRoleOption,
} from "@/components/task-create-drawer";
import { roleLabels, type UserRole as AppUserRole } from "@/lib/permissions";
import {
  addWorkTaskComment,
  reviewWorkTask,
  updateWorkTaskAssignment,
  updateWorkTaskStatus,
} from "./actions";

const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const labelClass = "mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

type SearchParams = Promise<{
  mode?: string;
  q?: string;
  assignee?: string;
  team?: string;
  priority?: string;
  type?: string;
  status?: string;
  create?: string;
  task?: string;
  success?: string;
  error?: string;
  taskNumber?: string;
}>;

const manualTaskRoleValues = [
  "OWNER",
  "MANAGER",
  "ACCOUNTANT",
  "DISPATCH_TEAM",
  "ORDER_TEAM",
  "QC_TEAM",
  "DRIVER_TRANSPORT",
  "COLLECTION_TEAM",
  "SALES_FIELD_TEAM",
] as const;

function prismaRoleToAppRole(role: string) {
  return role.toLowerCase() as AppUserRole;
}

type TaskRecord = Awaited<ReturnType<typeof getTasks>>[number];

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>;
}

function initials(name?: string | null) {
  if (!name) return "TP";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function shortDue(date?: Date | null, overdue = false) {
  if (!date) return "No due date";
  const now = new Date();
  const due = new Date(date);
  if (due.toDateString() === now.toDateString()) {
    return `Today, ${new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(due)}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (due.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  const label = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(due);
  return overdue ? `Overdue · ${label}` : label;
}

function makeQuery(params: Record<string, string | undefined>, updates: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  for (const [key, value] of Object.entries(updates)) {
    if (!value) search.delete(key);
    else search.set(key, value);
  }
  const value = search.toString();
  return `/internal/tasks${value ? `?${value}` : ""}`;
}

async function getTeams() {
  return prisma.workTeam.findMany({
    where: { isActive: true },
    include: {
      parentTeam: { select: { name: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, status: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }],
  });
}

async function getTaskCreationOptions() {
  const [users, physicalTeams] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { not: "DEALER" },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleAssignments: {
          select: { role: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.workTeam.findMany({
      where: {
        isActive: true,
        teamType: "PHYSICAL_DISPATCH",
      },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const people: TaskPersonOption[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    roleLabel: roleLabels[prismaRoleToAppRole(user.role)] ?? user.role,
  }));

  const teams: TaskPhysicalTeamOption[] = physicalTeams.map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: team._count.members,
  }));

  const roles: TaskRoleOption[] = manualTaskRoleValues.map((role) => ({
    value: role,
    label: roleLabels[prismaRoleToAppRole(role)] ?? role,
    activeUsers: users.filter(
      (user) => user.role === role || user.roleAssignments.some((assignment) => assignment.role === role),
    ).length,
  }));

  return { people, physicalTeams: teams, roles };
}

async function getTasks() {
  return prisma.workTask.findMany({
    include: {
      team: { select: { id: true, name: true, parentTeam: { select: { name: true } } } },
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { name: true } },
      parentTask: { select: { id: true, taskNumber: true, title: true } },
      subTasks: { select: { id: true, status: true } },
      _count: { select: { comments: true, activities: true } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });
}

async function getSelectedTask(taskId?: string) {
  if (!taskId) return null;
  return prisma.workTask.findUnique({
    where: { id: taskId },
    include: {
      team: {
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
        },
      },
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { name: true } },
      parentTask: { select: { taskNumber: true, title: true } },
      subTasks: { select: { id: true, taskNumber: true, title: true, status: true }, orderBy: { createdAt: "asc" } },
      comments: { include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      activities: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 12 },
    },
  });
}

function filterTasks(tasks: TaskRecord[], filters: { q: string; assignee: string; team: string; priority: string; type: string; status: string }) {
  const query = filters.q.toLowerCase();
  return tasks.filter((task) => {
    if (query) {
      const haystack = [task.taskNumber, task.title, task.description, task.relatedReference, task.team.name, task.assignee?.name, task.blockerReason].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.assignee !== "ALL") {
      if (filters.assignee === "UNASSIGNED" ? Boolean(task.assigneeId) : task.assigneeId !== filters.assignee) return false;
    }
    if (filters.team !== "ALL" && task.teamId !== filters.team) return false;
    if (filters.priority !== "ALL" && task.priority !== filters.priority) return false;
    if (filters.type !== "ALL" && task.taskType !== filters.type) return false;
    if (filters.status !== "ALL" && task.status !== filters.status) return false;
    return true;
  });
}

function SummaryCard({ label, value, helper, className, icon }: { label: string; value: number; helper: string; className: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-2xl ${className}`}>{icon}</div>
        <div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-0.5 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
          <p className="text-[10px] font-semibold text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyView({ title, text }: { title: string; text: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900"><h3 className="text-lg font-black text-slate-950 dark:text-white">{title}</h3><p className="mt-2 text-sm text-slate-500">{text}</p></div>;
}

export default async function InternalTasksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { currentUser, hasAccess } = await checkPermission("manage_work_tasks", "/internal/tasks");
  if (!hasAccess) redirect("/internal/dashboard");

  const rawParams: Record<string, string | undefined> = {
    mode: params.mode,
    q: params.q,
    assignee: params.assignee,
    team: params.team,
    priority: params.priority,
    type: params.type,
    status: params.status,
  };
  const mode = ["board", "list", "calendar", "workload"].includes(params.mode ?? "") ? params.mode! : "board";
  const filters = {
    q: params.q?.trim() ?? "",
    assignee: params.assignee ?? "ALL",
    team: params.team ?? "ALL",
    priority: params.priority ?? "ALL",
    type: params.type ?? "ALL",
    status: params.status ?? "ALL",
  };

  const [teams, allTasks, selectedTask, taskCreationOptions] = await Promise.all([
    getTeams(),
    getTasks(),
    getSelectedTask(params.task),
    getTaskCreationOptions(),
  ]);
  const tasks = filterTasks(allTasks, filters);
  const activeTasks = allTasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED");
  const overdue = allTasks.filter((task) => isTaskOverdue(task.dueAt, task.status));
  const blocked = allTasks.filter((task) => task.status === "BLOCKED" || task.taskType === "BLOCKER");
  const waitingQc = allTasks.filter((task) => task.status === "REVIEW");
  const dueToday = allTasks.filter((task) => task.dueAt && task.status !== "DONE" && task.status !== "CANCELLED" && new Date(task.dueAt).toDateString() === new Date().toDateString());
  const myTasks = activeTasks.filter((task) => task.assigneeId === currentUser.id);

  const assignees = Array.from(new Map(teams.flatMap((team) => team.members.map((member) => member.user)).filter((user) => user.status === "ACTIVE").map((user) => [user.id, user])).values()).sort((a, b) => a.name.localeCompare(b.name));

  const closeHref = makeQuery(rawParams, { task: null, create: null });
  const createHref = makeQuery(rawParams, { create: "manual", task: null });
  const blockerHref = makeQuery(rawParams, { create: "blocker", task: null });
  const kanbanTasks: KanbanTask[] = tasks.filter((task) => task.status !== "CANCELLED").map((task) => {
    const overdueTask = isTaskOverdue(task.dueAt, task.status);
    return {
      id: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      priorityLabel: taskPriorityLabels[task.priority] ?? task.priority,
      taskType: task.taskType,
      taskTypeLabel: getTaskTypeLabel(task.taskType),
      sourceLabel: task.createdById ? "Manual Task" : "Auto Task",
      relatedReference: task.relatedReference,
      relatedModuleLabel: getTaskModuleLabel(task.relatedModule),
      blockerReason: task.blockerReason,
      dueLabel: formatTaskDate(task.dueAt),
      dueShort: shortDue(task.dueAt, overdueTask),
      isOverdue: overdueTask,
      teamName: task.parentTask ? `${task.team.name} · Subtask` : task.team.name,
      assigneeName: task.assignee?.name ?? null,
      assigneeInitials: initials(task.assignee?.name ?? task.team.name),
      commentCount: task._count.comments,
      subTaskCount: task.subTasks.length,
      detailsHref: makeQuery(rawParams, { task: task.id, create: null }),
    };
  });


  const taskErrorMessages: Record<string, string> = {
    "manual-task-details-required": "Add a task title and select who should handle it.",
    "invalid-calendar-or-due-date": "Check the due date or reminder date and try again.",
    "blocker-reason-required": "Add a clear blocker reason before submitting.",
    "invalid-task-assignee": "Select an active staff member.",
    "invalid-task-role": "Select a valid role or department.",
    "physical-team-required": "Select an active Physical Team.",
  };

  const statusMessage = params.success === "task-created"
    ? `${params.taskNumber ? `${params.taskNumber} ` : "Manual task "}created successfully.`
    : params.success === "blocker-created"
      ? `${params.taskNumber ? `${params.taskNumber} ` : "Blocker "}reported successfully.`
      : params.error
        ? taskErrorMessages[params.error] ?? "Task action could not be completed. Verify the required fields."
        : null;

  return (
    <div className="space-y-5 pb-10">
      {statusMessage ? <div className={`fixed right-5 top-24 z-50 max-w-sm rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl ${params.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{statusMessage}</div> : null}

      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600 dark:text-blue-300">Workflow operations</p>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">Task Management</h1>
            <span className="text-xl text-slate-300">☆</span>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Track workflow tasks, blockers, QC reviews and deadlines in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={createHref} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"><span className="text-lg">+</span> New Manual Task</Link>
          <Link href={blockerHref} className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"><span>⚑</span> Report Blocker</Link>
        </div>
      </section>

      <nav className="flex gap-6 border-b border-slate-200 dark:border-slate-800">
        {[
          ["board", "Board"], ["list", "List"], ["calendar", "Calendar"], ["workload", "Workload"],
        ].map(([key, label]) => <Link key={key} href={makeQuery(rawParams, { mode: key })} className={`border-b-2 px-1 pb-3 text-sm font-black transition ${mode === key ? "border-blue-600 text-blue-600 dark:text-blue-300" : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}>{label}</Link>)}
      </nav>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(220px,1.3fr)_repeat(5,minmax(130px,0.75fr))_auto]">
          <input type="hidden" name="mode" value={mode} />
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input name="q" defaultValue={filters.q} className={`${inputClass} pl-10`} placeholder="Search tasks..." />
          </div>
          <select name="assignee" defaultValue={filters.assignee} className={inputClass}><option value="ALL">All Assignees</option><option value="UNASSIGNED">Unassigned</option>{assignees.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
          <select name="team" defaultValue={filters.team} className={inputClass}><option value="ALL">All Teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          <select name="priority" defaultValue={filters.priority} className={inputClass}><option value="ALL">All Priority</option>{taskPriorities.map((priority) => <option key={priority} value={priority}>{taskPriorityLabels[priority]}</option>)}</select>
          <select name="type" defaultValue={filters.type} className={inputClass}><option value="ALL">All Types</option>{taskTypes.map((type) => <option key={type} value={type}>{getTaskTypeLabel(type)}</option>)}</select>
          <select name="status" defaultValue={filters.status} className={inputClass}><option value="ALL">All Status</option>{taskStatuses.map((status) => <option key={status} value={status}>{status === "REVIEW" ? "Waiting for QC" : taskStatusLabels[status]}</option>)}</select>
          <button className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Apply</button>
        </form>
        <div className="mt-3 flex justify-end"><Link href={`/internal/tasks?mode=${mode}`} className="text-xs font-black text-slate-500 hover:text-blue-600">Clear filters</Link></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="My Tasks" value={myTasks.length} helper="Assigned to you" className="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300" icon={<Icon><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 4V2h6v2" /></Icon>} />
        <SummaryCard label="Overdue" value={overdue.length} helper="Past due date" className="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" icon={<Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>} />
        <SummaryCard label="Blocked" value={blocked.length} helper="Needs resolution" className="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300" icon={<Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>} />
        <SummaryCard label="Waiting for QC" value={waitingQc.length} helper="Pending approval" className="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" icon={<Icon><path d="M8 3h8M8 21h8M9 3v4l3 3 3-3V3M9 21v-4l3-3 3 3v4" /></Icon>} />
        <SummaryCard label="Due Today" value={dueToday.length} helper="Due within 24 hours" className="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" icon={<Icon><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon>} />
      </section>

      {mode === "board" ? (
        tasks.length ? <TaskKanbanBoard tasks={kanbanTasks} createHref={createHref} /> : <EmptyView title="No tasks match these filters" text="Clear filters or create a new task." />
      ) : null}

      {mode === "list" ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {tasks.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{tasks.map((task) => <Link key={task.id} href={makeQuery(rawParams, { task: task.id })} className="grid gap-3 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 md:grid-cols-[120px_minmax(0,1fr)_180px_150px_140px]"><span className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">{task.taskNumber}</span><div><p className="font-black text-slate-950 dark:text-white">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.relatedReference || getTaskModuleLabel(task.relatedModule)}</p></div><span className="text-sm font-bold text-slate-600 dark:text-slate-300">{task.assignee?.name ?? task.team.name}</span><span className="text-xs font-black text-slate-500">{task.status === "REVIEW" ? "Waiting for QC" : taskStatusLabels[task.status]}</span><span className={`text-xs font-black ${isTaskOverdue(task.dueAt, task.status) ? "text-rose-600" : "text-slate-500"}`}>{shortDue(task.dueAt, isTaskOverdue(task.dueAt, task.status))}</span></Link>)}</div> : <EmptyView title="No tasks found" text="Create a task or change the filters." />}
        </section>
      ) : null}

      {mode === "calendar" ? (
        <section className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, index) => {
            const date = new Date(); date.setDate(date.getDate() + index);
            const dayTasks = tasks.filter((task) => task.dueAt && new Date(task.dueAt).toDateString() === date.toDateString());
            return <div key={date.toISOString()} className="min-h-48 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short" }).format(date)}</p><div className="mt-3 space-y-2">{dayTasks.length ? dayTasks.map((task) => <Link key={task.id} href={makeQuery(rawParams, { task: task.id })} className="block rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950"><p className="text-[10px] font-black text-blue-600">{task.taskNumber}</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{task.title}</p><p className="mt-1 text-[10px] text-slate-500">{shortDue(task.dueAt)}</p></Link>) : <p className="pt-8 text-center text-xs text-slate-400">No due tasks</p>}</div></div>;
          })}
        </section>
      ) : null}

      {mode === "workload" ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const teamTasks = allTasks.filter((task) => task.teamId === team.id);
            const active = teamTasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED").length;
            const done = teamTasks.filter((task) => task.status === "DONE").length;
            const blockedCount = teamTasks.filter((task) => task.status === "BLOCKED").length;
            const progress = progressPercent(teamTasks);
            return <article key={team.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between"><div><h3 className="font-black text-slate-950 dark:text-white">{team.name}</h3><p className="mt-1 text-xs text-slate-500">{team.members.length} members · {workloadLabel(active)} workload</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{active} active</span></div><div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-[10px] text-slate-400">Total</p><p className="mt-1 text-xl font-black">{teamTasks.length}</p></div><div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10"><p className="text-[10px] text-emerald-600">Done</p><p className="mt-1 text-xl font-black text-emerald-700">{done}</p></div><div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10"><p className="text-[10px] text-rose-600">Blocked</p><p className="mt-1 text-xl font-black text-rose-700">{blockedCount}</p></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-right text-[10px] font-black text-slate-400">{progress}% complete</p></article>;
          })}
        </section>
      ) : null}

      {params.create === "manual" || params.create === "blocker" ? (
        <TaskCreateDrawer
          people={taskCreationOptions.people}
          physicalTeams={taskCreationOptions.physicalTeams}
          roles={taskCreationOptions.roles}
          closeHref={closeHref}
          mode={params.create === "blocker" ? "blocker" : "manual"}
        />
      ) : null}

      {selectedTask ? (
        <div className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-sm">
          <Link href={closeHref} className="absolute inset-0" aria-label="Close task details" />
          <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">{selectedTask.taskNumber}</p><h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{selectedTask.title}</h2><p className="mt-1 text-xs text-slate-500">{selectedTask.relatedReference || getTaskModuleLabel(selectedTask.relatedModule)}</p></div>
              <Link href={closeHref} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-lg text-slate-500 dark:border-slate-700">×</Link>
            </header>

            <div className="space-y-5 p-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Team</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{selectedTask.team.name}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Assignee</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{selectedTask.assignee?.name ?? "Team pool"}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Priority</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{taskPriorityLabels[selectedTask.priority]}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Due</p><p className={`mt-1 text-sm font-black ${isTaskOverdue(selectedTask.dueAt, selectedTask.status) ? "text-rose-600" : "text-slate-950 dark:text-white"}`}>{formatTaskDate(selectedTask.dueAt)}</p></div></div>
                {selectedTask.description ? <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedTask.description}</p> : null}
                {selectedTask.blockerReason ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"><strong>Blocker:</strong> {selectedTask.blockerReason}</div> : null}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-black text-slate-950 dark:text-white">Move task</h3>
                <form action={updateWorkTaskStatus} className="mt-3 flex gap-3"><input type="hidden" name="taskId" value={selectedTask.id} /><select name="status" defaultValue={selectedTask.status} className={inputClass}>{taskStatuses.map((status) => <option key={status} value={status}>{status === "REVIEW" ? "Waiting for QC" : taskStatusLabels[status]}</option>)}</select><button className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white">Move</button></form>
                {selectedTask.status === "REVIEW" ? <form action={reviewWorkTask} className="mt-3"><input type="hidden" name="taskId" value={selectedTask.id} /><textarea name="reviewNotes" className={`${inputClass} min-h-20 py-3`} placeholder="QC/review notes" /><button className="mt-3 h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white">Approve Review & Complete</button></form> : null}
              </section>

              <details className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <summary className="cursor-pointer list-none text-sm font-black text-slate-950 dark:text-white">Edit assignment & deadline</summary>
                <form action={updateWorkTaskAssignment} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="taskId" value={selectedTask.id} />
                  <div><label className={labelClass}>Team</label><select name="teamId" defaultValue={selectedTask.teamId} className={inputClass}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
                  <div><label className={labelClass}>Assignee</label><select name="assigneeId" defaultValue={selectedTask.assigneeId ?? ""} className={inputClass}><option value="">Team pool</option>{selectedTask.team.members.filter((member) => member.user.status === "ACTIVE").map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name}</option>)}</select></div>
                  <div><label className={labelClass}>Priority</label><select name="priority" defaultValue={selectedTask.priority} className={inputClass}>{taskPriorities.map((priority) => <option key={priority} value={priority}>{taskPriorityLabels[priority]}</option>)}</select></div>
                  <div><label className={labelClass}>Type</label><select name="taskType" defaultValue={selectedTask.taskType} className={inputClass}>{taskTypes.map((type) => <option key={type} value={type}>{getTaskTypeLabel(type)}</option>)}</select></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Due Date</label><input name="dueAt" type="datetime-local" defaultValue={formatTaskDateTimeInput(selectedTask.dueAt)} className={inputClass} /></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Blocker Reason</label><textarea name="blockerReason" defaultValue={selectedTask.blockerReason ?? ""} className={`${inputClass} min-h-20 py-3`} /></div>
                  <input type="hidden" name="calendarStatus" value={selectedTask.calendarStatus} /><input type="hidden" name="calendarReminderAt" value="" /><input type="hidden" name="calendarNotes" value={selectedTask.calendarNotes ?? ""} />
                  <button className="sm:col-span-2 h-11 rounded-xl bg-slate-950 text-sm font-black text-white dark:bg-white dark:text-slate-950">Save Assignment</button>
                </form>
              </details>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-black text-slate-950 dark:text-white">Comments ({selectedTask.comments.length})</h3>
                <form action={addWorkTaskComment} className="mt-3"><input type="hidden" name="taskId" value={selectedTask.id} /><textarea name="body" className={`${inputClass} min-h-20 py-3`} placeholder="Add an update or comment..." required /><button className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white">Add Comment</button></form>
                <div className="mt-4 space-y-3">{selectedTask.comments.map((comment) => <div key={comment.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="flex justify-between gap-3"><p className="text-xs font-black text-slate-950 dark:text-white">{comment.createdBy?.name ?? "Former user"}</p><p className="text-[10px] text-slate-400">{formatTaskDate(comment.createdAt)}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{comment.body}</p></div>)}</div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-black text-slate-950 dark:text-white">Activity</h3><div className="mt-4 space-y-4">{selectedTask.activities.map((activity) => <div key={activity.id} className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" /><div><p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{activity.message}</p><p className="mt-1 text-[10px] text-slate-400">{activity.actor?.name ?? "System"} · {formatTaskDate(activity.createdAt)}</p></div></div>)}</div></section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
