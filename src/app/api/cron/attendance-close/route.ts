import { NextResponse } from "next/server";
import { markStaleAttendanceForReview } from "@/lib/attendance-reconciliation";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is required." },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await markStaleAttendanceForReview();
  return NextResponse.json({ ok: true, ...result });
}
