import { createReadStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth-guards";
import { getDefaultArchiveDate } from "@/lib/daily-business-archive";
import { prisma } from "@/lib/db";
import {
  getDailyArchiveDirectory,
  resolveStoredFile,
} from "@/lib/runtime-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ArchiveRow = {
  id: string;
  fileName: string | null;
  filePath: string | null;
  sha256: string | null;
};

async function findArchive(businessDate: string) {
  const rows = await prisma.$queryRaw<ArchiveRow[]>`
    SELECT "id","fileName","filePath","sha256"
    FROM public."DailyBusinessArchive"
    WHERE "businessDate"=${businessDate}::date AND "status"='SUCCESS'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function GET() {
  const { hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups/daily/latest",
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const businessDate = getDefaultArchiveDate();

  try {
    const archive = await findArchive(businessDate);
    if (!archive?.filePath || !archive.fileName) {
      return NextResponse.json(
        { error: "Latest daily archive has not been generated yet." },
        { status: 404 },
      );
    }

    let resolved: string;
    try {
      resolved = resolveStoredFile(
        getDailyArchiveDirectory(),
        archive.filePath,
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid archive path." },
        { status: 400 },
      );
    }

    if (!existsSync(resolved)) {
      return NextResponse.json(
        { error: "Latest daily archive file was not found." },
        { status: 404 },
      );
    }

    const stream = Readable.toWeb(
      createReadStream(/* turbopackIgnore: true */ resolved),
    );
    return new NextResponse(stream as BodyInit, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${archive.fileName}"`,
        "X-Archive-SHA256": archive.sha256 ?? "",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily archive generation failed.",
      },
      { status: 500 },
    );
  }
}
