"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "sangxvi-theme";

type ThemeMode = "light" | "dark";
const THEME_CHANGE_EVENT = "sangxvi-theme-change";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem(STORAGE_KEY);

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function subscribeToTheme(callback: () => void) {
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

  window.addEventListener("storage", callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  colorScheme.addEventListener("change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    colorScheme.removeEventListener("change", callback);
  };
}

function getServerTheme(): ThemeMode {
  return "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getInitialTheme,
    getServerTheme,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function handleToggle() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={handleToggle}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-200/70 transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-black/20 dark:hover:border-blue-500/60 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      {isDark ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4V2.5" />
          <path d="M12 21.5V20" />
          <path d="M4.93 4.93L3.87 3.87" />
          <path d="M20.13 20.13L19.07 19.07" />
          <path d="M4 12H2.5" />
          <path d="M21.5 12H20" />
          <path d="M4.93 19.07L3.87 20.13" />
          <path d="M20.13 3.87L19.07 4.93" />
          <path d="M12 17A5 5 0 1 0 12 7A5 5 0 0 0 12 17Z" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 13.4A8.5 8.5 0 1 1 10.6 3A6.5 6.5 0 0 0 21 13.4Z" />
        </svg>
      )}
    </button>
  );
}
