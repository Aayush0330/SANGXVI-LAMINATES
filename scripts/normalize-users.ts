import {
  formatIndianPhoneNumber,
  formatPersonName,
} from "../src/lib/user-formatters";
import { prisma } from "./prisma";

async function main() {
  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const user of users) {
    const formattedName = formatPersonName(user.name);
    const formattedPhone = formatIndianPhoneNumber(user.phone);

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        name: formattedName,
        phone: formattedPhone,
      },
    });

    console.log(
      `${user.email}: "${user.name}" -> "${formattedName}", "${user.phone ?? ""}" -> "${formattedPhone ?? ""}"`
    );
  }

  console.log(`Normalized ${users.length} users.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
