import "dotenv/config";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

type AppliedMigration = {
  migrationName: string;
  checksum: string;
};

type HistoricalChecksumTransition = {
  appliedChecksum: string;
  localChecksum: string;
  reason: string;
};

// A deployed migration must normally remain byte-for-byte immutable. This
// allow-list records one verified historical exception: the production
// database applied the original dispatch migration before its source was
// hardened for fresh-database compatibility. Both checksums were recovered
// from verified project/database backups. Only this exact pair is accepted;
// any other change still fails closed.
const acceptedHistoricalChecksumTransitions: Record<
  string,
  HistoricalChecksumTransition[]
> = {
  "20260716130000_dispatch_assignment_workflow": [
    {
      appliedChecksum:
        "ef7452dd307ae108461cad46381c3dc0e210c08b3d6966bcfbe4a36c07b9210a",
      localChecksum:
        "9dfe14aeeb4934d00b414d157c34966a040fffdd04c013012ea5d551863afec8",
      reason:
        "Original production migration followed by fresh-database source hardening.",
    },
  ],
};

function isAcceptedHistoricalTransition(
  migrationName: string,
  appliedChecksum: string,
  localChecksum: string,
) {
  return (acceptedHistoricalChecksumTransitions[migrationName] ?? []).some(
    (transition) =>
      transition.appliedChecksum === appliedChecksum &&
      transition.localChecksum === localChecksum,
  );
}

async function localMigrationChecksums() {
  const migrationsRoot = path.resolve("prisma/migrations");
  const entries = await fs.readdir(migrationsRoot, { withFileTypes: true });
  const checksums = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const migrationPath = path.join(
      migrationsRoot,
      entry.name,
      "migration.sql",
    );

    try {
      const contents = await fs.readFile(migrationPath);
      checksums.set(
        entry.name,
        createHash("sha256").update(contents).digest("hex"),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
  }

  return checksums;
}

export async function assertAppliedMigrationIntegrity() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to check migration integrity.");
  }

  const localChecksums = await localMigrationChecksums();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const table = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS "exists"`,
    );
    if (!table.rows[0]?.exists) {
      console.log(
        "Migration checksum preflight passed: fresh database has no migration ledger yet.",
      );
      return;
    }

    const applied = await client.query<AppliedMigration>(
      `SELECT
         "migration_name" AS "migrationName",
         "checksum"
       FROM public."_prisma_migrations"
       WHERE "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL
       ORDER BY "started_at"`,
    );

    const problems: string[] = [];
    for (const migration of applied.rows) {
      const localChecksum = localChecksums.get(migration.migrationName);
      if (!localChecksum) {
        problems.push(`${migration.migrationName} (missing local migration)`);
      } else if (localChecksum !== migration.checksum) {
        if (
          isAcceptedHistoricalTransition(
            migration.migrationName,
            migration.checksum,
            localChecksum,
          )
        ) {
          const transition = acceptedHistoricalChecksumTransitions[
            migration.migrationName
          ].find(
            (candidate) =>
              candidate.appliedChecksum === migration.checksum &&
              candidate.localChecksum === localChecksum,
          );
          console.warn(
            `Accepted verified historical migration transition: ${migration.migrationName}. ${transition?.reason ?? ""}`,
          );
        } else {
          problems.push(`${migration.migrationName} (checksum mismatch)`);
        }
      }
    }

    if (problems.length > 0) {
      throw new Error(
        [
          "Applied migration integrity check failed:",
          ...problems.map((problem) => `- ${problem}`),
          "Restore the exact migration files that were originally deployed and review the database before continuing.",
        ].join("\n"),
      );
    }

    console.log(
      `Migration checksum preflight passed: ${applied.rows.length} applied migrations match local source.`,
    );
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  assertAppliedMigrationIntegrity().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
