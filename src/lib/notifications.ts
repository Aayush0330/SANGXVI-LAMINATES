import { randomUUID } from "crypto";
import { unstable_noStore as noStore } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import type { AppUser } from "./current-user";
import type { UserRole } from "./permissions";

type NotificationClient = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;

type ActiveRecipientRow = {
  id: string;
  name: string | null;
  role: string;
};

export type NotificationItem = {
  recipientId: string;
  id: string;
  title: string;
  message: string;
  module: string;
  href: string | null;
  priority: string;
  status: string;
  acknowledgedAt: Date | string | null;
  resolvedAt: Date | string | null;
  escalatedAt: Date | string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  actorName: string | null;
  actorRole: string | null;
};

export type NotificationSummary = {
  unreadCount: number;
  readCount: number;
  notifications: NotificationItem[];
};

const appRoleToPrismaRole: Record<UserRole, string> = {
  owner: "OWNER",
  manager: "MANAGER",
  accountant: "ACCOUNTANT",
  dispatch_team: "DISPATCH_TEAM",
  order_team: "ORDER_TEAM",
  qc_team: "QC_TEAM",
  driver_transport: "DRIVER_TRANSPORT",
  collection_team: "COLLECTION_TEAM",
  sales_field_team: "SALES_FIELD_TEAM",
  dealer: "DEALER",
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function formatNotificationTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function getNotificationModuleLabel(module: string) {
  const normalized = module.toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "orders":
      return "Orders";
    case "inventory":
      return "Inventory";
    case "dispatch":
      return "Physical Checks";
    case "transport":
      return "Transport";
    case "delivery":
      return "Delivery";
    case "qc":
      return "QC";
    case "tasks":
      return "Tasks";
    case "attendance":
      return "Attendance";
    case "accounts":
      return "Accounts";
    case "payroll":
      return "Payroll";
    case "hr":
      return "HR";
    case "collections":
      return "Collections";
    case "field_visits":
    case "field-visits":
      return "Field Visits";
    case "users":
      return "Users";
    case "dealers":
      return "Dealers";
    case "suppliers":
      return "Suppliers";
    case "purchasing":
      return "Purchasing";
    case "security":
      return "Security";
    case "reports":
      return "Reports";
    default:
      return normalized
        .replaceAll("_", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function getNotificationModuleShortCode(module: string) {
  const label = getNotificationModuleLabel(module);
  const words = label.split(" ").filter(Boolean);

  if (label === "QC") {
    return "QC";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function getNotificationModuleTone(module: string) {
  const normalized = module.toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "orders":
      return "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300";
    case "inventory":
      return "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "dispatch":
    case "transport":
    case "delivery":
      return "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
    case "qc":
      return "border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300";
    case "tasks":
      return "border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300";
    case "attendance":
      return "border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";
    case "payroll":
      return "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "hr":
      return "border-indigo-100 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300";
    case "accounts":
    case "collections":
      return "border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
    case "field_visits":
    case "field-visits":
      return "border-lime-100 bg-lime-50 text-lime-700 dark:border-lime-500/20 dark:bg-lime-500/10 dark:text-lime-300";
    case "users":
      return "border-indigo-100 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300";
    case "dealers":
      return "border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300";
    case "suppliers":
    case "purchasing":
      return "border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300";
    case "security":
      return "border-red-100 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";
    case "reports":
      return "border-purple-100 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300";
    default:
      return "border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

export type NotificationPriority =
  | "NORMAL"
  | "HIGH"
  | "HIGH_ALERT"
  | "URGENT"
  | "BLOCKER"
  | "CRITICAL";

export type StoredNotificationPriority =
  | "NORMAL"
  | "HIGH_ALERT"
  | "BLOCKER"
  | "CRITICAL";

export function normalizeNotificationPriority(
  priority: NotificationPriority,
): StoredNotificationPriority {
  switch (priority) {
    case "CRITICAL":
      return "CRITICAL";
    case "BLOCKER":
    case "URGENT":
      return "BLOCKER";
    case "HIGH":
    case "HIGH_ALERT":
      return "HIGH_ALERT";
    default:
      return "NORMAL";
  }
}

export function getNotificationPriorityLabel(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "Critical";
    case "BLOCKER":
    case "URGENT":
      return "Blocker";
    case "HIGH_ALERT":
    case "HIGH":
      return "High Alert";
    default:
      return "Normal";
  }
}

export function getNotificationPriorityTone(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "bg-fuchsia-700 text-white dark:bg-fuchsia-500 dark:text-white";
    case "BLOCKER":
    case "URGENT":
      return "bg-red-600 text-white dark:bg-red-500 dark:text-white";
    case "HIGH_ALERT":
    case "HIGH":
      return "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300";
    default:
      return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  }
}

export async function createWorkflowNotification({
  client = prisma,
  title,
  message,
  module,
  href,
  orderId,
  actor,
  recipientRoles = [],
  recipientUserIds = [],
  priority = "NORMAL",
  dedupeKey,
  expiresAt,
}: {
  client?: NotificationClient;
  title: string;
  message: string;
  module: string;
  href?: string | null;
  orderId?: string | null;
  actor?: AppUser | null;
  recipientRoles?: UserRole[];
  recipientUserIds?: string[];
  priority?: NotificationPriority;
  dedupeKey?: string | null;
  expiresAt?: Date | null;
}) {
  const prismaRoles = uniqueValues(
    recipientRoles.map((role) => appRoleToPrismaRole[role]),
  );
  const directUserIds = uniqueValues(recipientUserIds);
  const requestedNotificationId = randomUUID();
  const storedPriority = normalizeNotificationPriority(priority);
  const normalizedDedupeKey = dedupeKey?.trim().slice(0, 240) || null;

  const notificationRows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO public."Notification" (
      "id",
      "title",
      "message",
      "module",
      "href",
      "priority",
      "status",
      "dedupeKey",
      "orderId",
      "actorUserId",
      "actorName",
      "actorRole",
      "expiresAt",
      "createdAt"
    )
    VALUES (
      ${requestedNotificationId},
      ${title.slice(0, 180)},
      ${message.slice(0, 1200)},
      ${module},
      ${href ?? null},
      ${storedPriority},
      'OPEN',
      ${normalizedDedupeKey},
      ${orderId ?? null},
      ${actor?.id ?? null},
      ${actor?.name ?? null},
      ${actor?.role ?? null},
      ${expiresAt ?? null},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("dedupeKey")
    DO UPDATE SET
      "title" = EXCLUDED."title",
      "message" = EXCLUDED."message",
      "module" = EXCLUDED."module",
      "href" = EXCLUDED."href",
      "priority" = EXCLUDED."priority",
      "status" = 'OPEN',
      "orderId" = EXCLUDED."orderId",
      "actorUserId" = EXCLUDED."actorUserId",
      "actorName" = EXCLUDED."actorName",
      "actorRole" = EXCLUDED."actorRole",
      "acknowledgedAt" = NULL,
      "acknowledgedById" = NULL,
      "resolvedAt" = NULL,
      "resolvedById" = NULL,
      "resolutionNote" = NULL,
      "escalatedAt" = NULL,
      "expiresAt" = EXCLUDED."expiresAt"
    RETURNING "id"
  `;
  const notificationId = notificationRows[0]?.id ?? requestedNotificationId;

  const recipientsByUserId = new Map<string, ActiveRecipientRow>();

  if (directUserIds.length > 0) {
    const directRecipients = await client.$queryRaw<ActiveRecipientRow[]>`
      SELECT "id", "name", "role"::text AS "role"
      FROM public."User"
      WHERE "status" = 'ACTIVE'::public."UserStatus"
        AND "id" IN (${Prisma.join(directUserIds)})
    `;

    for (const user of directRecipients) {
      recipientsByUserId.set(user.id, user);
    }
  }

  if (prismaRoles.length > 0) {
    const roleRecipients = await client.$queryRaw<ActiveRecipientRow[]>`
      SELECT u."id", u."name", u."role"::text AS "role"
      FROM public."User" u
      WHERE u."status" = 'ACTIVE'::public."UserStatus"
        AND (
          u."role"::text IN (${Prisma.join(prismaRoles)})
          OR EXISTS (
            SELECT 1
            FROM public."UserRoleAssignment" ura
            WHERE ura."userId" = u."id"
              AND ura."role"::text IN (${Prisma.join(prismaRoles)})
          )
        )
    `;

    for (const user of roleRecipients) {
      recipientsByUserId.set(user.id, user);
    }
  }

  for (const recipient of recipientsByUserId.values()) {
    await client.$executeRaw`
      INSERT INTO public."NotificationRecipient" (
        "id",
        "notificationId",
        "userId",
        "roleSnapshot",
        "createdAt"
      )
      VALUES (
        ${randomUUID()},
        ${notificationId},
        ${recipient.id},
        ${recipient.role}::public."UserRole",
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("notificationId", "userId") DO NOTHING
    `;
  }


  return notificationId;
}

export async function getNotificationSummaryForUser(
  currentUser: AppUser,
  limit = 12,
): Promise<NotificationSummary> {
  noStore();

  const notifications = await prisma.$queryRaw<NotificationItem[]>`
    SELECT
      nr."id" AS "recipientId",
      n."id",
      n."title",
      n."message",
      n."module",
      n."href",
      n."priority",
      n."status",
      n."acknowledgedAt",
      n."resolvedAt",
      n."escalatedAt",
      nr."readAt",
      n."createdAt",
      n."actorName",
      n."actorRole"
    FROM public."NotificationRecipient" nr
    INNER JOIN public."Notification" n ON n."id" = nr."notificationId"
    WHERE nr."userId" = ${currentUser.id}
    ORDER BY n."createdAt" DESC
    LIMIT ${limit}
  `;

  const countRows = await prisma.$queryRaw<{
    unreadCount: bigint;
    readCount: bigint;
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE "readAt" IS NULL)::bigint AS "unreadCount",
      COUNT(*) FILTER (WHERE "readAt" IS NOT NULL)::bigint AS "readCount"
    FROM public."NotificationRecipient"
    WHERE "userId" = ${currentUser.id}
  `;

  return {
    unreadCount: Number(countRows[0]?.unreadCount ?? 0),
    readCount: Number(countRows[0]?.readCount ?? 0),
    notifications,
  };
}

export async function markNotificationsReadForUser(currentUser: AppUser) {
  await prisma.$executeRaw`
    UPDATE public."NotificationRecipient"
    SET "readAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${currentUser.id}
      AND "readAt" IS NULL
  `;
}

export async function markNotificationRecipientReadForUser({
  currentUser,
  recipientId,
}: {
  currentUser: AppUser;
  recipientId: string;
}) {
  await prisma.$executeRaw`
    UPDATE public."NotificationRecipient"
    SET "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP)
    WHERE "id" = ${recipientId}
      AND "userId" = ${currentUser.id}
  `;
}

export async function clearReadNotificationsForUser(currentUser: AppUser) {
  await prisma.$executeRaw`
    DELETE FROM public."NotificationRecipient"
    WHERE "userId" = ${currentUser.id}
      AND "readAt" IS NOT NULL
  `;

  await deleteOrphanNotifications();
}

export async function clearOldNotificationsForUser({
  currentUser,
  days = 30,
}: {
  currentUser: AppUser;
  days?: number;
}) {
  await prisma.$executeRaw`
    DELETE FROM public."NotificationRecipient" nr
    USING public."Notification" n
    WHERE nr."notificationId" = n."id"
      AND nr."userId" = ${currentUser.id}
      AND n."createdAt" < CURRENT_TIMESTAMP - (${days} * INTERVAL '1 day')
  `;

  await deleteOrphanNotifications();
}

async function deleteOrphanNotifications() {
  await prisma.$executeRaw`
    DELETE FROM public."Notification" n
    WHERE NOT EXISTS (
      SELECT 1
      FROM public."NotificationRecipient" nr
      WHERE nr."notificationId" = n."id"
    )
  `;
}
