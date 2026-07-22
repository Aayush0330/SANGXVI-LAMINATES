import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPoolVersion: number | undefined;
};

// Increment whenever the generated Prisma schema gains or removes delegates.
// This prevents Next.js Fast Refresh from reusing a client created from the
// previous generated schema (for example, before Supplier was introduced).
const PRISMA_POOL_VERSION = 19;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return connectionString;
  }

  const url = new URL(connectionString);

  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }

  if (!url.searchParams.has("schema")) {
    url.searchParams.set("schema", "public");
  }

  if (!url.searchParams.has("options")) {
    url.searchParams.set("options", "-c search_path=public");
  }

  return url.toString();
}

function defaultPoolSize() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return 1;
  const hostname = new URL(connectionString).hostname;
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) ? 1 : 4;
}

const adapter = new PrismaPg({
  connectionString: getConnectionString(),
  max: boundedInteger(process.env.DATABASE_POOL_MAX, defaultPoolSize(), 1, 20),
  idleTimeoutMillis: boundedInteger(
    process.env.DATABASE_IDLE_TIMEOUT_MS,
    30_000,
    5_000,
    300_000,
  ),
  connectionTimeoutMillis: boundedInteger(
    process.env.DATABASE_CONNECTION_TIMEOUT_MS,
    15_000,
    1_000,
    60_000,
  ),
  keepAlive: true,
}, {
  schema: "public",
});

const cachedPrisma =
  globalForPrisma.prismaPoolVersion === PRISMA_POOL_VERSION
    ? globalForPrisma.prisma
    : undefined;

export const prisma =
  cachedPrisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaPoolVersion = PRISMA_POOL_VERSION;
}
