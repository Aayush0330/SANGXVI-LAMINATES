"use client";

import { useFormStatus } from "react-dom";
import {
  cancelManagerProofUploadRequestAction,
  markDeliveredAction,
  markOnTheWayAction,
  requestManagerProofUploadAction,
  uploadSignedInvoiceProofAction,
} from "@/app/field/deliveries/actions";

export const DRIVER_DELIVERY_SCROLL_KEY =
  "sangxvi:driver-delivery-scroll-position";

function preserveScroll() {
  try {
    window.sessionStorage.setItem(
      DRIVER_DELIVERY_SCROLL_KEY,
      String(window.scrollY),
    );
  } catch {
    // Actions remain functional without browser storage.
  }
}

function PendingButton({
  idleLabel,
  pendingLabel,
  className,
}: {
  idleLabel: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function MarkOnTheWayForm({ orderId }: { orderId: string }) {
  return (
    <form action={markOnTheWayAction} onSubmit={preserveScroll}>
      <input type="hidden" name="orderId" value={orderId} />
      <PendingButton
        idleLabel="Start Delivery"
        pendingLabel="Starting…"
        className="min-h-14 w-full rounded-2xl bg-orange-600 px-6 py-3 text-base font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 sm:w-auto"
      />
    </form>
  );
}

export function MarkDeliveredForm({ orderId }: { orderId: string }) {
  return (
    <form action={markDeliveredAction} onSubmit={preserveScroll}>
      <input type="hidden" name="orderId" value={orderId} />
      <PendingButton
        idleLabel="Delivery Completed"
        pendingLabel="Saving…"
        className="min-h-14 w-full rounded-2xl bg-emerald-600 px-6 py-3 text-base font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 sm:w-auto"
      />
    </form>
  );
}

export function DriverProofOptions({
  orderId,
  assistanceRequested,
}: {
  orderId: string;
  assistanceRequested: boolean;
}) {
  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      <details className="group rounded-[22px] border border-blue-200 bg-white p-5 open:ring-4 open:ring-blue-500/10 dark:border-blue-400/30 dark:bg-slate-950/80 dark:open:ring-blue-400/10">
        <summary className="cursor-pointer list-none">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-2xl dark:bg-blue-500/15">
              📷
            </div>
            <div>
              <p className="text-base font-black text-slate-950 dark:text-white">
                Upload Proof Myself
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-300">
                Take a rear-camera photo or choose a saved image/PDF.
              </p>
            </div>
          </div>
        </summary>

        <form
          action={uploadSignedInvoiceProofAction}
          onSubmit={preserveScroll}
          className="mt-5 grid gap-3"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <label>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Proof File
            </span>
            <input
              name="signedInvoice"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:file:bg-blue-500"
              required
            />
            <span className="mt-1.5 block text-[10px] font-semibold text-slate-400">
              JPG, PNG, WebP or PDF · maximum 3 MB
            </span>
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Note
            </span>
            <input
              name="note"
              maxLength={500}
              placeholder="Signed by dealer / receiver"
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400"
            />
          </label>
          <PendingButton
            idleLabel="Upload Delivery Proof"
            pendingLabel="Uploading…"
            className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700"
          />
        </form>
      </details>

      <div className="rounded-[22px] border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-400/25 dark:bg-violet-950/25">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-2xl dark:bg-violet-500/15">
            🙋
          </div>
          <div>
            <p className="text-base font-black text-slate-950 dark:text-white">
              Ask Manager to Upload
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-300">
              Use this when you sent the proof photo to your manager.
            </p>
          </div>
        </div>

        {assistanceRequested ? (
          <div className="mt-5 rounded-2xl border border-violet-200 bg-white px-4 py-4 text-sm font-black text-violet-700 dark:border-violet-400/30 dark:bg-slate-950/80 dark:text-violet-300">
            Request sent to Manager ✓
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
              You can still upload the proof yourself. A successful self-upload closes this manager request automatically.
            </p>
            <form
              action={cancelManagerProofUploadRequestAction}
              onSubmit={preserveScroll}
              className="mt-3"
            >
              <input type="hidden" name="orderId" value={orderId} />
              <PendingButton
                idleLabel="Cancel Manager Request"
                pendingLabel="Cancelling…"
                className="h-10 w-full rounded-xl border border-violet-200 bg-white px-4 text-xs font-black text-violet-700 transition hover:bg-violet-50 dark:border-violet-400/30 dark:bg-slate-950 dark:text-violet-300 dark:hover:bg-violet-500/10"
              />
            </form>
          </div>
        ) : (
          <form
            action={requestManagerProofUploadAction}
            onSubmit={preserveScroll}
            className="mt-5"
          >
            <input type="hidden" name="orderId" value={orderId} />
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Optional Note
              </span>
              <input
                name="requestNote"
                maxLength={500}
                placeholder="Photo sent directly to the manager"
                className="mt-2 h-12 w-full rounded-2xl border border-violet-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-violet-500 dark:border-violet-400/30 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-violet-400"
              />
            </label>
            <PendingButton
              idleLabel="Send Request to Manager"
              pendingLabel="Sending…"
              className="mt-3 h-12 w-full rounded-2xl bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-700"
            />
          </form>
        )}
      </div>
    </div>
  );
}
