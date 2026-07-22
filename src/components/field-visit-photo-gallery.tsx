"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type GalleryPhoto = {
  id: string;
  fileDataUrl: string;
  fileName?: string | null;
  caption?: string | null;
};

export function FieldVisitPhotoGallery({
  photos,
  shopName,
  compact = false,
}: {
  photos: GalleryPhoto[];
  shopName: string;
  compact?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedPhoto =
    selectedIndex === null ? null : photos[selectedIndex] ?? null;

  function showPrevious() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current - 1 + photos.length) % photos.length;
    });
  }

  function showNext() {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current + 1) % photos.length;
    });
  }

  useEffect(() => {
    if (selectedIndex === null) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedIndex(null);
      } else if (event.key === "ArrowLeft" && photos.length > 1) {
        setSelectedIndex(
          (current) =>
            current === null
              ? null
              : (current - 1 + photos.length) % photos.length
        );
      } else if (event.key === "ArrowRight" && photos.length > 1) {
        setSelectedIndex(
          (current) =>
            current === null ? null : (current + 1) % photos.length
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [photos.length, selectedIndex]);

  if (photos.length === 0) {
    return null;
  }

  const primaryPhoto = photos[0]!;

  return (
    <>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => setSelectedIndex(0)}
          className={`group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left ${
            compact ? "h-52" : "h-64"
          }`}
          aria-label={`Open primary photo for ${shopName}`}
        >
          <Image
            src={primaryPhoto.fileDataUrl}
            alt={primaryPhoto.caption || `${shopName} primary visit proof`}
            fill
            unoptimized
            sizes="(min-width: 1280px) 50vw, 100vw"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950 backdrop-blur">
            {photos.length} photo proof{photos.length === 1 ? "" : "s"}
          </span>
          <span className="absolute bottom-3 right-3 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-950 opacity-0 backdrop-blur transition group-hover:opacity-100">
            View fullscreen
          </span>
        </button>

        {photos.length > 1 ? (
          <div className="grid grid-cols-4 gap-2">
            {photos.slice(1, 5).map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setSelectedIndex(index + 1)}
                className="group relative h-20 overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-emerald-300/50"
                aria-label={`Open photo ${index + 2} for ${shopName}`}
              >
                <Image
                  src={photo.fileDataUrl}
                  alt={photo.caption || `${shopName} visit proof ${index + 2}`}
                  fill
                  unoptimized
                  sizes="25vw"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selectedPhoto && selectedIndex !== null ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 p-3 backdrop-blur-sm sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label={`${shopName} photo gallery`}
          onClick={() => setSelectedIndex(null)}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-4 px-1 pb-3 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{shopName}</p>
              <p className="mt-0.5 text-xs text-slate-300">
                Photo {selectedIndex + 1} of {photos.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIndex(null)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/10 text-2xl text-white transition hover:border-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Close photo gallery"
            >
              ×
            </button>
          </div>

          <div
            className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={selectedPhoto.fileDataUrl}
              alt={
                selectedPhoto.caption ||
                `${shopName} visit proof ${selectedIndex + 1}`
              }
              fill
              unoptimized
              priority
              sizes="100vw"
              className="object-contain"
            />

            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPrevious}
                  className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/65 text-3xl text-white backdrop-blur transition hover:border-white hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4 sm:h-14 sm:w-14"
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/65 text-3xl text-white backdrop-blur transition hover:border-white hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4 sm:h-14 sm:w-14"
                  aria-label="Next photo"
                >
                  ›
                </button>
              </>
            ) : null}
          </div>

          {photos.length > 1 ? (
            <div
              className="mt-3 flex shrink-0 justify-start gap-2 overflow-x-auto pb-1 sm:justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition sm:h-20 sm:w-28 ${
                    selectedIndex === index
                      ? "border-emerald-300"
                      : "border-slate-200 opacity-65 hover:opacity-100"
                  }`}
                  aria-label={`Show photo ${index + 1}`}
                  aria-current={selectedIndex === index ? "true" : undefined}
                >
                  <Image
                    src={photo.fileDataUrl}
                    alt={photo.caption || `${shopName} thumbnail ${index + 1}`}
                    fill
                    unoptimized
                    sizes="112px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
