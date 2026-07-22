"use client";

import { useState } from "react";
import { createPhysicalTeamAction } from "@/app/internal/teams/actions";

type PhysicalWorkerOption = {
  id: string;
  name: string;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
};

const inputClass =
  "h-12 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400";

const selectClass = `${inputClass} appearance-none pr-11`;

const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 0.9rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "17px 17px",
} as const;

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function optionLabel(worker: PhysicalWorkerOption) {
  return worker.assignedTeamName
    ? `${worker.name} — Assigned to ${worker.assignedTeamName}`
    : worker.name;
}

export function PhysicalTeamCreateForm({
  workers,
}: {
  workers: PhysicalWorkerOption[];
}) {
  const [leadUserId, setLeadUserId] = useState("");
  const [initialMemberId, setInitialMemberId] = useState("");

  function handleLeadChange(value: string) {
    setLeadUserId(value);
    if (value && value === initialMemberId) {
      setInitialMemberId("");
    }
  }

  return (
    <form action={createPhysicalTeamAction} className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
      <div className="min-w-0">
        <label className={labelClass}>Team Name</label>
        <input
          name="name"
          className={inputClass}
          placeholder="e.g. Packing Team A"
          required
        />
      </div>

      <div className="min-w-0">
        <label className={labelClass}>Team Lead</label>
        <select
          name="leadUserId"
          value={leadUserId}
          onChange={(event) => handleLeadChange(event.target.value)}
          className={selectClass}
          style={selectArrowStyle}
        >
          <option value="">Select team lead</option>
          {workers.map((worker) => (
            <option
              key={worker.id}
              value={worker.id}
              disabled={Boolean(worker.assignedTeamId)}
            >
              {optionLabel(worker)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0 md:col-span-2">
        <label className={labelClass}>Work Area / Instructions</label>
        <textarea
          name="description"
          rows={3}
          className="min-h-24 w-full min-w-0 resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder="e.g. Verify product, quantity, damage, shade, packing readiness, and report issues."
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Keep instructions focused on physical verification and QC readiness.
        </p>
      </div>

      <div className="min-w-0">
        <label className={labelClass}>Add Initial Worker</label>
        <select
          name="initialMemberId"
          value={initialMemberId}
          onChange={(event) => setInitialMemberId(event.target.value)}
          className={selectClass}
          style={selectArrowStyle}
        >
          <option value="">Select worker</option>
          {workers.map((worker) => {
            const isSelectedLead = worker.id === leadUserId;
            return (
              <option
                key={worker.id}
                value={worker.id}
                disabled={Boolean(worker.assignedTeamId) || isSelectedLead}
              >
                {isSelectedLead
                  ? `${worker.name} — Selected as Team Lead`
                  : optionLabel(worker)}
              </option>
            );
          })}
        </select>
      </div>

      <div className="flex items-end md:justify-end">
        <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 md:w-auto">
          <PlusIcon />
          Create Team
        </button>
      </div>
    </form>
  );
}
