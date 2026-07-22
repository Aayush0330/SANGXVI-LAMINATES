import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth-guards";
import {
  generateDailyBusinessArchive,
  getDefaultArchiveDate,
} from "@/lib/daily-business-archive";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";

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
  const { currentUser, hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups/daily/latest",
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const businessDate = getDefaultArchiveDate();

  try {
    let archive = await findArchive(businessDate);
    let generatedNow = false;

    if (!archive?.filePath || !existsSync(archive.filePath)) {
      await generateDailyBusinessArchive(businessDate);
      archive = await findArchive(businessDate);
      generatedNow = true;
    }

    if (!archive?.filePath || !archive.fileName || !existsSync(archive.filePath)) {
      return NextResponse.json(
        { error: "Daily archive could not be generated." },
        { status: 500 },
      );
    }

    const allowedRoot = path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      process.env.DAILY_ARCHIVE_DIR || "backups/daily-reports",
    );
    const resolved = path.resolve(archive.filePath);

    if (
      !resolved.startsWith(`${allowedRoot}${path.sep}`) &&
      resolved !== allowedRoot
    ) {
      return NextResponse.json(
        { error: "Invalid archive path." },
        { status: 400 },
      );
    }

    if (generatedNow) {
      await createSecurityAuditLog({
        eventType: "DAILY_ARCHIVE_GENERATED",
        user: currentUser,
        path: "/internal/backups/daily/latest",
        description: `Automatically generated missing daily business archive ${archive.fileName} before download.`,
      });
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
