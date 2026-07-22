"use server";

import type { UserRole } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getPortalLandingPath } from "@/lib/current-user";
import {
  clearOldNotificationsForUser,
  clearReadNotificationsForUser,
  markNotificationRecipientReadForUser,
  markNotificationsReadForUser,
} from "@/lib/notifications";

function revalidateNotificationSurfaces(role: UserRole) {
  revalidatePath(getPortalLandingPath(role));
  revalidatePath("/internal/dashboard");
  revalidatePath("/dealer/dashboard");
  revalidatePath("/field/dashboard");
  revalidatePath("/account/tasks");
}

export async function markMyNotificationsReadAction() {
  const currentUser = await getCurrentUser();

  await markNotificationsReadForUser(currentUser);
  revalidateNotificationSurfaces(currentUser.role);
}

export async function markSingleNotificationReadAction(formData: FormData) {
  const currentUser = await getCurrentUser();
  const recipientId = String(formData.get("recipientId") ?? "").trim();

  if (!recipientId) {
    return;
  }

  await markNotificationRecipientReadForUser({ currentUser, recipientId });
  revalidateNotificationSurfaces(currentUser.role);
}

export async function clearReadNotificationsAction() {
  const currentUser = await getCurrentUser();

  await clearReadNotificationsForUser(currentUser);
  revalidateNotificationSurfaces(currentUser.role);
}

export async function clearOldNotificationsAction() {
  const currentUser = await getCurrentUser();

  await clearOldNotificationsForUser({ currentUser, days: 30 });
  revalidateNotificationSurfaces(currentUser.role);
}
