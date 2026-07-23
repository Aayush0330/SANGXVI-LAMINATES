"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

type LiveNotification = {
  id: string;
  title: string;
  message: string;
  module: string;
  href: string | null;
  priority: string;
  createdAt: string;
  actorName: string | null;
};

type LiveNotificationResponse = {
  unreadCount: number;
  notifications: LiveNotification[];
};

const VISIBLE_POLL_INTERVAL_MS = 5_000;
const BACKGROUND_POLL_INTERVAL_MS = 15_000;
const TOAST_DURATION_MS = 8_000;

async function showSystemNotification(notification: LiveNotification) {
  if (
    document.visibilityState === "visible" ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(notification.title, {
    body: notification.message,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: notification.id,
    data: {
      href: notification.href ?? "/",
    },
  });
}

export function LiveNotificationSync({
  initialRecipientIds,
  initialUnreadCount,
}: {
  initialRecipientIds: string[];
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const knownIds = useRef(new Set(initialRecipientIds));
  const unreadCount = useRef(initialUnreadCount);
  const [toasts, setToasts] = useState<LiveNotification[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const toastTimers = new Set<number>();

    function queueNextPoll() {
      if (cancelled) {
        return;
      }

      timer = window.setTimeout(
        poll,
        document.visibilityState === "visible"
          ? VISIBLE_POLL_INTERVAL_MS
          : BACKGROUND_POLL_INTERVAL_MS,
      );
    }

    function addToast(notification: LiveNotification) {
      setToasts((current) => [notification, ...current].slice(0, 3));

      const toastTimer = window.setTimeout(() => {
        setToasts((current) =>
          current.filter((item) => item.id !== notification.id),
        );
        toastTimers.delete(toastTimer);
      }, TOAST_DURATION_MS);

      toastTimers.add(toastTimer);
    }

    async function poll() {
      try {
        const response = await fetch("/api/notifications/live", {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        });

        if (cancelled || response.status === 401 || !response.ok) {
          return;
        }

        const snapshot = (await response.json()) as LiveNotificationResponse;
        const newNotifications = snapshot.notifications
          .filter((notification) => !knownIds.current.has(notification.id))
          .reverse();

        for (const notification of snapshot.notifications) {
          knownIds.current.add(notification.id);
        }

        for (const notification of newNotifications) {
          addToast(notification);
          void showSystemNotification(notification);
        }

        if (
          newNotifications.length > 0 ||
          snapshot.unreadCount !== unreadCount.current
        ) {
          unreadCount.current = snapshot.unreadCount;
          router.refresh();
        }
      } catch {
        // A temporary network error should not interrupt the logged-in screen.
      } finally {
        queueNextPoll();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (timer) {
        window.clearTimeout(timer);
      }

      void poll();
    }

    timer = window.setTimeout(poll, VISIBLE_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (timer) {
        window.clearTimeout(timer);
      }

      for (const toastTimer of toastTimers) {
        window.clearTimeout(toastTimer);
      }
    };
  }, [router]);

  function dismissToast(id: string) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  function openNotification(notification: LiveNotification) {
    dismissToast(notification.id);

    if (notification.href) {
      router.push(notification.href);
    }
  }

  if (!mounted || toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div
      className="fixed right-4 top-20 z-[10000] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:top-24"
      aria-live="assertive"
      aria-atomic="false"
    >
      {toasts.map((notification) => (
        <div
          key={notification.id}
          role="alert"
          className="overflow-hidden rounded-2xl border border-blue-200 bg-white/95 shadow-2xl shadow-blue-950/20 backdrop-blur-xl dark:border-blue-400/25 dark:bg-slate-950/95"
        >
          <div className="h-1 bg-blue-600" />
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
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
                  <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M10 17a2 2 0 0 0 4 0" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950 dark:text-slate-100">
                  {notification.title}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                  {notification.message}
                </p>

                {notification.href ? (
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className="mt-3 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
                  >
                    Open
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => dismissToast(notification.id)}
                aria-label="Dismiss notification"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
