"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createWorkTask } from "@/app/internal/tasks/actions";

export type TaskPersonOption = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
};

export type TaskPhysicalTeamOption = {
  id: string;
  name: string;
  memberCount: number;
};

export type TaskRoleOption = {
  value: string;
  label: string;
  activeUsers: number;
};

type AssignmentMode = "PERSON" | "ROLE" | "PHYSICAL_TEAM";
type DrawerMode = "manual" | "blocker";

type PurposeOption = {
  value: string;
  title: string;
  helper: string;
  icon: string;
  tone: string;
};

const purposeOptions: PurposeOption[] = [
  {
    value: "FOLLOW_UP",
    title: "Call / Follow-up",
    helper: "Dealer, customer, vendor or internal follow-up",
    icon: "☎",
    tone: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
  },
  {
    value: "OFFICE_WORK",
    title: "Office Work",
    helper: "Documentation, reports or normal office work",
    icon: "▤",
    tone: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
  },
  {
    value: "PAYMENT_COLLECTION",
    title: "Payment / Collection",
    helper: "Payment reminder, collection or reconciliation",
    icon: "₹",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  {
    value: "FIELD_VISIT",
    title: "Field Visit",
    helper: "Customer visit, survey or on-site follow-up",
    icon: "⌖",
    tone: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  },
  {
    value: "REMINDER",
    title: "Reminder",
    helper: "A simple reminder with a due date",
    icon: "◷",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300",
  },
  {
    value: "OTHER",
    title: "Other Task",
    helper: "Any manual work not covered above",
    icon: "+",
    tone: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
];

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

function AssignmentChoice({
  active,
  title,
  helper,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  helper: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? "border-blue-500 bg-blue-50 shadow-sm ring-4 ring-blue-500/10 dark:bg-blue-500/10"
          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      }`}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-xl text-lg font-black ${
          active
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        {icon}
      </span>
      <span className="mt-3 block text-sm font-black text-slate-950 dark:text-white">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{helper}</span>
    </button>
  );
}

export function TaskCreateDrawer({
  people,
  physicalTeams,
  roles,
  closeHref,
  mode = "manual",
}: {
  people: TaskPersonOption[];
  physicalTeams: TaskPhysicalTeamOption[];
  roles: TaskRoleOption[];
  closeHref: string;
  mode?: DrawerMode;
}) {
  const [purpose, setPurpose] = useState("FOLLOW_UP");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("PERSON");
  const [assignmentValue, setAssignmentValue] = useState(people[0]?.id ?? "");
  const isBlocker = mode === "blocker";

  const assignmentOptions = useMemo(() => {
    if (assignmentMode === "PERSON") {
      return people.map((person) => ({
        value: person.id,
        label: `${person.name} · ${person.roleLabel}`,
        helper: person.email,
      }));
    }

    if (assignmentMode === "ROLE") {
      return roles.map((role) => ({
        value: role.value,
        label: role.label,
        helper: `${role.activeUsers} active user${role.activeUsers === 1 ? "" : "s"}`,
      }));
    }

    return physicalTeams.map((team) => ({
      value: team.id,
      label: team.name,
      helper: `${team.memberCount} member${team.memberCount === 1 ? "" : "s"}`,
    }));
  }, [assignmentMode, people, physicalTeams, roles]);

  function chooseAssignmentMode(nextMode: AssignmentMode) {
    setAssignmentMode(nextMode);

    if (nextMode === "PERSON") {
      setAssignmentValue(people[0]?.id ?? "");
    } else if (nextMode === "ROLE") {
      setAssignmentValue(roles[0]?.value ?? "");
    } else {
      setAssignmentValue(physicalTeams[0]?.id ?? "");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-sm">
      <Link href={closeHref} aria-label="Close task panel" className="absolute inset-0" />

      <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <header className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <p
              className={`text-[10px] font-black uppercase tracking-[0.22em] ${
                isBlocker ? "text-rose-600 dark:text-rose-300" : "text-blue-600 dark:text-blue-300"
              }`}
            >
              {isBlocker ? "Workflow problem" : "Manual work item"}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
              {isBlocker ? "Report Blocker" : "New Manual Task"}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isBlocker
                ? "Record what is stopping the work and assign someone to resolve it."
                : "Workflow tasks are created automatically. Use this form only for manual work."}
            </p>
          </div>
          <Link
            href={closeHref}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            ×
          </Link>
        </header>

        <form action={createWorkTask} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="creationKind" value={isBlocker ? "BLOCKER" : "MANUAL"} />
          <input type="hidden" name="purpose" value={purpose} />
          <input type="hidden" name="assignmentMode" value={assignmentMode} />
          <input type="hidden" name="assignmentValue" value={assignmentValue} />

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {!isBlocker ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">What kind of work is this?</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Select one simple purpose. The system will configure the task type automatically.
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {purposeOptions.map((option) => {
                    const active = purpose === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPurpose(option.value)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? `${option.tone} ring-4 ring-blue-500/10`
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="text-xl font-black">{option.icon}</span>
                        <span className="ml-3 text-sm font-black">{option.title}</span>
                        <span className="mt-2 block text-xs leading-5 opacity-75">{option.helper}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-black text-slate-950 dark:text-white">
                {isBlocker ? "What is blocked?" : "Task details"}
              </h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelClass}>{isBlocker ? "Short problem title" : "What needs to be done?"}</label>
                  <input
                    name="title"
                    className={inputClass}
                    placeholder={isBlocker ? "e.g. Quantity mismatch is stopping verification" : "e.g. Call dealer about pending confirmation"}
                    required
                    maxLength={180}
                  />
                </div>

                <div>
                  <label className={labelClass}>{isBlocker ? "Blocker reason" : "Instructions / expected outcome"}</label>
                  <textarea
                    name={isBlocker ? "blockerReason" : "description"}
                    className={`${inputClass} min-h-28 resize-y py-3`}
                    placeholder={
                      isBlocker
                        ? "Explain exactly what is stopping the work and what must be resolved."
                        : "Add short, clear instructions so the assignee knows what to do."
                    }
                    required={isBlocker}
                    maxLength={isBlocker ? 1200 : 4000}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h3 className="text-sm font-black text-slate-950 dark:text-white">Who should handle it?</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Assign the work directly to a person, a role/department, or one physical team.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <AssignmentChoice
                  active={assignmentMode === "PERSON"}
                  title="Specific Person"
                  helper="One named person owns this task"
                  icon="●"
                  onClick={() => chooseAssignmentMode("PERSON")}
                />
                <AssignmentChoice
                  active={assignmentMode === "ROLE"}
                  title="Role / Department"
                  helper="The role pool can pick up the task"
                  icon="◫"
                  onClick={() => chooseAssignmentMode("ROLE")}
                />
                <AssignmentChoice
                  active={assignmentMode === "PHYSICAL_TEAM"}
                  title="Physical Team"
                  helper="Assign to one ground verification team"
                  icon="◎"
                  onClick={() => chooseAssignmentMode("PHYSICAL_TEAM")}
                />
              </div>

              <div className="mt-4">
                <label className={labelClass}>
                  {assignmentMode === "PERSON"
                    ? "Select person"
                    : assignmentMode === "ROLE"
                      ? "Select role / department"
                      : "Select physical team"}
                </label>
                <select
                  value={assignmentValue}
                  onChange={(event) => setAssignmentValue(event.target.value)}
                  className={inputClass}
                  required
                >
                  {assignmentOptions.length ? (
                    assignmentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} — {option.helper}
                      </option>
                    ))
                  ) : (
                    <option value="">No available option</option>
                  )}
                </select>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-black text-slate-950 dark:text-white">Deadline & priority</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Due date</label>
                  <input name="dueAt" type="datetime-local" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <select name="priority" defaultValue={isBlocker ? "HIGH" : "MEDIUM"} className={inputClass}>
                    {!isBlocker ? <option value="LOW">Low</option> : null}
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>
            </section>

            <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer list-none text-sm font-black text-slate-950 dark:text-white">
                Advanced options
                <span className="ml-2 text-xs font-semibold text-slate-400">Optional</span>
              </summary>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Link this task with an order, product, dealer, invoice, or add a separate reminder.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Link order / dealer / product</label>
                  <input
                    name="relatedReference"
                    className={inputClass}
                    placeholder="e.g. ORD-2026-60774 or dealer name"
                    maxLength={180}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reminder date</label>
                  <input name="calendarReminderAt" type="datetime-local" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Reminder note</label>
                  <input
                    name="calendarNotes"
                    className={inputClass}
                    placeholder="Optional reminder note"
                    maxLength={1200}
                  />
                </div>
              </div>
            </details>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
            <Link
              href={closeHref}
              className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black leading-[46px] text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </Link>
            <button
              disabled={!assignmentValue}
              className={`h-12 rounded-xl px-6 text-sm font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isBlocker
                  ? "bg-rose-600 shadow-rose-600/20 hover:bg-rose-700"
                  : "bg-blue-600 shadow-blue-600/20 hover:bg-blue-700"
              }`}
            >
              {isBlocker ? "Report Blocker" : "Create Manual Task"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
