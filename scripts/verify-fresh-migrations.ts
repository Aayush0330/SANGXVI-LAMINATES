import "dotenv/config";

import { spawn } from "node:child_process";
import { Client } from "pg";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is missing.");

const source = new URL(sourceUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) {
  throw new Error("Fresh migration verification is restricted to a local PostgreSQL server.");
}

const databaseName = `phase10_fresh_${Date.now()}`;
const freshUrl = new URL(sourceUrl);
freshUrl.pathname = `/${databaseName}`;

function runMigrations() {
  return new Promise<void>((resolve, reject) => {
    const executable = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(executable, ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: freshUrl.toString() },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Fresh migration deploy failed with exit code ${code}.`));
    });
  });
}

async function main() {
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    await runMigrations();

    const fresh = new Client({ connectionString: freshUrl.toString() });
    await fresh.connect();
    try {
      const migrationResult = await fresh.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      const tableResult = await fresh.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
      );
      const migrations = Number(migrationResult.rows[0]?.count ?? 0);
      const tables = Number(tableResult.rows[0]?.count ?? 0);
      if (migrations < 1 || tables < 2) throw new Error("Fresh database schema verification failed.");
      console.log(`Fresh database migration verification passed: ${migrations} migrations, ${tables} tables.`);
    } finally {
      await fresh.end();
    }
  } finally {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
      [databaseName],
    ).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
