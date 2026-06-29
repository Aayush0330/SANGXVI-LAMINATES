import { hashPassword } from "../src/lib/password";
import { prisma } from "./prisma";

const DEFAULT_PASSWORD = "Sangxvi@123";

async function main() {
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
        passwordHash: hashPassword(DEFAULT_PASSWORD),
      },
    });

    updatedCount += 1;
    console.log(`Password set for ${user.email}`);
  }

  console.log(`Done. Updated ${updatedCount} users.`);
  console.log(`Default password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
