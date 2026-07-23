"use client";

import { useEffect, useState } from "react";

type PermissionState = NotificationPermission | "unsupported";

function getPermissionState(): PermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function NotificationPermissionButton() {
  const [permission, setPermission] =
    useState<PermissionState>("unsupported");

  useEffect(() => {
    setPermission(getPermissionState());
  }, []);

  async function enableAlerts() {
    if (!("Notification" in window)) {
      return;
    }

    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    }

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
  }

  if (permission === "unsupported") {
    return null;
  }

  if (permission === "granted") {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        System alerts on
      </span>
    );
  }

  if (permission === "denied") {
    return (
      <span className="inline-flex rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-300">
        Alerts blocked in browser
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={enableAlerts}
      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
    >
      Enable system alerts
    </button>
  );
}
