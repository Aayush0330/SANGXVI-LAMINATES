import "server-only";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const INDIA_TIME_ZONE = "Asia/Kolkata";

type GoogleCalendarEvent = {
  summary: string;
  description: string;
  colorId: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders: {
    useDefault: boolean;
    overrides?: Array<{
      method: "popup" | "email";
      minutes: number;
    }>;
  };
  extendedProperties: {
    private: Record<string, string>;
  };
};

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

export type GoogleCalendarOrderEventInput = {
  orderId: string;
  orderNumber: string;
  dealerName: string;
  dealerPhone?: string | null;
  status: string;
  paymentTag: string;
  paymentStatus: string;
  orderAmount: number;
  amountReceived: number;
  balanceAmount: number;
  priority?: string | null;
  source?: string | null;
  requiredBy?: Date | string | null;
  paymentTimelineAt?: Date | string | null;
  createdAt: Date | string;
  productLines: string[];
  notes?: string | null;
  calendarEventId?: string | null;
};

export type GoogleCalendarSyncResult = {
  eventId: string;
  htmlLink?: string | null;
};

function cleanEnvironmentValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function getGoogleCalendarConfig() {
  const clientId = cleanEnvironmentValue(process.env.GOOGLE_CALENDAR_CLIENT_ID);
  const clientSecret = cleanEnvironmentValue(process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
  const refreshToken = cleanEnvironmentValue(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN);
  const calendarId = cleanEnvironmentValue(process.env.GOOGLE_CALENDAR_ID) ?? "primary";

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

function clampReminderMinutes(value: number) {
  return Math.max(0, Math.min(40_320, Math.round(value)));
}

function label(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

export function getTaskCalendarColorId(status: string | null | undefined) {
  if (status === "DONE") return "10";
  if (status === "CANCELLED") return "11";
  if (status === "BLOCKED") return "4";
  if (status === "REVIEW") return "5";
  if (status === "IN_PROGRESS") return "9";
  return "1";
}

export function getOrderCalendarColorId(status: string) {
  if (status === "DELIVERED" || status === "INVOICE_UPLOADED") return "10";
  if (status === "CANCELLED") return "11";
  if (
    status === "STOCK_BLOCKED"
    || status === "BACKORDERED"
    || status === "PHYSICAL_CHECK_ISSUE"
    || status === "QC_REWORK"
    || status === "CANCELLATION_REQUESTED"
  ) {
    return "4";
  }
  if (status === "NEW_ORDER" || status === "PENDING_TEAM_ASSIGNMENT") return "5";
  return "9";
}

export function buildTaskCalendarEvent(
  input: GoogleCalendarTaskEventInput,
): GoogleCalendarEvent {
  const start = assertValidDate(input.dueAt, "Task due date");
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const reminderDate = input.calendarReminderAt
    ? assertValidDate(input.calendarReminderAt, "Calendar reminder date")
    : null;

  const descriptionLines = [
    input.description,
    input.calendarNotes ? `Calendar notes: ${input.calendarNotes}` : null,
    `Task number: ${input.taskNumber}`,
    input.taskType ? `Task type: ${label(input.taskType)}` : null,
    input.priority ? `Priority: ${label(input.priority)}` : null,
    input.status ? `Status: ${label(input.status)}` : null,
    input.teamName ? `Team: ${input.teamName}` : null,
    input.assigneeName ? `Assignee: ${input.assigneeName}` : "Assignee: Team pool",
    input.relatedModule ? `Related module: ${label(input.relatedModule)}` : null,
    input.relatedReference ? `Related reference: ${input.relatedReference}` : null,
    "Source: Sanghvi ERP task management",
  ].filter((line): line is string => Boolean(line));

  return {
    summary: `[TASK · ${label(input.status)}] ${input.taskNumber} · ${input.title}`,
    description: descriptionLines.join("\n"),
    colorId: getTaskCalendarColorId(input.status),
    start: {
      dateTime: start.toISOString(),
      timeZone: INDIA_TIME_ZONE,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: INDIA_TIME_ZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [
        {
          method: "popup",
          minutes: reminderDate
            ? clampReminderMinutes((start.getTime() - reminderDate.getTime()) / 60_000)
            : 30,
        },
      ],
    },
    extendedProperties: {
      private: {
        source: "sanghvi-erp",
        entityType: "work-task",
        entityNumber: input.taskNumber,
      },
    },
  };
}

export function buildOrderCalendarEvent(
  input: GoogleCalendarOrderEventInput,
): GoogleCalendarEvent {
  const start = assertValidDate(
    input.paymentTimelineAt ?? input.requiredBy ?? input.createdAt,
    "Order calendar date",
  );
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const productLines = input.productLines.length
    ? input.productLines.map((line, index) => `${index + 1}. ${line}`)
    : ["No products recorded"];

  const descriptionLines = [
    `Order: ${input.orderNumber}`,
    `Dealer: ${input.dealerName}`,
    input.dealerPhone ? `Phone: ${input.dealerPhone}` : null,
    `Order status: ${label(input.status)}`,
    `Payment type: ${label(input.paymentTag).replace("Cash In Carry", "Cash-and-Carry")}`,
    `Payment status: ${label(input.paymentStatus)}`,
    `Order amount: ${formatCurrency(input.orderAmount)}`,
    `Amount received: ${formatCurrency(input.amountReceived)}`,
    `Outstanding: ${formatCurrency(input.balanceAmount)}`,
    input.priority ? `Priority: ${label(input.priority)}` : null,
    input.source ? `Order source: ${label(input.source)}` : null,
    "",
    "Products:",
    ...productLines,
    input.notes ? `\nNotes: ${input.notes}` : null,
    "\nSource: Sanghvi ERP order management",
  ].filter((line): line is string => line !== null);

  const paymentLabel = label(input.paymentTag).replace("Cash In Carry", "Cash-and-Carry");

  return {
    summary: `[${paymentLabel} · ${label(input.status)}] ${input.orderNumber} · ${input.dealerName}`,
    description: descriptionLines.join("\n"),
    colorId: getOrderCalendarColorId(input.status),
    start: {
      dateTime: start.toISOString(),
      timeZone: INDIA_TIME_ZONE,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: INDIA_TIME_ZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [
        {
          method: "popup",
          minutes: 60,
        },
      ],
    },
    extendedProperties: {
      private: {
        source: "sanghvi-erp",
        entityType: "order",
        entityId: input.orderId,
        entityNumber: input.orderNumber,
      },
    },
  };
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
    signal: AbortSignal.timeout(15_000),
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

function getGoogleEventId(value: string | null | undefined) {
  return value?.startsWith("google-") ? value.replace(/^google-/, "") : null;
}

async function upsertCalendarEvent({
  event,
  calendarEventId,
}: {
  event: GoogleCalendarEvent;
  calendarEventId?: string | null;
}): Promise<GoogleCalendarSyncResult> {
  const { accessToken, calendarId } = await getAccessToken();
  const existingEventId = getGoogleEventId(calendarEventId);
  const baseUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = existingEventId
    ? `${baseUrl}/${encodeURIComponent(existingEventId)}`
    : baseUrl;

  const response = await fetch(url, {
    method: existingEventId ? "PATCH" : "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
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

export async function syncTaskToGoogleCalendar(
  input: GoogleCalendarTaskEventInput,
) {
  return upsertCalendarEvent({
    event: buildTaskCalendarEvent(input),
    calendarEventId: input.calendarEventId,
  });
}

export async function syncOrderToGoogleCalendar(
  input: GoogleCalendarOrderEventInput,
) {
  return upsertCalendarEvent({
    event: buildOrderCalendarEvent(input),
    calendarEventId: input.calendarEventId,
  });
}
