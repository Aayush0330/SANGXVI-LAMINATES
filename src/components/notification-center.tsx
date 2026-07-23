import Link from "next/link";
import {
  clearOldNotificationsAction,
  clearReadNotificationsAction,
  markMyNotificationsReadAction,
  markSingleNotificationReadAction,
} from "@/app/notifications/actions";
import type { AppUser } from "@/lib/current-user";
import { LiveNotificationSync } from "@/components/live-notification-sync";
import { NotificationFeed } from "@/components/notification-feed";
import { NotificationPermissionButton } from "@/components/notification-permission-button";
import { NotificationPopover } from "@/components/notification-popover";
import {
  formatNotificationTime,
  getNotificationModuleLabel,
  getNotificationModuleShortCode,
  getNotificationModuleTone,
  getNotificationPriorityLabel,
  getNotificationPriorityTone,
  getNotificationSummaryForUser,
} from "@/lib/notifications";

function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
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

      <p className="mt-4 text-base font-black text-slate-800 dark:text-slate-100">
        No notifications yet
      </p>

      <p className="mx-auto mt-2 max-w-xs text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
        Order handoffs, task assignments, user updates, security alerts and field
        updates will appear here.
      </p>
    </div>
  );
}

function NotificationCard({
  notification,
}: {
  notification: Awaited<ReturnType<typeof getNotificationSummaryForUser>>["notifications"][number];
}) {
  const isUnread = !notification.readAt;
  const moduleLabel = getNotificationModuleLabel(notification.module);
  const shouldQuoteMessage = notification.message.length > 72;
  const card = (
    <div className="group relative border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-white/10">
      {isUnread ? (
        <span className="absolute left-3 top-6 h-2.5 w-2.5 rounded-full border border-blue-500 bg-blue-300 dark:border-blue-300 dark:bg-blue-500" />
      ) : null}

      <div className="flex gap-3 pl-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-black ${getNotificationModuleTone(
            notification.module,
          )}`}
        >
          {getNotificationModuleShortCode(notification.module)}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-6 text-[#20243a] dark:text-slate-100">
            {notification.actorName ? `${notification.actorName} · ` : ""}
            <span className="font-semibold">{notification.title}</span>
          </p>

          {notification.message ? (
            shouldQuoteMessage ? (
              <blockquote className="mt-3 border-l-4 border-slate-200 pl-3 text-sm font-semibold leading-6 text-[#20243a] dark:border-slate-700 dark:text-slate-200">
                “{notification.message}”
              </blockquote>
            ) : (
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                {notification.message}
              </p>
            )
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {moduleLabel}
            </span>

            {notification.priority !== "NORMAL" ? (
              <span
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${getNotificationPriorityTone(
                  notification.priority,
                )}`}
              >
                {getNotificationPriorityLabel(notification.priority)}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {notification.href ? (
                <Link
                  href={notification.href}
                  className="rounded-xl bg-[#171717] px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-600 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-blue-200"
                >
                  Open
                </Link>
              ) : null}

              {isUnread ? (
                <form action={markSingleNotificationReadAction}>
                  <input
                    type="hidden"
                    name="recipientId"
                    value={notification.recipientId}
                  />
                  <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-200">
                    Mark read
                  </button>
                </form>
              ) : null}
            </div>

            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {formatNotificationTime(notification.createdAt)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return <div key={notification.recipientId}>{card}</div>;
}

export async function NotificationCenter({
  currentUser,
  enableLiveSync = true,
}: {
  currentUser: AppUser;
  enableLiveSync?: boolean;
}) {
  const { unreadCount, readCount, notifications } =
    await getNotificationSummaryForUser(currentUser, 12);

  return (
    <>
      {enableLiveSync ? (
        <LiveNotificationSync
          initialRecipientIds={notifications.map(
            (notification) => notification.recipientId,
          )}
          initialUnreadCount={unreadCount}
        />
      ) : null}

      <NotificationPopover unreadCount={unreadCount}>
        <NotificationFeed
          items={notifications.map((notification) => ({
            id: notification.recipientId,
            isUnread: !notification.readAt,
            content: (
              <NotificationCard
                key={notification.recipientId}
                notification={notification}
              />
            ),
          }))}
          allEmptyState={<EmptyState />}
          markAllControl={
            unreadCount > 0 ? (
              <form action={markMyNotificationsReadAction}>
                <button className="inline-flex items-center gap-2 text-sm font-black text-[#20243a] transition hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-300">
                  Mark all as read
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-current">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 12 4 4 8-8" />
                    </svg>
                  </span>
                </button>
              </form>
            ) : null
          }
          footerActions={
            <div className="flex flex-wrap items-center gap-2">
              <NotificationPermissionButton />

              {readCount > 0 ? (
                <form action={clearReadNotificationsAction}>
                  <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-rose-400/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300">
                    Clear read
                  </button>
                </form>
              ) : null}

              <form action={clearOldNotificationsAction}>
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-amber-400/30 dark:hover:bg-amber-500/10 dark:hover:text-amber-300">
                  Clear 30+ days
                </button>
              </form>
            </div>
          }
          readCount={readCount}
        />
      </NotificationPopover>
    </>
  );
}
