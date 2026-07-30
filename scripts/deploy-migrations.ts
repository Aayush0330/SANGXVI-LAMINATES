import { spawnSync } from "node:child_process";
import { assertAppliedMigrationIntegrity } from "./check-migration-integrity";

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

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to deploy migrations.");
  }

  await assertAppliedMigrationIntegrity();
  runPrisma(["migrate", "deploy"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
