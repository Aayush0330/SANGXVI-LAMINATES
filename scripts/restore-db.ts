import "dotenv/config";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { Client } from "pg";
import { createDatabaseBackup, recordRestoreAudit, verifyBackupFile } from "../src/lib/backup-runtime";

const databaseUrl = process.env.DATABASE_URL;
const psqlPath = process.env.PSQL_PATH || "psql";
const prismaDevName = process.env.PRISMA_DEV_NAME || "sangxvi-erp";

function getBackupFileFromArgs() {
  const args = process.argv.slice(2);
  return args.find((arg) => !arg.startsWith("-"));
}

function hasRestoreConfirmation() {
  return process.argv.includes("--yes");
}

function getNamedArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function waitForProcess(
  child: ReturnType<typeof spawn>,
  getErrorOutput: () => string,
) {
  return new Promise<void>((resolve, reject) => {
    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `psql restore failed with exit code ${code}. ${getErrorOutput()}`.trim(),
        ),
      );
    });
  });
}

function isBrokenPipeError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "EPIPE"
  );
}

function isLocalDatabase(url: string) {
  const hostname = new URL(url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

async function getDatabaseConnectionError(url: string) {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 2_000,
  });

  try {
    await client.connect();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function startLocalPrismaDatabase() {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  let output = "";

  const child = spawn(command, ["prisma", "dev", "start", prismaDevName], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Could not start Prisma Dev instance "${prismaDevName}" (exit code ${code}). ${output}`.trim(),
        ),
      );
    });
  });
}

async function waitForDatabase(url: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const connectionError = await getDatabaseConnectionError(url);

    if (!connectionError) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Prisma Dev instance "${prismaDevName}" started, but DATABASE_URL is still unreachable.`,
  );
}

async function ensureDatabaseAvailable(url: string) {
  const connectionError = await getDatabaseConnectionError(url);

  if (!connectionError) {
    return;
  }

  if (!isLocalDatabase(url)) {
    throw new Error(`Database connection failed: ${connectionError.message}`);
  }

  console.log(`Local database is unavailable. Starting Prisma Dev instance "${prismaDevName}"...`);
  await startLocalPrismaDatabase();
  await waitForDatabase(url);
}

class PrismaDevWalFilter extends Transform {
  private pending = "";
  private skippingStatement = false;
  private skippingCopyData = false;
  private skippingDollarQuote = false;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.pending += Buffer.isBuffer(chunk)
      ? chunk.toString("utf8")
      : String(chunk);
    const lines = this.pending.split(/\n/);
    this.pending = lines.pop() ?? "";

    for (const line of lines) {
      this.processLine(`${line}\n`);
    }

    callback();
  }

  override _flush(callback: (error?: Error | null) => void) {
    if (this.pending) {
      this.processLine(this.pending);
    }

    callback();
  }

  private processLine(line: string) {
    const trimmedLine = line.trim();

    if (this.skippingCopyData) {
      if (trimmedLine === "\\.") {
        this.skippingCopyData = false;
      }

      return;
    }

    if (this.skippingStatement) {
      if (this.skippingDollarQuote) {
        if (trimmedLine === "$$;") {
          this.skippingDollarQuote = false;
          this.skippingStatement = false;
        }

        return;
      }

      if (trimmedLine.endsWith(";")) {
        this.skippingStatement = false;
      }

      return;
    }

    if (
      line.includes("_prisma_dev_wal") ||
      line.includes("prisma_dev_wal_capture")
    ) {
      if (trimmedLine.startsWith("--")) {
        return;
      }

      if (/^\s*CREATE\s+FUNCTION\s+/i.test(line)) {
        this.skippingDollarQuote = true;
        this.skippingStatement = true;
        return;
      }

      if (/^\s*COPY\s+/i.test(line)) {
        this.skippingCopyData = true;
        return;
      }

      if (line.includes("AS $$")) {
        this.skippingDollarQuote = true;
        this.skippingStatement = true;
        return;
      }

      if (!trimmedLine.endsWith(";")) {
        this.skippingStatement = true;
      }

      return;
    }

    this.push(line);
  }
}

async function restoreDatabase() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Please add it to your .env file.");
  }

  if (!hasRestoreConfirmation()) {
    throw new Error(
      "Restore is a destructive operation. Run again with --yes to confirm.",
    );
  }

  const productionTarget = process.env.NODE_ENV === "production" || !isLocalDatabase(databaseUrl);
  if (productionTarget) {
    const expectedToken = process.env.RESTORE_CONFIRMATION_TOKEN;
    const suppliedToken = getNamedArgument("confirm-token");
    if (
      !process.argv.includes("--production") ||
      !expectedToken ||
      expectedToken.length < 24 ||
      suppliedToken !== expectedToken
    ) {
      throw new Error(
        "Production restore blocked. It requires --production, --yes, and an exact --confirm-token matching a 24+ character RESTORE_CONFIRMATION_TOKEN.",
      );
    }
  }

  const backupFile = getBackupFileFromArgs();

  if (!backupFile) {
    throw new Error(
      "Backup file path is missing. Example: npm run db:restore -- backups/database/file.sql.gz --yes",
    );
  }

  const backupPath = path.resolve(process.cwd(), backupFile);

  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const verification = await verifyBackupFile(backupPath);
  const allowUnverified = process.argv.includes("--allow-unverified");

  if (!verification.verified && !allowUnverified) {
    throw new Error(
      `${verification.reason} Restore stopped. Use --allow-unverified only for a manually reviewed legacy backup.`,
    );
  }

  await ensureDatabaseAvailable(databaseUrl);

  if (!process.argv.includes("--skip-restore-point")) {
    const restorePoint = await createDatabaseBackup({
      kind: "RESTORE_POINT",
      triggeredBy: "PRE_RESTORE_CLI",
    });
    console.log(`Pre-restore safety backup created: ${restorePoint.filePath}`);
  }

  const auditId = randomUUID();
  await recordRestoreAudit({
    id: auditId,
    fileName: path.basename(backupPath),
    filePath: backupPath,
    sha256: verification.actualHash,
    status: "STARTED",
    triggeredBy: "CLI",
  });

  let errorOutput = "";

  const psql = spawn(
    psqlPath,
    ["--dbname", databaseUrl, "--set", "ON_ERROR_STOP=on"],
    {
      env: process.env,
      stdio: ["pipe", "inherit", "pipe"],
    },
  );

  psql.stderr.on("data", (chunk: Buffer) => {
    errorOutput += chunk.toString();
  });

  const inputStream = backupPath.endsWith(".gz")
    ? createReadStream(backupPath).pipe(createGunzip())
    : createReadStream(backupPath);
  const sanitizedInputStream = inputStream.pipe(new PrismaDevWalFilter());

  const restoreProcess = waitForProcess(psql, () => errorOutput);

  try {
    await Promise.all([pipeline(sanitizedInputStream, psql.stdin), restoreProcess]);
    await recordRestoreAudit({
      id: auditId,
      fileName: path.basename(backupPath),
      filePath: backupPath,
      sha256: verification.actualHash,
      status: "SUCCESS",
      triggeredBy: "CLI",
    });
  } catch (error) {
    if (isBrokenPipeError(error)) {
      try {
        await restoreProcess;
        await recordRestoreAudit({
          id: auditId,
          fileName: path.basename(backupPath),
          filePath: backupPath,
          sha256: verification.actualHash,
          status: "SUCCESS",
          triggeredBy: "CLI",
        });
        console.log("Database restore completed successfully.");
        return;
      } catch (processError) {
        error = processError;
      }
    }

    await recordRestoreAudit({
      id: auditId,
      fileName: path.basename(backupPath),
      filePath: backupPath,
      sha256: verification.actualHash,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
      triggeredBy: "CLI",
    }).catch(() => undefined);
    throw error;
  }

  console.log("Database restore completed successfully.");
}

restoreDatabase().catch((error) => {
  console.error("Database restore failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
