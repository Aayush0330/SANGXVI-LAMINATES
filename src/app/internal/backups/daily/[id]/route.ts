import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArchiveRow = {
  fileName: string | null;
  filePath: string | null;
  sha256: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups/daily",
  );
  if (!hasAccess) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const rows = await prisma.$queryRaw<ArchiveRow[]>`
    SELECT "fileName","filePath","sha256"
    FROM public."DailyBusinessArchive"
    WHERE "id"=${id} AND "status"='SUCCESS'
    LIMIT 1
  `;
  const archive = rows[0];
  if (!archive?.filePath || !archive.fileName || !existsSync(archive.filePath)) {
    return NextResponse.json({ error: "Daily archive file not found." }, { status: 404 });
  }

  const allowedRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DAILY_ARCHIVE_DIR || "backups/daily-reports");
  const resolved = path.resolve(archive.filePath);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`) && resolved !== allowedRoot) {
    return NextResponse.json({ error: "Invalid archive path." }, { status: 400 });
  }

  const stream = Readable.toWeb(createReadStream(resolved));
  return new NextResponse(stream as BodyInit, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${archive.fileName}"`,
      "X-Archive-SHA256": archive.sha256 ?? "",
      "Cache-Control": "no-store",
    },
  });
}
