import "dotenv/config";

import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/password";

const knownPasswords = ["Sanghvi@123", "Sangxvi@123", "Password123", "StrongPass123"];

function temporaryPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true, passwordHash: true },
    orderBy: { email: "asc" },
  });
  const exposed = users.filter((user) =>
    knownPasswords.some((password) => verifyPassword(password, user.passwordHash)),
  );
  if (!exposed.length) {
    console.log("No accounts using known launch-blocking passwords were found.");
    return;
  }

  const credentials = exposed.map((user) => ({ ...user, temporaryPassword: temporaryPassword() }));
  const outputPath = process.env.PHASE10_CREDENTIALS_FILE || path.join(
    tmpdir(),
    `sanghvi-phase10-launch-credentials-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
  );
  const contents = [
    "Sanghvi ERP — one-time launch credentials",
    "Every account must change this temporary password at first login.",
    "Store securely and delete this file after credentials are distributed.",
    "",
    ...credentials.flatMap((entry) => [
      `${entry.name} <${entry.email}>`,
      `Temporary password: ${entry.temporaryPassword}`,
      "",
    ]),
  ].join("\n");

  await writeFile(outputPath, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(outputPath, 0o600);
  try {
    await prisma.$transaction(async (tx) => {
      for (const entry of credentials) {
        await tx.user.update({
          where: { id: entry.id },
          data: { passwordHash: hashPassword(entry.temporaryPassword), mustChangePassword: true },
        });
      }
      await tx.authSession.deleteMany({ where: { userId: { in: credentials.map((entry) => entry.id) } } });
    });
  } catch (error) {
    await writeFile(outputPath, "Credential rotation failed; this file contains no active credentials.\n", "utf8");
    throw error;
  }

  console.log(`Rotated ${credentials.length} known passwords and invalidated their sessions.`);
  console.log(`One-time credentials file (mode 600): ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
