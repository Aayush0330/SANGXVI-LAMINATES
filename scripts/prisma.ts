import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

if (
  !connectionString.startsWith("postgres://") &&
  !connectionString.startsWith("postgresql://")
) {
  throw new Error(
    "DATABASE_URL must be a PostgreSQL connection string because the Prisma schema uses the postgresql provider."
  );
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});
