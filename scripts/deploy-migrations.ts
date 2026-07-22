import { spawnSync } from "node:child_process";
import { Client } from "pg";

const RECOVERABLE_MIGRATION =
  "20260718210000_phase2_integrity_pricing_cancellation";

function runPrisma(args: string[]) {
  const result = spawnSync("npx", ["prisma", ...args], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(" ")} exited with ${result.status}`);
  }
}

async function hasFailedRecoverableMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to deploy migrations.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const table = await client.query<{ migrationTable: string | null }>(
      `SELECT to_regclass('public."_prisma_migrations"')::text AS "migrationTable"`,
    );

    if (!table.rows[0]?.migrationTable) return false;

    const result = await client.query<{ failed: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM public."_prisma_migrations"
          WHERE migration_name = $1
            AND finished_at IS NULL
            AND rolled_back_at IS NULL
        ) AS failed
      `,
      [RECOVERABLE_MIGRATION],
    );

    return result.rows[0]?.failed === true;
  } finally {
    await client.end();
  }
}

async function main() {
  if (await hasFailedRecoverableMigration()) {
    console.log(`Recovering failed migration ${RECOVERABLE_MIGRATION}.`);
    runPrisma(["migrate", "resolve", "--rolled-back", RECOVERABLE_MIGRATION]);
  }

  runPrisma(["migrate", "deploy"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
