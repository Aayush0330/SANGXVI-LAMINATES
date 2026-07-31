"use client";

import { useEffect, useRef, useState } from "react";

type ActiveSession = {
  id: string;
  startedAt: string;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastAccuracyMeters: number | null;
  lastRecordedAt: string | null;
};

type LocationState = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

type TrackerProps = {
  initialSession: ActiveSession | null;
  maximumAccuracyMeters: number;
};

function formatTime(value: string | null) {
  if (!value) return "Waiting for first GPS point";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function getLocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission is blocked. Allow precise location in browser settings and try again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "GPS location is unavailable. Turn on device location and move near an open area.";
  }
  return "GPS timed out. Keep this page open and try again.";
}

export function FieldLiveLocationTracker({
  initialSession,
  maximumAccuracyMeters,
}: TrackerProps) {
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);
  const sendingRef = useRef(false);
  const [session, setSession] = useState(initialSession);
  const [location, setLocation] = useState<LocationState | null>(
    initialSession?.lastLatitude !== null &&
      initialSession?.lastLongitude !== null &&
      initialSession?.lastAccuracyMeters !== null &&
      initialSession?.lastRecordedAt
      ? {
          latitude: initialSession.lastLatitude,
          longitude: initialSession.lastLongitude,
          accuracyMeters: initialSession.lastAccuracyMeters,
          capturedAt: initialSession.lastRecordedAt,
        }
      : null,
  );
  const [tracking, setTracking] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(
    initialSession
      ? "A sharing session is active, but this browser tab is not currently sending GPS. Press Resume live sharing."
      : "Start sharing when field work begins. You can stop it at any time.",
  );

  function clearLocationWatch() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }

  useEffect(() => clearLocationWatch, []);

  async function sendPoint(
    sessionId: string,
    position: GeolocationPosition,
  ) {
    const capturedAt = new Date(position.timestamp).toISOString();
    const nextLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
      capturedAt,
    };
    setLocation(nextLocation);

    if (position.coords.accuracy > maximumAccuracyMeters) {
      setMessage(
        `GPS accuracy is ${Math.round(position.coords.accuracy)} m. Waiting for ${maximumAccuracyMeters} m or better before sending.`,
      );
      return;
    }

    const now = Date.now();
    if (sendingRef.current || now - lastSentAtRef.current < 30_000) return;

    sendingRef.current = true;
    try {
      const response = await fetch("/api/field/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "point",
          sessionId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          heading: position.coords.heading,
          speedMps: position.coords.speed,
          capturedAt,
        }),
      });
      const result = (await response.json()) as {
        accepted?: boolean;
        error?: string;
      };

      if (!response.ok) {
        if (result.error === "inaccurate-location") {
          setMessage("Waiting for a more accurate GPS fix.");
          return;
        }
        throw new Error(result.error || "Could not send location.");
      }

      lastSentAtRef.current = now;
      if (result.accepted !== false) {
        setSession((current) =>
          current
            ? {
                ...current,
                lastLatitude: nextLocation.latitude,
                lastLongitude: nextLocation.longitude,
                lastAccuracyMeters: nextLocation.accuracyMeters,
                lastRecordedAt: capturedAt,
              }
            : current,
        );
        setMessage(
          `Live location shared at ${formatTime(capturedAt)} · accuracy ${Math.round(position.coords.accuracy)} m.`,
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not send live location.",
      );
    } finally {
      sendingRef.current = false;
    }
  }

  function beginWatching(sessionId: string) {
    if (!navigator.geolocation) {
      setMessage("This browser does not support live GPS location.");
      return;
    }

    clearLocationWatch();
    lastSentAtRef.current = 0;
    setTracking(true);
    setMessage("Finding a precise GPS location...");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void sendPoint(sessionId, position);
      },
      (error) => {
        clearLocationWatch();
        setMessage(getLocationErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 10_000,
      },
    );
  }

  async function startSharing() {
    if (working || tracking) return;
    setWorking(true);
    setMessage("Starting secure location session...");

    try {
      const response = await fetch("/api/field/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const result = (await response.json()) as {
        activeSession?: { id: string; startedAt: string };
        error?: string;
      };
      if (!response.ok || !result.activeSession) {
        throw new Error(result.error || "Could not start live sharing.");
      }

      const nextSession: ActiveSession = {
        id: result.activeSession.id,
        startedAt: result.activeSession.startedAt,
        lastLatitude: session?.lastLatitude ?? null,
        lastLongitude: session?.lastLongitude ?? null,
        lastAccuracyMeters: session?.lastAccuracyMeters ?? null,
        lastRecordedAt: session?.lastRecordedAt ?? null,
      };
      setSession(nextSession);
      beginWatching(nextSession.id);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not start live sharing.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function stopSharing() {
    if (working || !session) return;
    setWorking(true);
    clearLocationWatch();
    setMessage("Stopping live location sharing...");

    try {
      const response = await fetch("/api/field/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          sessionId: session.id,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Could not stop live sharing.");
      }

      setSession(null);
      setMessage("Live location sharing stopped successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not stop live sharing.",
      );
    } finally {
      setWorking(false);
    }
  }

  const mapHref =
    location !== null
      ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-slate-900 dark:shadow-none sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.26em] text-blue-600 dark:text-blue-300">
              Sharing control
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {tracking
                ? "Live location is on"
                : session
                  ? "Sharing needs resume"
                  : "Live location is off"}
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
              tracking
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                tracking ? "animate-pulse bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {tracking ? "Sharing now" : "Not transmitting"}
          </span>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {message}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void startSharing()}
            disabled={working || tracking}
            className="min-h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working
              ? "Please wait..."
              : session
                ? "Resume live sharing"
                : "Start live sharing"}
          </button>
          <button
            type="button"
            onClick={() => void stopSharing()}
            disabled={working || !session}
            className="min-h-12 rounded-2xl border border-rose-200 bg-rose-50 px-5 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300"
          >
            Stop sharing
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          Keep this ERP page open during field work. Web browsers cannot provide
          reliable continuous tracking after the tab or browser is closed.
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-blue-50 p-5 dark:border-white/10 dark:bg-slate-900 dark:bg-none sm:p-7">
        <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">
          Latest GPS
        </p>
        {location ? (
          <>
            <p className="mt-3 text-3xl font-black text-slate-950 dark:text-white">
              ±{Math.round(location.accuracyMeters)} m
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Captured at {formatTime(location.capturedAt)}
            </p>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
                <p className="text-xs font-bold text-slate-400">Latitude</p>
                <p className="mt-1 font-mono font-bold text-slate-800 dark:text-slate-100">
                  {location.latitude.toFixed(6)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950">
                <p className="text-xs font-bold text-slate-400">Longitude</p>
                <p className="mt-1 font-mono font-bold text-slate-800 dark:text-slate-100">
                  {location.longitude.toFixed(6)}
                </p>
              </div>
            </div>
            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-sm font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"
              >
                Open latest point in Google Maps →
              </a>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
            No GPS point has been received in this session yet.
          </p>
        )}
      </section>
    </div>
  );
}
