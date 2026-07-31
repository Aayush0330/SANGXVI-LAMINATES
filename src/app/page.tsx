import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthenticatedEntryPath } from "@/lib/auth-entry";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export default async function HomePage() {
  await connection();

  const ownerCount = await prisma.user.count({
    where: {
      role: "OWNER",
    },
  });

  if (ownerCount === 0) {
    redirect("/setup-owner");
  }

  const session = await getCurrentSession();

  if (session) {
    redirect(getAuthenticatedEntryPath(session.user));
  }

  redirect("/login");
}
