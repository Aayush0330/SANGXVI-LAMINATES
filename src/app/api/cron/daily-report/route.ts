import { NextResponse } from "next/server";
import {
  generateDailyBusinessArchive,
  getDefaultArchiveDate,
} from "@/lib/daily-business-archive";

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
    const businessDate = new URL(request.url).searchParams.get("date") || getDefaultArchiveDate();
    const result = await generateDailyBusinessArchive(businessDate);
    return NextResponse.json({
      ok: true,
      businessDate: result.businessDate,
      fileName: result.fileName,
      sha256: result.sha256,
      summary: result.summary,
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
