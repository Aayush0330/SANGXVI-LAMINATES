const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarTaskEventInput = {
  title: string;
  taskNumber: string;
  description?: string | null;
  teamName?: string | null;
  assigneeName?: string | null;
  priority?: string | null;
  status?: string | null;
  taskType?: string | null;
  relatedModule?: string | null;
  relatedReference?: string | null;
  dueAt: Date | string;
  calendarReminderAt?: Date | string | null;
  calendarNotes?: string | null;
  calendarEventId?: string | null;
};

export type GoogleCalendarSyncResult = {
  eventId: string;
  htmlLink?: string | null;
};

function getGoogleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId,
  };
}

export function isGoogleCalendarConfigured() {
  return Boolean(getGoogleCalendarConfig());
}

function assertValidDate(value: Date | string, label: string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return date;
}

async function getAccessToken() {
  const config = getGoogleCalendarConfig();

  if (!config) {
    throw new Error(
      "Google Calendar is not configured. Add GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET and GOOGLE_CALENDAR_REFRESH_TOKEN.",
    );
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ?? payload.error ?? "Google Calendar token request failed.",
    );
  }

  return {
    accessToken: payload.access_token,
    calendarId: config.calendarId,
  };
}

function buildTaskEvent(input: GoogleCalendarTaskEventInput) {
  const start = assertValidDate(input.dueAt, "Task due date");
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const reminderDate = input.calendarReminderAt
    ? assertValidDate(input.calendarReminderAt, "Calendar reminder date")
    : null;

  const descriptionLines = [
    input.description,
    input.calendarNotes ? `Calendar notes: ${input.calendarNotes}` : null,
    `Task number: ${input.taskNumber}`,
    input.taskType ? `Task type: ${input.taskType}` : null,
    input.priority ? `Priority: ${input.priority}` : null,
    input.status ? `Status: ${input.status}` : null,
    input.teamName ? `Team: ${input.teamName}` : null,
    input.assigneeName ? `Assignee: ${input.assigneeName}` : "Assignee: Team pool",
    input.relatedModule ? `Related module: ${input.relatedModule}` : null,
    input.relatedReference ? `Related reference: ${input.relatedReference}` : null,
    reminderDate ? `Reminder: ${reminderDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : null,
    "Source: Sanghvi ERP task management",
  ].filter(Boolean);

  return {
    summary: `[${input.taskNumber}] ${input.title}`,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: start.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: "Asia/Kolkata",
    },
    reminders: {
      useDefault: false,
      overrides: reminderDate
        ? [
            {
              method: "popup",
              minutes: Math.max(0, Math.round((start.getTime() - reminderDate.getTime()) / 60000)),
            },
          ]
        : [
            {
              method: "popup",
              minutes: 30,
            },
          ],
    },
  };
}

export async function syncTaskToGoogleCalendar(
  input: GoogleCalendarTaskEventInput,
): Promise<GoogleCalendarSyncResult> {
  const { accessToken, calendarId } = await getAccessToken();
  const event = buildTaskEvent(input);
  const existingEventId = input.calendarEventId?.startsWith("google-")
    ? input.calendarEventId.replace(/^google-/, "")
    : null;

  const url = existingEventId
    ? `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}`
    : `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;

  const response = await fetch(url, {
    method: existingEventId ? "PATCH" : "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    id?: string;
    htmlLink?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? "Google Calendar event sync failed.");
  }

  return {
    eventId: `google-${payload.id}`,
    htmlLink: payload.htmlLink ?? null,
  };
}
