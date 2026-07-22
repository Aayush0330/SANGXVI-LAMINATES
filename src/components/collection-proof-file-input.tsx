"use client";

import { useRef, useState } from "react";

const maxFiles = 5;
const maxFileSizeBytes = 4 * 1024 * 1024;
const maxTotalSizeBytes = maxFiles * maxFileSizeBytes;

export function CollectionProofFileInput({ className }: { className: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  function syncInput(nextFiles: File[]) {
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    nextFiles.forEach((file) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
  }

  function addFiles(incoming: File[]) {
    const merged = [...files];
    const keys = new Set(
      files.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    );

    incoming.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!keys.has(key)) {
        keys.add(key);
        merged.push(file);
      }
    });

    let nextError = "";
    if (merged.length > maxFiles) {
      nextError = `You can upload a maximum of ${maxFiles} proof files.`;
    } else if (merged.some((file) => file.size > maxFileSizeBytes)) {
      nextError = "Each proof file must be 4 MB or smaller.";
    } else if (
      merged.reduce((total, file) => total + file.size, 0) >
      maxTotalSizeBytes
    ) {
      nextError = "Combined proof files must be 20 MB or smaller.";
    }

    if (nextError) {
      setError(nextError);
      syncInput(files);
      return;
    }

    setError("");
    setFiles(merged);
    syncInput(merged);
  }

  function removeFile(indexToRemove: number) {
    const nextFiles = files.filter((_, index) => index !== indexToRemove);
    setFiles(nextFiles);
    setError("");
    syncInput(nextFiles);
  }

  return (
    <div>
      <input
        ref={inputRef}
        name="proofFiles"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        required
        className={className}
        onChange={(event) =>
          addFiles(Array.from(event.currentTarget.files ?? []))
        }
      />
      <p className="mt-2 text-xs text-slate-500">
        Upload 1–5 JPG, PNG, WebP, or PDF files. Maximum 4 MB each. You can add
        files one at a time.
      </p>
      {error ? (
        <p className="mt-2 text-xs font-bold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {files.length > 0 ? (
        <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
            >
              <span className="min-w-0 truncate text-xs font-bold text-emerald-700">
                {index + 1}. {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-black uppercase text-rose-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
