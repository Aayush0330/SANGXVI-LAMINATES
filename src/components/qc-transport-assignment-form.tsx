"use client";

import { assignTransportFromQcAction } from "@/app/internal/qc/actions";

const QC_SCROLL_STORAGE_KEY = "sanghvi:qc-scroll-position";

export type QcDriverOption = {
  id: string;
  name: string;
  phone: string | null;
};

export type QcTransportOption = {
  id: string;
  name: string;
};

export function QcTransportAssignmentForm({
  orderId,
  drivers,
  transportOptions,
}: {
  orderId: string;
  drivers: QcDriverOption[];
  transportOptions: QcTransportOption[];
}) {
  function preserveCurrentScrollPosition() {
    try {
      window.sessionStorage.setItem(
        QC_SCROLL_STORAGE_KEY,
        String(window.scrollY),
      );
    } catch {
      // Scroll restoration is a progressive enhancement. The action should
      // still continue when browser storage is unavailable.
    }
  }

  return (
    <form
      action={assignTransportFromQcAction}
      onSubmit={preserveCurrentScrollPosition}
      className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10 sm:p-5"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="focusOrderId" value={orderId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-200">
            Final operations handoff
          </p>
          <h3 className="mt-1 font-black text-slate-950 dark:text-white">
            Assign delivery
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Select the approved vehicle option and the responsible driver. This
            publishes the delivery to field operations.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
          QC clear
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Transport option
          </span>
          <select
            name="transportOptionId"
            defaultValue=""
            className="mt-2 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 dark:border-blue-500/20 dark:bg-slate-950 dark:text-slate-100"
            required
          >
            <option value="">Select transport</option>
            {transportOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Driver
          </span>
          <select
            name="driverId"
            defaultValue=""
            className="mt-2 h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 dark:border-blue-500/20 dark:bg-slate-950 dark:text-slate-100"
            required
          >
            <option value="">Select driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
                {driver.phone ? ` · ${driver.phone}` : ""}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={drivers.length === 0 || transportOptions.length === 0}
          className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          Assign & publish
        </button>
      </div>

      {drivers.length === 0 || transportOptions.length === 0 ? (
        <p className="mt-3 text-xs font-bold text-rose-700 dark:text-rose-300">
          {drivers.length === 0
            ? "Add an active Driver / Transport user before assignment."
            : "Enable at least one transport option before assignment."}
        </p>
      ) : null}
    </form>
  );
}

export { QC_SCROLL_STORAGE_KEY };
