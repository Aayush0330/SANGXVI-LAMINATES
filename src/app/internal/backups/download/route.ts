import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth-guards";
import { createDatabaseBackup } from "@/lib/backup-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups/download",
  );

  if (!hasAccess) {
    return NextResponse.json(
      { error: "You do not have permission to generate database backups." },
      { status: 403 },
    );
  }

  try {
    const backup = await createDatabaseBackup({
      kind: "MANUAL",
      triggeredById: currentUser.id,
      triggeredBy: currentUser.name,
    });
    const stream = Readable.toWeb(createReadStream(backup.filePath));

    return new NextResponse(stream as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${backup.fileName}"`,
        "Content-Length": String(backup.sizeBytes),
        "X-Backup-SHA256": backup.sha256,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Backup generation failed.",
        detail: message,
        note: "The server must provide pg_dump and a writable BACKUP_DIR.",
      },
      { status: 500 },
    );
  }
}
