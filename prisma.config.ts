import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Sanghvi ERP does not use an implicit fallback database.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
});
