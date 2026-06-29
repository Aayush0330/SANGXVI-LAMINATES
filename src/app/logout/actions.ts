"use server";

import { redirect } from "next/navigation";
import { deleteCurrentAuthSession, getCurrentSession } from "@/lib/session";
import { createSecurityAuditLog } from "@/lib/security-audit";

export async function logoutAction() {
  const session = await getCurrentSession();

  if (session) {
    await createSecurityAuditLog({
      eventType: "LOGOUT",
      user: session.user,
      path: "/logout",
      description: "User logged out.",
    });
  }

  await deleteCurrentAuthSession();

  redirect("/login");
}
