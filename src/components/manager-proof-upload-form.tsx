"use client";

import { useFormStatus } from "react-dom";
import {
  replaceDeliveryProofAction,
  uploadManagerAssistedDeliveryProofAction,
} from "@/app/internal/delivery-proofs/actions";

export const MANAGER_PROOF_SCROLL_KEY =
  "sangxvi:manager-delivery-proof-scroll-position";

function preserveScroll() {
  try {
    window.sessionStorage.setItem(
      MANAGER_PROOF_SCROLL_KEY,
      String(window.scrollY),
    );
  } catch {
    // The upload should still work if browser storage is unavailable.
  }
}

function ProofSubmitButton({
  idleLabel,
  pendingLabel,
  tone = "blue",
}: {
  idleLabel: string;
  pendingLabel: string;
  tone?: "blue" | "amber";
}) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "amber"
      ? "bg-amber-600 shadow-amber-600/20 hover:bg-amber-700"
      : "bg-blue-600 shadow-blue-600/20 hover:bg-blue-700";

  return (
    <button
      disabled={pending}
      className={`h-12 rounded-2xl px-6 text-sm font-black text-white shadow-lg transition disabled:cursor-wait disabled:opacity-60 ${toneClass}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function ProofFileInput({ label = "Proof File" }: { label?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        name="signedInvoice"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:file:bg-blue-500"
        required
      />
      <span className="mt-1.5 block text-[10px] font-semibold text-slate-400">
        JPG, PNG, WebP or PDF · maximum 3 MB
      </span>
    </label>
  );
}

export function ManagerProofUploadForm({ orderId }: { orderId: string }) {
  return (
    <form
      action={uploadManagerAssistedDeliveryProofAction}
      onSubmit={preserveScroll}
      className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"
    >
      <input type="hidden" name="orderId" value={orderId} />

      <ProofFileInput />

      <label className="block">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Upload Note
        </span>
        <input
          name="note"
          maxLength={500}
          placeholder="Photo received directly from the driver"
          className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
      </label>

      <ProofSubmitButton
        idleLabel="Upload for Driver"
        pendingLabel="Uploading…"
      />
    </form>
  );
}

export function ReplaceDeliveryProofForm({
  orderId,
}: {
  orderId: string;
}) {
  return (
    <details className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-400/20 dark:bg-amber-500/5">
      <summary className="cursor-pointer list-none text-xs font-black text-amber-700 dark:text-amber-300">
        Replace incorrect proof
      </summary>
      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
        Replacement is manager-only. The old proof stays in the audit history and a reason is mandatory.
      </p>

      <form
        action={replaceDeliveryProofAction}
        onSubmit={preserveScroll}
        className="mt-4 grid gap-4"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <ProofFileInput label="Corrected Proof File" />

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Replacement Reason
          </span>
          <textarea
            name="replacementReason"
            required
            minLength={10}
            maxLength={500}
            placeholder="Explain why the existing proof is incorrect"
            className="mt-2 min-h-24 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-amber-400/25 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            New Proof Note
          </span>
          <input
            name="note"
            maxLength={500}
            placeholder="Optional note for the corrected proof"
            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <div className="flex justify-end">
          <ProofSubmitButton
            idleLabel="Replace Proof"
            pendingLabel="Replacing…"
            tone="amber"
          />
        </div>
      </form>
    </details>
  );
}
