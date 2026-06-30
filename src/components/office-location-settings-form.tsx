"use client";

import { useMemo, useState } from "react";
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
};

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function OfficeLocationSettingsForm({
  initialName = "Main Office",
  initialAddress = "",
  initialLatitude = null,
  initialLongitude = null,
  initialRadiusMeters = 200,
}: OfficeLocationSettingsFormProps) {
  const [latitude, setLatitude] = useState(initialLatitude ? String(initialLatitude) : "");
  const [longitude, setLongitude] = useState(initialLongitude ? String(initialLongitude) : "");
  const [radiusMeters, setRadiusMeters] = useState(String(initialRadiusMeters ?? 200));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const mapHref = useMemo(() => {
    if (!latitude || !longitude) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}`;
  }, [latitude, longitude]);

  async function useCurrentLocation() {
    try {
      setStatusMessage("Getting current GPS location...");
      const position = await getCurrentPosition();
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
      setStatusMessage(`Current location captured with ${Math.round(position.coords.accuracy)}m accuracy.`);
    } catch {
      setStatusMessage("Location permission denied or unavailable.");
    }
  }

  async function testCurrentLocation() {
    try {
      const officeLatitude = Number(latitude);
      const officeLongitude = Number(longitude);
      const radius = Number(radiusMeters);

      if (!Number.isFinite(officeLatitude) || !Number.isFinite(officeLongitude)) {
        setStatusMessage("Set office latitude and longitude first.");
        return;
      }

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
      });

      setStatusMessage(null);
    } catch {
      setStatusMessage("Could not test location. Please allow GPS permission.");
    }
  }

  return (
    <form action={saveOfficeLocationAction} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Office Name
        </label>
        <input
          name="name"
          defaultValue={initialName}
          className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition focus:border-cyan-300"
          placeholder="Main Office"
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Address / Note
        </label>
        <input
          name="address"
          defaultValue={initialAddress ?? ""}
          className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition focus:border-cyan-300"
          placeholder="Office address or landmark"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Latitude
          </label>
          <input
            name="latitude"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition focus:border-cyan-300"
            placeholder="Example: 26.9124"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Longitude
          </label>
          <input
            name="longitude"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition focus:border-cyan-300"
            placeholder="Example: 75.7873"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Allowed Radius in Meters
        </label>
        <input
          name="radiusMeters"
          value={radiusMeters}
          onChange={(event) => setRadiusMeters(event.target.value)}
          type="number"
          min="30"
          max="1000"
          className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm outline-none transition focus:border-cyan-300"
          required
        />
        <p className="mt-2 text-xs text-slate-500">
          Recommended: 150m to 250m. GPS accuracy can vary inside buildings.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={useCurrentLocation}
          className="h-12 rounded-2xl border border-white/10 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.04]"
        >
          Use My Current Location
        </button>

        <button
          type="button"
          onClick={testCurrentLocation}
          className="h-12 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm font-bold text-cyan-200 transition hover:bg-cyan-300/15"
        >
          Test My Location
        </button>
      </div>

      {statusMessage ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-300">
          {statusMessage}
        </p>
      ) : null}

      {testResult ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            testResult.insideOffice
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
              : "border-red-300/20 bg-red-300/10 text-red-200"
          }`}
        >
          You are {testResult.distanceMeters}m from the saved office center. {testResult.insideOffice ? "Inside Office ✅" : "Outside Office ❌"}
        </div>
      ) : null}

      {mapHref ? (
        <a
          href={mapHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-bold text-cyan-300 hover:text-cyan-200"
        >
          Open location in Google Maps
        </a>
      ) : null}

      <button
        type="submit"
        className="h-14 w-full rounded-2xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
      >
        Save Office Location
      </button>
    </form>
  );
}
