"use client";

import { assignTransportFromQcAction } from "@/app/internal/qc/actions";

const QC_SCROLL_STORAGE_KEY = "sangxvi:qc-scroll-position";

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
      className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <h3 className="font-black text-slate-950">Assign Delivery Transport</h3>
      <p className="mt-1 text-xs text-slate-500">
        QC Team assigns the vehicle/auto and driver directly. No extra dispatch
        team comes after this step.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Transport / Auto / Vehicle
          </span>
          <select
            name="transportOptionId"
            defaultValue=""
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold"
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
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Driver
          </span>
          <select
            name="driverId"
            defaultValue=""
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold"
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
          disabled={drivers.length === 0 || transportOptions.length === 0}
          className="h-12 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Assign Delivery
        </button>
      </div>
    </form>
  );
}

export { QC_SCROLL_STORAGE_KEY };
