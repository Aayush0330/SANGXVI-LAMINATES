"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  const [showManagerHelp, setShowManagerHelp] = useState(assistanceRequested);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    type: string;
    size: number;
    previewUrl: string | null;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (selectedFile?.previewUrl) {
        URL.revokeObjectURL(selectedFile.previewUrl);
      }
    };
  }, [selectedFile]);

  return (
    <div className="mt-5 overflow-hidden rounded-[22px] border border-blue-200 bg-white shadow-sm shadow-blue-100/60 dark:border-blue-400/25 dark:bg-slate-950/70 dark:shadow-none">
      <div className="flex items-start gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50/60 p-4 dark:border-blue-400/15 dark:from-blue-500/10 dark:to-cyan-500/5 sm:p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <ErpIcon name="quality" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-slate-950 dark:text-white">
              Driver Direct Photo Upload
            </h4>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              Direct from phone
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
            Take a photo from your phone camera or choose the signed delivery
            proof already saved on your device.
          </p>
        </div>
      </div>

      <form
        action={uploadSignedInvoiceProofAction}
        onSubmit={preserveScroll}
        className="grid gap-4 p-4 sm:p-5"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Delivery Proof Photo
          </span>
          <span className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-5 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-blue-400/25 dark:bg-blue-500/5 dark:hover:border-blue-400/60">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <ErpIcon name="quality" className="h-5 w-5" />
            </span>
            <span className="mt-3 text-sm font-black text-blue-700 dark:text-blue-300">
              Open Camera / Choose File
            </span>
            <span className="mt-1 text-[10px] font-semibold text-slate-400">
              JPG, PNG, WebP or PDF · maximum 3 MB
            </span>
            <input
              name="signedInvoice"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="sr-only"
              required
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                if (!file) {
                  setSelectedFile(null);
                  return;
                }

                setSelectedFile({
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  previewUrl: file.type.startsWith("image/")
                    ? URL.createObjectURL(file)
                    : null,
                });
              }}
            />
          </span>
        </label>

        {selectedFile ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-400/20 dark:bg-emerald-500/10">
            {selectedFile.previewUrl ? (
              <span className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5">
                <Image
                  src={selectedFile.previewUrl}
                  alt="Selected delivery proof preview"
                  fill
                  unoptimized
                  sizes="80px"
                  className="object-cover"
                />
              </span>
            ) : (
              <span className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-rose-600 dark:bg-slate-950 dark:text-rose-300">
                PDF
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-emerald-800 dark:text-emerald-200">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to upload
              </p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-black text-white">
              ✓
            </span>
          </div>
        ) : null}

        <label>
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Optional Note
          </span>
          <input
            name="note"
            maxLength={500}
            placeholder="Example: Received and signed by dealer"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <PendingButton
          idleLabel="Upload Photo Directly"
          pendingLabel="Uploading Photo…"
          className="h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        />
        <p className="text-center text-[10px] font-semibold leading-4 text-slate-400">
          The photo is saved with your name, upload time and order number. This
          is not required before confirming delivery.
        </p>
      </form>

      <div className="border-t border-slate-200 p-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => setShowManagerHelp((current) => !current)}
          aria-expanded={showManagerHelp}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-xs font-black text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <span className="inline-flex items-center gap-2">
            <ErpIcon name="users" className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            Need manager help instead?
          </span>
          <ErpIcon
            name="chevron-right"
            className={`h-4 w-4 transition ${showManagerHelp ? "rotate-90" : ""}`}
          />
        </button>
      </div>

      {showManagerHelp ? (
        <div className="border-t border-violet-100 bg-violet-50/40 p-4 dark:border-violet-400/15 dark:bg-violet-500/5 sm:p-5">
          <div>
            <h4 className="font-black text-slate-950 dark:text-white">
              Request a manager upload
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Use this only when you cannot upload the signed proof from your
              phone. Your name remains recorded as the delivery driver.
            </p>
          </div>

          {assistanceRequested ? (
            <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-400/25 dark:bg-slate-950/70">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  <ErpIcon name="quality" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-violet-800 dark:text-violet-200">
                    Manager request is active
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    You can still upload directly above. Your direct upload
                    automatically closes this manager request.
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
                  placeholder="I am unable to upload the proof from my phone"
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
      ) : null}
    </div>
  );
}
