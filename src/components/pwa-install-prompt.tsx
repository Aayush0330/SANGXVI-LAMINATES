"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const DISMISSED_AT_KEY = "sanghvi-pwa-install-dismissed-at";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function isInstalled() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function wasRecentlyDismissed() {
  const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY));
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DURATION_MS;
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    }

    if (isInstalled() || wasRecentlyDismissed()) {
      return;
    }

    const ios = isIOSDevice();
    setShowIOSInstructions(ios);
    setVisible(ios);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      window.localStorage.removeItem(DISMISSED_AT_KEY);
      setInstallPrompt(null);
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setVisible(false);
    }

    setInstallPrompt(null);
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <aside
      aria-label="Install Sanghvi ERP"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur dark:border-blue-400/20 dark:bg-slate-950/95 sm:bottom-6"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install message"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
      >
        ×
      </button>

      <div className="flex gap-3 pr-8">
        <Image
          src="/icon-192.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white"
        />

        <div>
          <p className="text-sm font-bold text-slate-950">Install Sanghvi ERP</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Open the ERP faster from your phone&apos;s home screen.
          </p>
        </div>
      </div>

      {installPrompt && (
        <button
          type="button"
          onClick={installApp}
          className="mt-4 h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          Install App
        </button>
      )}

      {showIOSInstructions && !installPrompt && (
        <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          On iPhone, tap Safari&apos;s{" "}
          <span className="font-bold">Share</span> button, then select{" "}
          <span className="font-bold">Add to Home Screen</span>.
        </div>
      )}
    </aside>
  );
}
