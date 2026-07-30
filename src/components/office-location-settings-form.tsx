"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { saveOfficeLocationAction } from "@/app/internal/attendance/settings/actions";
import { calculateDistanceMeters } from "@/lib/geolocation";

type OfficeLocationSettingsFormProps = {
  initialName?: string;
  initialAddress?: string | null;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  initialRadiusMeters?: number | null;
};

type TestResult = {
  distanceMeters: number;
  insideOffice: boolean;
  accuracyMeters: number;
};

const inputClass =
  "h-11 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

const labelClass =
  "mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

function FormIcon({
  children,
  className = "h-4 w-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:ring-offset-slate-900"
    >
      <FormIcon>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M17 21v-8H7v8M7 3v5h8" />
      </FormIcon>
      {pending ? "Saving Office Setup..." : "Save Office Setup"}
    </button>
  );
}

export function OfficeLocationSettingsForm({
  initialName = "Main Office",
  initialAddress = "",
  initialLatitude = null,
  initialLongitude = null,
  initialRadiusMeters = 200,
}: OfficeLocationSettingsFormProps) {
  const [latitude, setLatitude] = useState(
    initialLatitude !== null && initialLatitude !== undefined
      ? String(initialLatitude)
      : "",
  );
  const [longitude, setLongitude] = useState(
    initialLongitude !== null && initialLongitude !== undefined
      ? String(initialLongitude)
      : "",
  );
  const [radiusMeters, setRadiusMeters] = useState(String(initialRadiusMeters ?? 200));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [gpsAction, setGpsAction] = useState<"capture" | "test" | null>(null);

  const mapHref = useMemo(() => {
    if (!latitude || !longitude) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}`;
  }, [latitude, longitude]);

  async function useCurrentLocation() {
    try {
      setGpsAction("capture");
      setTestResult(null);
      setStatusMessage("Getting current GPS location...");
      const position = await getCurrentPosition();
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
      setStatusMessage(
        `Current location captured with ${Math.round(position.coords.accuracy)} m accuracy.`,
      );
    } catch {
      setStatusMessage("Location permission denied or unavailable.");
    } finally {
      setGpsAction(null);
    }
  }

  async function testCurrentLocation() {
    try {
      const officeLatitude = Number(latitude);
      const officeLongitude = Number(longitude);
      const radius = Number(radiusMeters);

      if (
        !Number.isFinite(officeLatitude) ||
        !Number.isFinite(officeLongitude) ||
        officeLatitude < -90 ||
        officeLatitude > 90 ||
        officeLongitude < -180 ||
        officeLongitude > 180
      ) {
        setStatusMessage("Set office latitude and longitude first.");
        return;
      }

      if (!Number.isFinite(radius) || radius < 30 || radius > 1000) {
        setStatusMessage("Set a radius between 30 and 1,000 meters.");
        return;
      }

      setGpsAction("test");
      setStatusMessage("Testing your current location against office geofence...");
      const position = await getCurrentPosition();
      const distanceMeters = calculateDistanceMeters(
        officeLatitude,
        officeLongitude,
        position.coords.latitude,
        position.coords.longitude
      );

      setTestResult({
        distanceMeters,
        insideOffice: distanceMeters <= radius,
        accuracyMeters: Math.round(position.coords.accuracy),
      });

      setStatusMessage(null);
    } catch {
      setStatusMessage("Could not test location. Please allow GPS permission.");
    } finally {
      setGpsAction(null);
    }
  }

  return (
    <form action={saveOfficeLocationAction} className="space-y-5">
      <fieldset className="rounded-[22px] border border-slate-200 p-4 dark:border-white/10">
        <legend className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Office identity
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="office-name" className={labelClass}>
              Office Name
            </label>
            <input
              id="office-name"
              name="name"
              defaultValue={initialName}
              className={inputClass}
              placeholder="Main Office"
              required
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="office-address" className={labelClass}>
              Address / Landmark
            </label>
            <input
              id="office-address"
              name="address"
              defaultValue={initialAddress ?? ""}
              className={inputClass}
              placeholder="Office address or landmark"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-[22px] border border-slate-200 p-4 dark:border-white/10">
        <legend className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Geofence center
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="office-latitude" className={labelClass}>
              Latitude
            </label>
            <input
              id="office-latitude"
              name="latitude"
              value={latitude}
              onChange={(event) => {
                setLatitude(event.target.value);
                setTestResult(null);
              }}
              inputMode="decimal"
              className={inputClass}
              placeholder="e.g. 21.170240"
              required
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="office-longitude" className={labelClass}>
              Longitude
            </label>
            <input
              id="office-longitude"
              name="longitude"
              value={longitude}
              onChange={(event) => {
                setLongitude(event.target.value);
                setTestResult(null);
              }}
              inputMode="decimal"
              className={inputClass}
              placeholder="e.g. 72.831062"
              required
            />
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="office-radius" className={labelClass}>
            Allowed Radius
          </label>
          <div className="relative">
            <input
              id="office-radius"
              name="radiusMeters"
              value={radiusMeters}
              onChange={(event) => {
                setRadiusMeters(event.target.value);
                setTestResult(null);
              }}
              type="number"
              min="30"
              max="1000"
              className={`${inputClass} pr-20`}
              required
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
              meters
            </span>
          </div>
          <p className="mt-2 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
            Recommended: 150–250 meters. Indoor GPS accuracy can vary.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={gpsAction !== null}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-white/[0.05]"
          >
            <FormIcon>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="7" />
            </FormIcon>
            {gpsAction === "capture" ? "Capturing GPS..." : "Use Current GPS"}
          </button>

          <button
            type="button"
            onClick={testCurrentLocation}
            disabled={gpsAction !== null}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-xs font-black text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60 dark:border-blue-400/20 dark:bg-blue-500/[0.08] dark:text-blue-300 dark:hover:bg-blue-500/[0.12]"
          >
            <FormIcon>
              <path d="m8 12 2.5 2.5L16 9" />
              <circle cx="12" cy="12" r="9" />
            </FormIcon>
            {gpsAction === "test" ? "Testing GPS..." : "Test This Geofence"}
          </button>
        </div>
      </fieldset>

      {statusMessage ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300"
        >
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          {statusMessage}
        </div>
      ) : null}

      {testResult ? (
        <div
          role="status"
          className={`rounded-[22px] border p-4 ${
            testResult.insideOffice
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/[0.08] dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-500/[0.08] dark:text-rose-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${
                testResult.insideOffice
                  ? "bg-emerald-500 text-white"
                  : "bg-rose-500 text-white"
              }`}
            >
              <FormIcon>
                {testResult.insideOffice ? (
                  <path d="m6 12 4 4 8-9" />
                ) : (
                  <>
                    <path d="m8 8 8 8M16 8l-8 8" />
                  </>
                )}
              </FormIcon>
            </div>
            <div>
              <p className="text-sm font-black">
                {testResult.insideOffice
                  ? "Inside the office geofence"
                  : "Outside the office geofence"}
              </p>
              <p className="mt-1 text-xs font-medium leading-5 opacity-80">
                Current device is {testResult.distanceMeters} m from the office
                center. GPS accuracy: {testResult.accuracyMeters} m.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-2 text-xs font-black text-blue-600 transition hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:text-blue-200"
          >
            <FormIcon>
              <path d="M14 5h5v5M10 14 19 5" />
              <path d="M19 13v6H5V5h6" />
            </FormIcon>
            Preview in Google Maps
          </a>
        ) : (
          <p className="text-xs font-medium text-slate-400">
            Add coordinates to enable map preview.
          </p>
        )}
        <div className="w-full sm:w-auto sm:min-w-56">
          <SaveButton />
        </div>
      </div>
    </form>
  );
}
