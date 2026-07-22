import { hashPassword, isStrongEnoughPassword } from "../src/lib/password";
import { prisma } from "./prisma";

const initialPassword = process.env.INITIAL_USER_PASSWORD?.trim();

if (!initialPassword || !isStrongEnoughPassword(initialPassword)) {
  throw new Error(
    "INITIAL_USER_PASSWORD must contain 12+ characters with uppercase, lowercase, number and symbol.",
  );
}

async function main() {
  if (!initialPassword) {
    throw new Error("INITIAL_USER_PASSWORD is required.");
  }
  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  let updatedCount = 0;

  for (const user of users) {
    if (user.passwordHash) {
      console.log(`Skipped ${user.email} because password already exists.`);
      continue;
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: hashPassword(initialPassword),
        mustChangePassword: true,
      },
    });

    updatedCount += 1;
    console.log(`Password set for ${user.email}`);
  }

  console.log(`Done. Updated ${updatedCount} users.`);
  console.log("Password values were not printed. Updated users must change their password.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
