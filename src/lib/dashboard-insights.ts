const INDIA_TIME_ZONE_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export const DASHBOARD_RANGE_OPTIONS = [7, 30, 90] as const;

export type DashboardRangeDays = (typeof DASHBOARD_RANGE_OPTIONS)[number];

export type WorkflowStageId =
  | "receiving"
  | "physical"
  | "stock"
  | "quality"
  | "dispatch"
  | "delivery";

export type WorkflowStageDefinition = {
  id: WorkflowStageId;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
  statuses: readonly string[];
};

export const WORKFLOW_STAGE_DEFINITIONS: readonly WorkflowStageDefinition[] = [
  {
    id: "receiving",
    label: "Order Intake",
    shortLabel: "Intake",
    description: "New orders awaiting receipt or team assignment",
    href: "/internal/order-receiving",
    statuses: ["NEW_ORDER", "PENDING_TEAM_ASSIGNMENT"],
  },
  {
    id: "physical",
    label: "Physical Check",
    shortLabel: "Physical",
    description: "Orders under physical verification",
    href: "/internal/dispatch",
    statuses: [
      "PHYSICAL_CHECK_ASSIGNED",
      "PHYSICAL_CHECK_IN_PROGRESS",
      "PHYSICAL_CHECK_ISSUE",
      "PENDING_STOCK_CHECK",
    ],
  },
  {
    id: "stock",
    label: "Stock Control",
    shortLabel: "Stock",
    description: "Stock checked, secured or awaiting replenishment",
    href: "/internal/inventory",
    statuses: ["STOCK_CHECKED", "STOCK_BLOCKED", "BACKORDERED"],
  },
  {
    id: "quality",
    label: "Quality Control",
    shortLabel: "QC",
    description: "Orders awaiting QC approval or rework",
    href: "/internal/qc",
    statuses: ["PENDING_QC", "QC_REWORK"],
  },
  {
    id: "dispatch",
    label: "Dispatch",
    shortLabel: "Dispatch",
    description: "Approved orders awaiting transport",
    href: "/internal/qc",
    statuses: ["QC_APPROVED", "READY_FOR_DISPATCH", "TRANSPORT_ASSIGNED"],
  },
  {
    id: "delivery",
    label: "In Transit",
    shortLabel: "Transit",
    description: "Orders currently moving to the dealer",
    href: "/internal/delivery-proofs",
    statuses: ["ON_THE_WAY"],
  },
] as const;

const stageByStatus = new Map(
  WORKFLOW_STAGE_DEFINITIONS.flatMap((stage) =>
    stage.statuses.map((status) => [status, stage.id] as const),
  ),
);

export function parseDashboardRange(
  value: string | string[] | undefined,
): DashboardRangeDays {
  const normalized = Array.isArray(value) ? value[0] : value;
  const parsed = Number(normalized);

  return DASHBOARD_RANGE_OPTIONS.includes(parsed as DashboardRangeDays)
    ? (parsed as DashboardRangeDays)
    : 30;
}

export function getIndiaDayStart(value = new Date()) {
  const indiaTimestamp = value.getTime() + INDIA_TIME_ZONE_OFFSET_MS;
  const indiaDate = new Date(indiaTimestamp);
  const utcMidnight = Date.UTC(
    indiaDate.getUTCFullYear(),
    indiaDate.getUTCMonth(),
    indiaDate.getUTCDate(),
  );

  return new Date(utcMidnight - INDIA_TIME_ZONE_OFFSET_MS);
}

export function getDashboardRangeBounds(
  days: DashboardRangeDays,
  now = new Date(),
) {
  const todayStart = getIndiaDayStart(now);
  const currentStart = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const previousStart = new Date(currentStart.getTime() - days * DAY_MS);
  const previousEnd = new Date(now.getTime() - days * DAY_MS);

  return {
    now,
    currentStart,
    previousStart,
    previousEnd,
    currentEnd: now,
    bucketDays: days === 7 ? 1 : days === 30 ? 3 : 7,
  };
}

export function formatIndiaDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function getWorkflowStageId(status: string) {
  return stageByStatus.get(status) ?? null;
}

export function calculatePercentageChange(
  currentValue: number,
  previousValue: number,
) {
  if (previousValue <= 0) {
    return currentValue > 0 ? null : 0;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

export function formatStageAge(
  value: Date | string | null | undefined,
  now = new Date(),
) {
  if (!value) return "No active orders";

  const date = value instanceof Date ? value : new Date(value);
  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const hours = Math.floor(elapsedMs / 3_600_000);

  if (hours < 1) return "Less than 1 hour";
  if (hours < 24) return `${hours}h oldest`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h oldest`;
}

export function getGreeting(value = new Date()) {
  const hourText = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(value);
  const hour = Number(hourText);

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
