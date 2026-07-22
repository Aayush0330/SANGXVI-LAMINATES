import { prisma } from "./db";

type PasswordChangeRow = {
  mustChangePassword: boolean | number | null;
};

export async function getMustChangePassword(userId: string) {
  try {
    const rows = await prisma.$queryRaw<PasswordChangeRow[]>`
      SELECT "mustChangePassword"
      FROM public."User"
      WHERE "id" = ${userId}
      LIMIT 1
    `;

    return Boolean(rows[0]?.mustChangePassword);
  } catch (error) {
    console.error("Could not read mustChangePassword:", error);
    return false;
  }
}

export async function setMustChangePassword(userId: string, value: boolean) {
  try {
    await prisma.$executeRaw`
      UPDATE public."User"
      SET "mustChangePassword" = ${value}
      WHERE "id" = ${userId}
    `;
  } catch (error) {
    console.error("Could not update mustChangePassword:", error);
    throw error;
  }
}
