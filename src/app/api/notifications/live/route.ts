import { getNotificationSummaryForUser } from "@/lib/notifications";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "Cache-Control": "private, no-cache, no-store, max-age=0",
        },
      },
    );
  }

  const summary = await getNotificationSummaryForUser(
    { id: session.user.id },
    6,
  );

  return Response.json(
    {
      unreadCount: summary.unreadCount,
      notifications: summary.notifications.map((notification) => ({
        id: notification.recipientId,
        title: notification.title,
        message: notification.message,
        module: notification.module,
        href: notification.href,
        priority: notification.priority,
        createdAt: notification.createdAt,
        actorName: notification.actorName,
      })),
    },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0",
      },
    },
  );
}
