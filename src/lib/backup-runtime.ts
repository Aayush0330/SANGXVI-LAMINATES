import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Client } from "pg";

export type BackupKind = "MANUAL" | "AUTOMATIC" | "RESTORE_POINT";

export type BackupResult = {
  id: string;
  kind: BackupKind;
  fileName: string;
  filePath: string;
  manifestPath: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

const backupDir = process.env.BACKUP_DIR || "backups/database";
const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
const pgDumpPath = process.env.PG_DUMP_PATH || "pg_dump";

function databaseUrl() {
  const value = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL or BACKUP_DATABASE_URL is missing.");
  return value;
}

function sanitizedUrl(value: string) {
  const url = new URL(value);
  const allowed = new Set([
    "sslmode",
    "connect_timeout",
    "application_name",
    "target_session_attrs",
    "host",
    "hostaddr",
    "port",
    "user",
    "password",
    "dbname",
  ]);
  const search = new URLSearchParams();
  url.searchParams.forEach((paramValue, key) => {
    if (allowed.has(key)) search.set(key, paramValue);
  });
  url.search = search.toString();
  return url.toString();
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: sanitizedUrl(databaseUrl()) });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function bestEffortQuery(text: string, values: unknown[] = []) {
  try {
    return await withClient((client) => client.query(text, values));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation "(?:public\.)?BackupRecord" does not exist/i.test(message)) {
      return null;
    }
    throw error;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function waitForProcess(child: ReturnType<typeof spawn>, getError: () => string) {
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed with exit code ${code}. ${getError()}`.trim()));
    });
  });
}

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function deleteExpiredBackups(targetDir: string, days: number) {
  if (!Number.isFinite(days) || days <= 0) return [] as string[];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];
  for (const fileName of await fs.readdir(targetDir)) {
    if (!fileName.endsWith(".sql.gz")) continue;
    const filePath = path.join(targetDir, fileName);
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs >= cutoff) continue;
    await fs.unlink(filePath);
    await fs.unlink(`${filePath}.manifest.json`).catch(() => undefined);
    deleted.push(filePath);
    await bestEffortQuery(
      `UPDATE public."BackupRecord" SET "status"='DELETED' WHERE "filePath"=$1 AND "status"='SUCCESS'`,
      [filePath],
    );
  }
  return deleted;
}

export async function createDatabaseBackup(options: {
  kind?: BackupKind;
  triggeredById?: string | null;
  triggeredBy?: string | null;
} = {}): Promise<BackupResult> {
  const kind = options.kind ?? "MANUAL";
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const targetDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), backupDir);
  await fs.mkdir(targetDir, { recursive: true });

  await bestEffortQuery(
    `INSERT INTO public."BackupRecord" ("id","kind","status","retentionDays","triggeredById","triggeredBy","startedAt","createdAt") VALUES ($1,$2,'RUNNING',$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    [id, kind, retentionDays, options.triggeredById ?? null, options.triggeredBy ?? null],
  );

  const fileName = `sanghvi-erp-${kind.toLowerCase()}-${timestamp()}.sql.gz`;
  const filePath = path.join(targetDir, fileName);
  const manifestPath = `${filePath}.manifest.json`;
  let errorOutput = "";

  try {
    // Prisma Postgres Dev can reuse a backend session after pg_dump exits and
    // leave pg_dump's named enum statement behind. Clear session-local prepared
    // statements so repeated manual, automatic and cron backups stay reliable.
    await withClient((client) => client.query("DEALLOCATE ALL"));

    const pgDump = spawn(
      /* turbopackIgnore: true */ pgDumpPath,
      [
        "--dbname",
        sanitizedUrl(databaseUrl()),
        "--format=plain",
        "--inserts",
        "--exclude-schema=_prisma_dev_wal",
        "--exclude-table=_prisma_dev_wal.*",
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists",
      ],
      { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    pgDump.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    await Promise.all([
      pipeline(pgDump.stdout, createGzip({ level: 9 }), createWriteStream(filePath)),
      waitForProcess(pgDump, () => errorOutput),
    ]);

    const stat = await fs.stat(filePath);
    const sha256 = await sha256File(filePath);
    const manifest = {
      version: 1,
      id,
      kind,
      fileName,
      filePath,
      sizeBytes: stat.size,
      sha256,
      createdAt,
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await bestEffortQuery(
      `UPDATE public."BackupRecord" SET "status"='SUCCESS',"fileName"=$2,"filePath"=$3,"sizeBytes"=$4,"sha256"=$5,"manifestPath"=$6,"completedAt"=CURRENT_TIMESTAMP,"verifiedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
      [id, fileName, filePath, stat.size, sha256, manifestPath],
    );
    await deleteExpiredBackups(targetDir, retentionDays);
    return { id, kind, fileName, filePath, manifestPath, sizeBytes: stat.size, sha256, createdAt };
  } catch (error) {
    await fs.unlink(filePath).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    await bestEffortQuery(
      `UPDATE public."BackupRecord" SET "status"='FAILED',"errorMessage"=$2,"completedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
      [id, message.slice(0, 2000)],
    );
    throw error;
  }
}

export async function verifyBackupFile(filePath: string) {
  const resolved = path.resolve(/* turbopackIgnore: true */ process.cwd(), filePath);
  const stat = await fs.stat(resolved);
  const actualHash = await sha256File(resolved);
  const manifestPath = `${resolved}.manifest.json`;
  let expectedHash: string | null = null;
  let expectedSize: number | null = null;

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      sha256?: string;
      sizeBytes?: number;
    };
    expectedHash = manifest.sha256 ?? null;
    expectedSize = manifest.sizeBytes ?? null;
  } catch {
    const result = await bestEffortQuery(
      `SELECT "sha256","sizeBytes" FROM public."BackupRecord" WHERE "filePath"=$1 AND "status"='SUCCESS' ORDER BY "completedAt" DESC LIMIT 1`,
      [resolved],
    );
    const row = result?.rows?.[0] as { sha256?: string; sizeBytes?: string | number } | undefined;
    expectedHash = row?.sha256 ?? null;
    expectedSize = row?.sizeBytes == null ? null : Number(row.sizeBytes);
  }

  if (!expectedHash) {
    return { verified: false, reason: "No checksum metadata exists for this backup.", actualHash, sizeBytes: stat.size };
  }
  if (expectedHash !== actualHash || (expectedSize != null && expectedSize !== stat.size)) {
    return { verified: false, reason: "Backup checksum or file size does not match its manifest.", actualHash, expectedHash, sizeBytes: stat.size, expectedSize };
  }
  return { verified: true, actualHash, expectedHash, sizeBytes: stat.size };
}

export async function recordRestoreAudit(input: {
  id: string;
  fileName: string;
  filePath: string;
  sha256?: string | null;
  status: "STARTED" | "SUCCESS" | "FAILED";
  errorMessage?: string | null;
  triggeredBy?: string | null;
}) {
  if (input.status === "STARTED") {
    await bestEffortQuery(
      `INSERT INTO public."RestoreAudit" ("id","fileName","filePath","sha256","status","triggeredBy","startedAt","createdAt") VALUES ($1,$2,$3,$4,'STARTED',$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [input.id, input.fileName, input.filePath, input.sha256 ?? null, input.triggeredBy ?? null],
    );
    return;
  }
  await bestEffortQuery(
    `UPDATE public."RestoreAudit" SET "status"=$2,"errorMessage"=$3,"completedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
    [input.id, input.status, input.errorMessage ?? null],
  );
}
