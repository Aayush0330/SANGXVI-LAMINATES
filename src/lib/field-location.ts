export type FieldLocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  heading?: number | null;
  speedMps?: number | null;
  capturedAt: Date;
};

export type FieldLocationValidationError =
  | "invalid-coordinates"
  | "invalid-accuracy"
  | "inaccurate-location"
  | "invalid-heading"
  | "invalid-speed"
  | "invalid-captured-at"
  | "stale-location"
  | "future-location";

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function getFieldLocationLimits() {
  return {
    maxAccuracyMeters: boundedInteger(
      process.env.FIELD_LOCATION_MAX_ACCURACY_METERS,
      150,
      25,
      1_000,
    ),
    minimumIntervalMs: boundedInteger(
      process.env.FIELD_LOCATION_MIN_INTERVAL_MS,
      20_000,
      10_000,
      300_000,
    ),
    staleAfterMs: boundedInteger(
      process.env.FIELD_LOCATION_STALE_AFTER_MS,
      300_000,
      60_000,
      3_600_000,
    ),
    retentionDays: boundedInteger(
      process.env.FIELD_LOCATION_RETENTION_DAYS,
      30,
      1,
      365,
    ),
  };
}

export function validateFieldLocationSample(
  sample: FieldLocationSample,
  now = new Date(),
  maxAccuracyMeters = getFieldLocationLimits().maxAccuracyMeters,
): FieldLocationValidationError | null {
  if (
    !Number.isFinite(sample.latitude) ||
    !Number.isFinite(sample.longitude) ||
    sample.latitude < -90 ||
    sample.latitude > 90 ||
    sample.longitude < -180 ||
    sample.longitude > 180
  ) {
    return "invalid-coordinates";
  }

  if (
    !Number.isFinite(sample.accuracyMeters) ||
    sample.accuracyMeters <= 0
  ) {
    return "invalid-accuracy";
  }

  if (sample.accuracyMeters > maxAccuracyMeters) {
    return "inaccurate-location";
  }

  if (
    sample.heading !== undefined &&
    sample.heading !== null &&
    (!Number.isFinite(sample.heading) ||
      sample.heading < 0 ||
      sample.heading > 360)
  ) {
    return "invalid-heading";
  }

  if (
    sample.speedMps !== undefined &&
    sample.speedMps !== null &&
    (!Number.isFinite(sample.speedMps) || sample.speedMps < 0)
  ) {
    return "invalid-speed";
  }

  if (Number.isNaN(sample.capturedAt.getTime())) {
    return "invalid-captured-at";
  }

  const ageMs = now.getTime() - sample.capturedAt.getTime();
  if (ageMs > 10 * 60_000) return "stale-location";
  if (ageMs < -5 * 60_000) return "future-location";

  return null;
}

export function isFieldLocationFresh(
  recordedAt: Date | string | null | undefined,
  now = new Date(),
  staleAfterMs = getFieldLocationLimits().staleAfterMs,
) {
  if (!recordedAt) return false;
  const recordedTime = new Date(recordedAt).getTime();
  return (
    Number.isFinite(recordedTime) &&
    now.getTime() - recordedTime <= staleAfterMs
  );
}

export function getFieldLocationHistoryCutoff(
  now = new Date(),
  historyWindowMs = 24 * 60 * 60_000,
) {
  return new Date(now.getTime() - historyWindowMs);
}
