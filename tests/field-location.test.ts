import assert from "node:assert/strict";
import test from "node:test";
import {
  getFieldLocationHistoryCutoff,
  isFieldLocationFresh,
  validateFieldLocationSample,
} from "../src/lib/field-location";

const now = new Date("2026-07-30T10:00:00.000Z");

test("field location accepts a fresh and accurate GPS sample", () => {
  assert.equal(
    validateFieldLocationSample(
      {
        latitude: 21.1702,
        longitude: 72.8311,
        accuracyMeters: 24,
        heading: 180,
        speedMps: 4.5,
        capturedAt: new Date("2026-07-30T09:59:45.000Z"),
      },
      now,
      150,
    ),
    null,
  );
});

test("field location rejects impossible coordinates and weak accuracy", () => {
  assert.equal(
    validateFieldLocationSample(
      {
        latitude: 91,
        longitude: 72.8311,
        accuracyMeters: 20,
        capturedAt: now,
      },
      now,
      150,
    ),
    "invalid-coordinates",
  );

  assert.equal(
    validateFieldLocationSample(
      {
        latitude: 21.1702,
        longitude: 72.8311,
        accuracyMeters: 180,
        capturedAt: now,
      },
      now,
      150,
    ),
    "inaccurate-location",
  );
});

test("field location rejects replayed and future GPS samples", () => {
  assert.equal(
    validateFieldLocationSample(
      {
        latitude: 21.1702,
        longitude: 72.8311,
        accuracyMeters: 20,
        capturedAt: new Date("2026-07-30T09:40:00.000Z"),
      },
      now,
      150,
    ),
    "stale-location",
  );

  assert.equal(
    validateFieldLocationSample(
      {
        latitude: 21.1702,
        longitude: 72.8311,
        accuracyMeters: 20,
        capturedAt: new Date("2026-07-30T10:06:00.000Z"),
      },
      now,
      150,
    ),
    "future-location",
  );
});

test("live status becomes stale after its configured freshness window", () => {
  assert.equal(
    isFieldLocationFresh(
      "2026-07-30T09:58:00.000Z",
      now,
      5 * 60_000,
    ),
    true,
  );
  assert.equal(
    isFieldLocationFresh(
      "2026-07-30T09:54:59.000Z",
      now,
      5 * 60_000,
    ),
    false,
  );
  assert.equal(isFieldLocationFresh(null, now, 5 * 60_000), false);
});

test("field location history uses a stable rolling cutoff", () => {
  assert.equal(
    getFieldLocationHistoryCutoff(now).toISOString(),
    "2026-07-29T10:00:00.000Z",
  );
});
