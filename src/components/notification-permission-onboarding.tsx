"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const DISMISSED_KEY = "sanghvi-notification-permission-dismissed";

function isInstalledIOSApp() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return !isIOS || navigatorWithStandalone.standalone === true;
}

export function NotificationPermissionOnboarding() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (
      !("Notification" in window) ||
      Notification.permission !== "default" ||
      !isInstalledIOSApp() ||
      window.sessionStorage.getItem(DISMISSED_KEY) === "1"
    ) {
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function enableAlerts() {
    if (!("Notification" in window)) {
      return;
    }

    setRequesting(true);

    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      }

      await Notification.requestPermission();
    } finally {
      setRequesting(false);
      setVisible(false);
    }
  }

  if (!visible) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-permission-title"
        aria-describedby="notification-permission-description"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-2xl shadow-slate-950/30 dark:border-blue-400/25 dark:bg-slate-950"
      >
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Remind me later"
          className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          ×
        </button>

        <div className="px-6 pb-6 pt-8 sm:px-8 sm:pb-8">
          <div className="flex items-center gap-4 pr-10">
            <Image
              src="/icon-192.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl border border-slate-200 bg-white shadow-sm"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                Sanghvi ERP
              </p>
              <h2
                id="notification-permission-title"
                className="mt-1 text-xl font-black text-slate-950 dark:text-white"
              >
                Stay informed
              </h2>
            </div>
          </div>

          <p
            id="notification-permission-description"
            className="mt-5 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300"
          >
            Enable notifications to receive timely updates about orders,
            assigned tasks, approvals, deliveries, and other important business
            activity.
          </p>

          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-5 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            Alerts are personalised to your role and access permissions. You
            will only receive updates relevant to your work.
          </div>

          <button
            type="button"
            onClick={enableAlerts}
            disabled={requesting}
            className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
              <path d="M10 17a2 2 0 0 0 4 0" />
            </svg>
            {requesting ? "Enabling notifications…" : "Enable notifications"}
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 h-11 w-full rounded-xl text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            Remind me later
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
