"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  cancelManagerProofUploadRequestAction,
  markDeliveredAction,
  markOnTheWayAction,
  requestManagerProofUploadAction,
  uploadSignedInvoiceProofAction,
} from "@/app/field/deliveries/actions";
import { ErpIcon } from "@/components/erp-icon";

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
      type="submit"
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
        idleLabel="Start Route"
        pendingLabel="Starting Route…"
        className="min-h-12 w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 sm:w-auto"
      />
    </form>
  );
}

export function MarkDeliveredForm({ orderId }: { orderId: string }) {
  return (
    <form
      action={markDeliveredAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Confirm that the complete order quantity was delivered to the dealer. This will consume all reserved stock for this order.",
        );

        if (!confirmed) {
          event.preventDefault();
          return;
        }

        preserveScroll();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <PendingButton
        idleLabel="Confirm Complete Delivery"
        pendingLabel="Completing Delivery…"
        className="min-h-12 w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 sm:w-auto"
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
  const [mode, setMode] = useState<"self" | "manager">(
    assistanceRequested ? "manager" : "self",
  );

  return (
    <div className="mt-5 overflow-hidden rounded-[20px] border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/70">
      <div
        className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 p-1.5 dark:border-white/10 dark:bg-white/[0.035]"
        role="group"
        aria-label="Delivery proof upload options"
      >
        <button
          type="button"
          onClick={() => setMode("self")}
          aria-pressed={mode === "self"}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition ${
            mode === "self"
              ? "bg-white text-blue-700 shadow-sm dark:bg-blue-600 dark:text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <ErpIcon name="quality" className="h-4 w-4" />
          Upload Myself
        </button>
        <button
          type="button"
          onClick={() => setMode("manager")}
          aria-pressed={mode === "manager"}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition ${
            mode === "manager"
              ? "bg-white text-violet-700 shadow-sm dark:bg-violet-600 dark:text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <ErpIcon name="users" className="h-4 w-4" />
          Manager Help
        </button>
      </div>

      {mode === "self" ? (
        <form
          action={uploadSignedInvoiceProofAction}
          onSubmit={preserveScroll}
          className="grid gap-4 p-4 sm:p-5"
        >
          <div>
            <h4 className="font-black text-slate-950 dark:text-white">
              Upload signed duplicate invoice
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Use the rear camera or choose an existing image/PDF. A successful
              self-upload automatically closes any pending manager request.
            </p>
          </div>
          <input type="hidden" name="orderId" value={orderId} />
          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Signed Proof File
            </span>
            <input
              name="signedInvoice"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:file:bg-blue-500"
              required
            />
            <span className="mt-1.5 block text-[10px] font-semibold text-slate-400">
              JPG, PNG, WebP or PDF · maximum 3 MB
            </span>
          </label>
          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Proof Note
            </span>
            <input
              name="note"
              maxLength={500}
              placeholder="Signed by dealer or receiver"
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <PendingButton
            idleLabel="Upload & Complete Record"
            pendingLabel="Uploading Proof…"
            className="h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 sm:w-fit"
          />
        </form>
      ) : (
        <div className="p-4 sm:p-5">
          <div>
            <h4 className="font-black text-slate-950 dark:text-white">
              Request a manager upload
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Use this only after sending the signed proof file to an authorized
              manager. The delivery record will still show you as the person who
              delivered it.
            </p>
          </div>

          {assistanceRequested ? (
            <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-400/25 dark:bg-violet-500/10">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  <ErpIcon name="quality" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-violet-800 dark:text-violet-200">
                    Manager request is active
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    You can still switch to self-upload. The manager task closes
                    automatically when your proof is accepted.
                  </p>
                </div>
              </div>
              <form
                action={cancelManagerProofUploadRequestAction}
                onSubmit={preserveScroll}
                className="mt-4"
              >
                <input type="hidden" name="orderId" value={orderId} />
                <PendingButton
                  idleLabel="Cancel Manager Request"
                  pendingLabel="Cancelling Request…"
                  className="h-10 w-full rounded-xl border border-violet-200 bg-white px-4 text-xs font-black text-violet-700 transition hover:bg-violet-100 dark:border-violet-400/30 dark:bg-slate-950 dark:text-violet-300"
                />
              </form>
            </div>
          ) : (
            <form
              action={requestManagerProofUploadAction}
              onSubmit={preserveScroll}
              className="mt-4 grid gap-3"
            >
              <input type="hidden" name="orderId" value={orderId} />
              <label>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Message for Manager
                </span>
                <input
                  name="requestNote"
                  maxLength={500}
                  placeholder="Proof photo sent directly to the manager"
                  className="mt-2 h-12 w-full rounded-xl border border-violet-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 dark:border-violet-400/30 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <PendingButton
                idleLabel="Send Manager Request"
                pendingLabel="Sending Request…"
                className="h-12 w-full rounded-xl bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-700 sm:w-fit"
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
