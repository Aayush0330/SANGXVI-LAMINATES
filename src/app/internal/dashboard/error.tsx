"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErpIcon } from "@/components/erp-icon";

export default function InternalDashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Internal dashboard rendering failed", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center px-4">
      <div className="w-full rounded-2xl border border-rose-200 bg-white p-7 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-rose-400/20 dark:bg-slate-900">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
          <ErpIcon name="alert" />
        </span>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
          Dashboard unavailable
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          Operational data could not be loaded
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
          The underlying data may be temporarily unavailable. Retry the request
          before continuing with operational decisions.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[10px] text-slate-400">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Retry dashboard
          </button>
          <Link
            href="/internal/orders"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-white/10 dark:text-slate-300"
          >
            Open orders
          </Link>
        </div>
      </div>
    </div>
  );
}
