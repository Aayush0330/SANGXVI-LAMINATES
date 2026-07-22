"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkTaskStatus } from "@/app/internal/tasks/actions";

export type KanbanTask = {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  priorityLabel: string;
  taskType: string;
  taskTypeLabel: string;
  sourceLabel: "Auto Task" | "Manual Task";
  relatedReference: string | null;
  relatedModuleLabel: string;
  blockerReason: string | null;
  dueLabel: string;
  dueShort: string;
  isOverdue: boolean;
  teamName: string;
  assigneeName: string | null;
  assigneeInitials: string;
  commentCount: number;
  subTaskCount: number;
  detailsHref: string;
};

type Column = {
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "BLOCKED" | "DONE";
  label: string;
  emptyLabel: string;
  headerClass: string;
  countClass: string;
  bodyClass: string;
};

const columns: Column[] = [
  {
    status: "TODO",
    label: "To Do",
    emptyLabel: "No tasks waiting to start.",
    headerClass: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
    countClass: "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    bodyClass: "bg-slate-50/70 dark:bg-slate-950/40",
  },
  {
    status: "IN_PROGRESS",
    label: "In Progress",
    emptyLabel: "No work is currently active.",
    headerClass: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
    countClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
    bodyClass: "bg-blue-50/45 dark:bg-blue-950/10",
  },
  {
    status: "REVIEW",
    label: "Waiting for QC",
    emptyLabel: "Nothing is waiting for review.",
    headerClass: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    countClass: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    bodyClass: "bg-violet-50/45 dark:bg-violet-950/10",
  },
  {
    status: "BLOCKED",
    label: "Blocked",
    emptyLabel: "No blockers need attention.",
    headerClass: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    countClass: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    bodyClass: "bg-rose-50/45 dark:bg-rose-950/10",
  },
  {
    status: "DONE",
    label: "Completed",
    emptyLabel: "Completed work will appear here.",
    headerClass: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    countClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    bodyClass: "bg-emerald-50/45 dark:bg-emerald-950/10",
  },
];

