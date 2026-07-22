import { NextResponse } from "next/server";
import { createDatabaseBackup } from "@/lib/backup-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await createDatabaseBackup({
      kind: "AUTOMATIC",
      triggeredBy: "CRON",
    });
    return NextResponse.json({
      ok: true,
      backupId: result.id,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
