import { hashPassword, isStrongEnoughPassword } from "../src/lib/password";
import {
  formatIndianPhoneNumber,
  formatPersonName,
  normalizeEmail,
} from "../src/lib/user-formatters";
import { prisma } from "./prisma";

async function main() {
  const name = process.env.REAL_OWNER_NAME;
  const email = process.env.REAL_OWNER_EMAIL;
  const password = process.env.REAL_OWNER_PASSWORD;
  const phone = process.env.REAL_OWNER_PHONE ?? "";

  if (!name || !email || !password) {
    console.log("Missing required environment values.");
    console.log("");
    console.log("Run like this:");
    console.log(
      "Set REAL_OWNER_NAME, REAL_OWNER_EMAIL, REAL_OWNER_PASSWORD and REAL_OWNER_PHONE, then run this script."
    );
    process.exitCode = 1;
    return;
  }

  const formattedEmail = normalizeEmail(email);

  if (!formattedEmail.includes("@")) {
    throw new Error("REAL_OWNER_EMAIL must be a valid email address.");
  }

  if (!isStrongEnoughPassword(password)) {
    throw new Error(
      "REAL_OWNER_PASSWORD must be at least 12 characters and include uppercase, lowercase, number and symbol.",
    );
  }

  const owner = await prisma.user.findFirst({
    where: {
      role: "OWNER",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!owner) {
    console.log("No owner found. Use /setup-owner to create the first owner.");
    return;
  }

  const existingEmailUser = await prisma.user.findUnique({
    where: {
      email: formattedEmail,
    },
  });

  if (existingEmailUser && existingEmailUser.id !== owner.id) {
    throw new Error(`Email already belongs to another user: ${formattedEmail}`);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: owner.id,
      },
      data: {
        name: formatPersonName(name),
        email: formattedEmail,
        phone: formatIndianPhoneNumber(phone),
        passwordHash: hashPassword(password),
        status: "ACTIVE",
      },
    }),
    prisma.authSession.deleteMany({
      where: {
        userId: owner.id,
      },
    }),
  ]);

  console.log("Owner replaced successfully.");
  console.log(`Owner email: ${formattedEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
