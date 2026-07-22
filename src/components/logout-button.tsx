"use client";

import { logoutAction } from "@/app/logout/actions";

export function LogoutButton({
  variant = "default",
}: {
  variant?: "default" | "compact";
}) {
  const buttonClass =
    variant === "compact"
      ? "group inline-flex items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-slate-200/70 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:gap-2 sm:px-5 sm:py-3 sm:text-sm"
      : "group flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-slate-200/70 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <form action={logoutAction} className={variant === "compact" ? "" : "w-full"}>
      <button type="submit" className={buttonClass}>
        <svg
          className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 sm:h-4 sm:w-4"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M11.5 5L16 9.5M16 9.5L11.5 14M16 9.5H6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 3.5H5.5C4.67157 3.5 4 4.17157 4 5V15C4 15.8284 4.67157 16.5 5.5 16.5H8.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>

        <span className="hidden min-[360px]:inline">Logout</span>
        <span className="inline min-[360px]:hidden">Exit</span>
      </button>
    </form>
  );
}
