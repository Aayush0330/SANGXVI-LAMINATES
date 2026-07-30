import { syncPendingGoogleCalendarEvents } from "@/lib/google-calendar-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncPendingGoogleCalendarEvents(40);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Google Calendar sync sweep failed:", error);
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar sync sweep failed.",
      },
      { status: 500 },
    );
  }
}
