import { NextResponse } from "next/server";
import { sendDueTaskReminders } from "@/lib/work-task-reminders";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is required." },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueTaskReminders();

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
