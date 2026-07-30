import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePercentageChange,
  formatIndiaDateInput,
  formatStageAge,
  getDashboardRangeBounds,
  getGreeting,
  getIndiaDayStart,
  getWorkflowStageId,
  parseDashboardRange,
} from "../src/lib/dashboard-insights";

test("dashboard range accepts only supported rolling periods", () => {
  assert.equal(parseDashboardRange("7"), 7);
  assert.equal(parseDashboardRange(["90", "7"]), 90);
  assert.equal(parseDashboardRange("365"), 30);
  assert.equal(parseDashboardRange(undefined), 30);
});

test("workflow stages are derived from actual order statuses", () => {
  assert.equal(getWorkflowStageId("NEW_ORDER"), "receiving");
  assert.equal(getWorkflowStageId("PHYSICAL_CHECK_IN_PROGRESS"), "physical");
  assert.equal(getWorkflowStageId("BACKORDERED"), "stock");
  assert.equal(getWorkflowStageId("PENDING_QC"), "quality");
  assert.equal(getWorkflowStageId("TRANSPORT_ASSIGNED"), "dispatch");
  assert.equal(getWorkflowStageId("ON_THE_WAY"), "delivery");
  assert.equal(getWorkflowStageId("DELIVERED"), null);
  assert.equal(getWorkflowStageId("CANCELLATION_REQUESTED"), null);
  assert.equal(getWorkflowStageId("CANCELLED"), null);
});

test("India day boundaries remain stable in UTC", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  assert.equal(
    getIndiaDayStart(now).toISOString(),
    "2026-07-27T18:30:00.000Z",
  );

  const bounds = getDashboardRangeBounds(7, now);
  assert.equal(bounds.currentStart.toISOString(), "2026-07-21T18:30:00.000Z");
  assert.equal(bounds.previousStart.toISOString(), "2026-07-14T18:30:00.000Z");
  assert.equal(bounds.previousEnd.toISOString(), "2026-07-21T12:00:00.000Z");
  assert.equal(bounds.bucketDays, 1);
  assert.equal(formatIndiaDateInput(bounds.currentStart), "2026-07-22");
});

test("percentage deltas do not invent a percentage from a zero baseline", () => {
  assert.equal(calculatePercentageChange(120, 100), 20);
  assert.equal(calculatePercentageChange(80, 100), -20);
  assert.equal(calculatePercentageChange(0, 0), 0);
  assert.equal(calculatePercentageChange(10, 0), null);
});

test("stage age and greeting use concise operational labels", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  assert.equal(
    formatStageAge(new Date("2026-07-26T09:00:00.000Z"), now),
    "2d 3h oldest",
  );
  assert.equal(getGreeting(new Date("2026-07-28T08:30:00.000Z")), "Good afternoon");
});
