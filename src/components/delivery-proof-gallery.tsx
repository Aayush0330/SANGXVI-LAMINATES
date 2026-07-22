"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type DeliveryProofGalleryItem = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  uploadedAtLabel: string;
  uploadSourceLabel: string;
  uploadedByLabel?: string | null;
};

function isImageProof(proof: DeliveryProofGalleryItem) {
  return proof.mimeType.startsWith("image/");
}

export function DeliveryProofGallery({
  proofs,
  orderNumber,
  compact = false,
}: {
  proofs: DeliveryProofGalleryItem[];
  orderNumber: string;
  compact?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedProof =
    selectedIndex === null ? null : proofs[selectedIndex] ?? null;

  function showPrevious() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current - 1 + proofs.length) % proofs.length;
    });
  }

  function showNext() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current + 1) % proofs.length;
    });
  }


  useEffect(() => {
    if (selectedIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedIndex(null);
      } else if (event.key === "ArrowLeft" && proofs.length > 1) {
        setSelectedIndex((current) =>
          current === null
            ? null
            : (current - 1 + proofs.length) % proofs.length,
        );
      } else if (event.key === "ArrowRight" && proofs.length > 1) {
        setSelectedIndex((current) =>
          current === null ? null : (current + 1) % proofs.length,
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [proofs.length, selectedIndex]);

  if (proofs.length === 0) return null;

  return (
    <>
      <div className={compact ? "mt-2.5 grid grid-cols-3 gap-2" : "mt-4 grid grid-cols-2 gap-3"}>
        {proofs.slice(0, 4).map((proof, index) => (
          <button
            key={proof.id}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className={`group overflow-hidden border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-slate-950 dark:hover:border-blue-400/50 ${compact ? "rounded-lg" : "rounded-xl"}`}
            aria-label={`View delivery proof ${proof.fileName}`}
          >
            {isImageProof(proof) ? (
              <div className={`relative overflow-hidden bg-slate-100 dark:bg-white/5 ${compact ? "h-14" : "h-24"}`}>
                <Image
                  src={proof.fileUrl}
                  alt={proof.fileName}
                  fill
                  unoptimized
                  sizes="180px"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/75 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                  View
                </span>
              </div>
            ) : (
              <div className={`relative flex items-center justify-center overflow-hidden bg-rose-50 dark:bg-rose-500/10 ${compact ? "h-14" : "h-24"}`}>
                <span className={`${compact ? "rounded-md px-2 py-1 text-xs" : "rounded-xl px-3 py-2 text-xl"} bg-white font-black text-rose-600 shadow-sm dark:bg-slate-950 dark:text-rose-300`}>
                  PDF
                </span>
                <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/75 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                  View
                </span>
              </div>
            )}
            <div className={compact ? "p-1.5" : "p-2.5"}>
              <p className={`truncate font-black text-slate-800 dark:text-slate-200 ${compact ? "text-[9px]" : "text-[11px]"}`}>
                {proof.fileName}
              </p>
              <p className={`${compact ? "mt-0.5 text-[7px]" : "mt-1 text-[9px]"} truncate text-slate-400`}>
                {proof.uploadedAtLabel} · {proof.uploadSourceLabel}
              </p>
            </div>
          </button>
        ))}
      </div>

      {selectedProof && selectedIndex !== null
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] isolate flex flex-col bg-slate-950/98 p-3 backdrop-blur-md sm:p-5"
              role="dialog"
              aria-modal="true"
              aria-label={`Delivery proof viewer for ${orderNumber}`}
              onClick={() => setSelectedIndex(null)}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(null);
                }}
                className="fixed right-4 top-4 z-[10001] inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/70 bg-slate-950/85 px-4 text-sm font-black text-white shadow-2xl backdrop-blur transition hover:border-white hover:bg-white hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-6 sm:top-5"
                aria-label="Close delivery proof viewer"
              >
                <span className="hidden sm:inline">Close</span>
                <span aria-hidden="true" className="text-2xl leading-none">×</span>
              </button>

              <div
                className="relative z-10 flex min-h-0 flex-1 flex-col"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex min-h-16 shrink-0 items-center gap-4 pr-16 text-white sm:pr-28">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black sm:text-base">
                      {orderNumber} · {selectedProof.fileName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-300">
                      Proof {selectedIndex + 1} of {proofs.length} · {selectedProof.uploadedAtLabel}
                      {selectedProof.uploadedByLabel
                        ? ` · Uploaded by ${selectedProof.uploadedByLabel}`
                        : ""}
                    </p>
                  </div>
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl">
                  {isImageProof(selectedProof) ? (
                    <Image
                      src={selectedProof.fileUrl}
                      alt={selectedProof.fileName}
                      fill
                      unoptimized
                      priority
                      sizes="100vw"
                      className="object-contain"
                    />
                  ) : (
                    <iframe
                      src={selectedProof.fileUrl}
                      title={selectedProof.fileName}
                      className="h-full w-full border-0 bg-white"
                    />
                  )}

                  {proofs.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={showPrevious}
                        className="absolute left-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/65 text-3xl text-white backdrop-blur transition hover:border-white hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4 sm:h-14 sm:w-14"
                        aria-label="Previous delivery proof"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={showNext}
                        className="absolute right-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/65 text-3xl text-white backdrop-blur transition hover:border-white hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4 sm:h-14 sm:w-14"
                        aria-label="Next delivery proof"
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                </div>

                {proofs.length > 1 ? (
                  <div className="mt-3 flex shrink-0 justify-start gap-2 overflow-x-auto pb-1 sm:justify-center">
                    {proofs.map((proof, index) => (
                      <button
                        key={proof.id}
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-slate-950 transition sm:h-20 sm:w-28 ${
                          selectedIndex === index
                            ? "border-blue-400"
                            : "border-white/25 opacity-65 hover:opacity-100"
                        }`}
                        aria-label={`Show delivery proof ${index + 1}`}
                        aria-current={selectedIndex === index ? "true" : undefined}
                      >
                        {isImageProof(proof) ? (
                          <Image
                            src={proof.fileUrl}
                            alt={proof.fileName}
                            fill
                            unoptimized
                            sizes="112px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-black text-rose-300">
                            PDF
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
