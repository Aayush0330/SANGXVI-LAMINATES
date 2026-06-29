import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/db";

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

  redirect("/login");
}
