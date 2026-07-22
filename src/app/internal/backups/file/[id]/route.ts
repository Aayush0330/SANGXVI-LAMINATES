import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BackupRow = {
  fileName: string | null;
  filePath: string | null;
  sizeBytes: bigint | number | string | null;
  sha256: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups/file",
  );
  if (!hasAccess) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const rows = await prisma.$queryRaw<BackupRow[]>`
    SELECT "fileName","filePath","sizeBytes","sha256"
    FROM public."BackupRecord"
    WHERE "id"=${id} AND "status"='SUCCESS'
    LIMIT 1
  `;
  const backup = rows[0];
  if (!backup?.filePath || !backup.fileName || !existsSync(backup.filePath)) {
    return NextResponse.json({ error: "Backup file not found." }, { status: 404 });
  }

  const allowedRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.BACKUP_DIR || "backups/database");
  const resolved = path.resolve(backup.filePath);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`) && resolved !== allowedRoot) {
    return NextResponse.json({ error: "Invalid backup path." }, { status: 400 });
  }

  const stream = Readable.toWeb(createReadStream(resolved));
  return new NextResponse(stream as BodyInit, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${backup.fileName}"`,
      "Content-Length": String(backup.sizeBytes ?? ""),
      "X-Backup-SHA256": backup.sha256 ?? "",
      "Cache-Control": "no-store",
    },
  });
}
