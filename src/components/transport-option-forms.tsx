"use client";

import { useFormStatus } from "react-dom";
import {
  createTransportOptionAction,
  toggleTransportOptionAction,
  updateTransportOptionAction,
} from "@/app/internal/transport/actions";

export const TRANSPORT_OPTION_SCROLL_KEY =
  "sanghvi:transport-option-scroll-position";

function preserveScroll() {
  try {
    window.sessionStorage.setItem(
      TRANSPORT_OPTION_SCROLL_KEY,
      String(window.scrollY),
    );
  } catch {
    // Form actions remain functional without browser storage.
  }
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  tone = "blue",
}: {
  idleLabel: string;
  pendingLabel: string;
  tone?: "blue" | "slate" | "emerald" | "rose";
}) {
  const { pending } = useFormStatus();
  const tones = {
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    slate:
      "border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200",
    emerald:
      "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    rose: "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-11 rounded-xl px-4 text-xs font-black transition disabled:cursor-wait disabled:opacity-60 ${tones[tone]}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

const labelClass =
  "text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400";
const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-slate-950 dark:text-white";

export function CreateTransportOptionForm() {
  return (
    <form
      action={createTransportOptionAction}
      onSubmit={preserveScroll}
      className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_100px_auto] lg:items-end"
    >
      <label className="block">
        <span className={labelClass}>Transport Name</span>
        <input
          name="name"
          placeholder="Tempo"
          maxLength={80}
          className={inputClass}
          required
        />
      </label>
      <label className="block">
        <span className={labelClass}>Operational Description</span>
        <input
          name="description"
          placeholder="Local delivery by tempo or mini truck"
          maxLength={300}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Sort Order</span>
        <input
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          step={1}
          defaultValue={60}
          className={inputClass}
        />
      </label>
      <SubmitButton
        idleLabel="Add Option"
        pendingLabel="Adding…"
        tone="blue"
      />
    </form>
  );
}

export function UpdateTransportOptionForm({
  option,
}: {
  option: {
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
  };
}) {
  return (
    <form
      action={updateTransportOptionAction}
      onSubmit={preserveScroll}
      className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_100px_auto] lg:items-end"
    >
      <input type="hidden" name="id" value={option.id} />
      <label className="block">
        <span className={labelClass}>Name</span>
        <input
          name="name"
          defaultValue={option.name}
          maxLength={80}
          className={inputClass}
          required
        />
      </label>
      <label className="block">
        <span className={labelClass}>Description</span>
        <input
          name="description"
          defaultValue={option.description ?? ""}
          maxLength={300}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Order</span>
        <input
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          step={1}
          defaultValue={option.sortOrder}
          className={inputClass}
        />
      </label>
      <SubmitButton
        idleLabel="Save Changes"
        pendingLabel="Saving…"
        tone="slate"
      />
    </form>
  );
}

export function ToggleTransportOptionForm({
  option,
}: {
  option: {
    id: string;
    name: string;
    isActive: boolean;
  };
}) {
  return (
    <form
      action={toggleTransportOptionAction}
      onSubmit={(event) => {
        if (
          option.isActive &&
          !window.confirm(
            `Disable “${option.name}” for future QC assignments? Existing order history will be preserved.`,
          )
        ) {
          event.preventDefault();
          return;
        }

        preserveScroll();
      }}
    >
      <input type="hidden" name="id" value={option.id} />
      <input
        type="hidden"
        name="nextActive"
        value={option.isActive ? "false" : "true"}
      />
      <SubmitButton
        idleLabel={option.isActive ? "Disable Option" : "Enable Option"}
        pendingLabel={option.isActive ? "Disabling…" : "Enabling…"}
        tone={option.isActive ? "rose" : "emerald"}
      />
    </form>
  );
}