const priorityClass: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  HIGH: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  URGENT: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function Icon({ name, className = "h-4 w-4" }: { name: "message" | "subtask" | "clock" | "warning" | "grip"; className?: string }) {
  const paths = {
    message: <path d="M5 5h14v10H9l-4 4V5Z" />,
    subtask: <path d="M6 7h6M6 12h12M6 17h9" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    warning: <><path d="M10.3 3.8 2.5 18a2 2 0 0 0 1.75 3h15.5a2 2 0 0 0 1.75-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    grip: <><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function TaskCard({ task, onDragStart }: { task: KanbanTask; onDragStart: (taskId: string) => void }) {
  return (
    <article
      draggable
      onDragStart={() => onDragStart(task.id)}
      className="group relative cursor-grab rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/5 active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">{task.taskNumber}</p>
          <Link href={task.detailsHref} className="mt-1.5 block text-sm font-black leading-5 text-slate-950 transition hover:text-blue-600 dark:text-white dark:hover:text-blue-300">
            {task.title}
          </Link>
          {task.relatedReference ? (
            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{task.relatedReference}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2 py-1 text-[9px] font-black ${task.sourceLabel === "Auto Task" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"}`}>
            {task.sourceLabel}
          </span>
          <span className="text-slate-300 opacity-0 transition group-hover:opacity-100 dark:text-slate-600"><Icon name="grip" /></span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-[9px] font-black text-white">
          {task.assigneeInitials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{task.assigneeName ?? task.teamName}</p>
          <p className="truncate text-[10px] text-slate-400">{task.assigneeName ? task.teamName : "Team pool"}</p>
        </div>
      </div>

      {task.blockerReason ? (
        <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-2.5 dark:border-rose-500/20 dark:bg-rose-500/10">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 dark:text-rose-300"><Icon name="warning" className="h-3.5 w-3.5" /> Blocker Reason</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-rose-700/90 dark:text-rose-200">{task.blockerReason}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${priorityClass[task.priority] ?? priorityClass.MEDIUM}`}>
          {task.priorityLabel}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {task.taskTypeLabel}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {task.relatedModuleLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className={`inline-flex items-center gap-1 text-[10px] font-black ${task.isOverdue ? "text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`} title={task.dueLabel}>
          <Icon name="clock" className="h-3.5 w-3.5" /> {task.dueShort}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
          <span className="inline-flex items-center gap-1"><Icon name="message" className="h-3.5 w-3.5" /> {task.commentCount}</span>
          <span className="inline-flex items-center gap-1"><Icon name="subtask" className="h-3.5 w-3.5" /> {task.subTaskCount}</span>
        </div>
      </div>
    </article>
  );
}

export function TaskKanbanBoard({ tasks, createHref }: { tasks: KanbanTask[]; createHref: string }) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const result = new Map<string, KanbanTask[]>();
    for (const column of columns) result.set(column.status, []);
    for (const task of items) {
      if (result.has(task.status)) result.get(task.status)?.push(task);
    }
    return result;
  }, [items]);

  function moveTask(taskId: string, nextStatus: Column["status"]) {
    const task = items.find((item) => item.id === taskId);
    if (!task || task.status === nextStatus) return;

    const previousStatus = task.status;
    setItems((current) => current.map((item) => item.id === taskId ? { ...item, status: nextStatus } : item));

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("taskId", taskId);
        formData.set("status", nextStatus);
        await updateWorkTaskStatus(formData);
        router.refresh();
      } catch {
        setItems((current) => current.map((item) => item.id === taskId ? { ...item, status: previousStatus } : item));
      }
    });
  }

  return (
    <div className="relative">
      {isPending ? (
        <div className="pointer-events-none absolute right-2 top-[-42px] z-20 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-black text-white shadow-lg dark:bg-white dark:text-slate-950">Saving move…</div>
      ) : null}

      <div className="overflow-x-auto pb-3 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin]">
        <div className="grid min-w-[1320px] grid-cols-5 gap-3">
          {columns.map((column) => {
            const columnTasks = grouped.get(column.status) ?? [];
            const isTarget = dropTarget === column.status;
            return (
              <section
                key={column.status}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget(column.status);
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId = draggedTaskId || event.dataTransfer.getData("text/task-id");
                  if (taskId) moveTask(taskId, column.status);
                  setDropTarget(null);
                  setDraggedTaskId(null);
                }}
                className={`min-h-[610px] overflow-hidden rounded-[22px] border transition ${isTarget ? "border-blue-400 ring-4 ring-blue-500/10" : "border-slate-200 dark:border-slate-800"} ${column.bodyClass}`}
              >
                <header className={`flex items-center justify-between border-b px-3.5 py-3 ${column.headerClass}`}>
                  <div className="flex items-center gap-2">
                    <span className={`grid h-6 min-w-6 place-items-center rounded-lg px-1.5 text-[10px] font-black ${column.countClass}`}>{columnTasks.length}</span>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.12em]">{column.label}</h3>
                  </div>
                  <span className="text-lg leading-none opacity-50">⋮</span>
                </header>

                <div className="space-y-3 p-3">
                  {columnTasks.length ? columnTasks.map((task) => (
                    <div
                      key={task.id}
                      onDragStart={(event) => {
                        setDraggedTaskId(task.id);
                        event.dataTransfer.setData("text/task-id", task.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDropTarget(null);
                      }}
                    >
                      <TaskCard task={task} onDragStart={setDraggedTaskId} />
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-10 text-center text-xs font-semibold leading-5 text-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500">
                      {column.emptyLabel}
                    </div>
                  )}

                  <Link href={createHref} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/50 text-xs font-black text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300">
                    <span className="text-lg leading-none">+</span> Add Task
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
