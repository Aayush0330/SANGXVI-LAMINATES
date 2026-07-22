"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TeamFeedbackMessage = {
  type: "success" | "error";
  title: string;
  text: string;
};

export function TeamFeedbackToast({
  message,
  restoreScrollKey,
}: {
  message: TeamFeedbackMessage | null;
  restoreScrollKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dismissToast = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("success");
    params.delete("error");

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!message) {
      return;
    }

    if (restoreScrollKey) {
      try {
        const savedPosition = window.sessionStorage.getItem(restoreScrollKey);
        window.sessionStorage.removeItem(restoreScrollKey);

        if (savedPosition !== null) {
          const scrollTop = Number(savedPosition);

          if (Number.isFinite(scrollTop)) {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                window.scrollTo(0, scrollTop);
              });
            });
          }
        }
      } catch {
        // Keep the toast working even if session storage is unavailable.
      }
    }

    const timer = window.setTimeout(dismissToast, 3500);
    return () => window.clearTimeout(timer);
  }, [dismissToast, message, restoreScrollKey]);

  if (!message) {
    return null;
  }

  const isSuccess = message.type === "success";

  return (
    <div
      className={`fixed right-5 top-24 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-5 py-4 text-sm shadow-2xl backdrop-blur-xl transition ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50/95 text-emerald-800 shadow-emerald-900/10 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-200"
          : "border-rose-200 bg-rose-50/95 text-rose-800 shadow-rose-900/10 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-200"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <p className="font-black">{message.title}</p>
        <p className="mt-1 leading-5 opacity-85">{message.text}</p>
      </div>

      <button
        type="button"
        onClick={dismissToast}
        className="rounded-full px-2 py-1 text-lg leading-none opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        aria-label="Close message"
      >
        ×
      </button>
    </div>
  );
}
