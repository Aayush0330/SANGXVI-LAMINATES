"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { submitAttendancePunchAction } from "@/app/account/attendance/actions";

type AttendanceActionType =
  | "PUNCH_IN"
  | "LUNCH_START"
  | "LUNCH_END"
  | "TEA_START"
  | "TEA_END"
  | "SMALL_BREAK_START"
  | "SMALL_BREAK_END"
  | "PUNCH_OUT";

type AttendanceActionOption = {
  actionType: AttendanceActionType;
  label: string;
  tone?: "primary" | "warning" | "danger";
};

type AttendanceCaptureProps = {
  actions: AttendanceActionOption[];
  disabled?: boolean;
  helperText?: string;
};

type GeoPositionResult = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

function requiresLivePhoto(actionType: AttendanceActionType) {
  return actionType === "PUNCH_IN";
}

function getCurrentPosition() {
  return new Promise<GeoPositionResult>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      () => {
        reject(new Error("Location permission denied or unavailable."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

function CameraIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 6 10 4h4l1.5 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

function ShieldIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function LocationIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function getButtonClass(tone?: AttendanceActionOption["tone"]) {
  if (tone === "danger") {
    return "bg-rose-600 text-white shadow-[0_8px_20px_rgba(225,29,72,0.18)] hover:bg-rose-700 focus-visible:ring-rose-500";
  }

  if (tone === "warning") {
    return "border border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 focus-visible:ring-amber-500 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15";
  }

  return "bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)] hover:bg-blue-700 focus-visible:ring-blue-500";
}

export function OfficeAttendanceCapture({
  actions,
  disabled = false,
  helperText,
}: AttendanceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] =
    useState<AttendanceActionType | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPhotoAction = actions.some((action) =>
    requiresLivePhoto(action.actionType),
  );

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  async function startCamera() {
    try {
      setCameraReady(false);
      setMessage("Opening the live camera for Punch In verification...");
      stream?.getTracks().forEach((track) => track.stop());

      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: {
            ideal: 640,
          },
        },
      });

      setStream(nextStream);
      setCameraReady(true);
      setMessage("Camera ready. Punch In will capture your photo and live GPS.");
    } catch {
      setMessage("Camera permission is required for Punch In verification.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error("Camera is not ready yet.");
    }

    const outputWidth = 360;
    const outputHeight = Math.round(
      (video.videoHeight / video.videoWidth) * outputWidth,
    );

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not capture photo.");
    }

    context.drawImage(video, 0, 0, outputWidth, outputHeight);
    return canvas.toDataURL("image/jpeg", 0.62);
  }

  async function handleSubmit(actionType: AttendanceActionType) {
    if (disabled || isPending) return;

    const photoRequired = requiresLivePhoto(actionType);

    try {
      if (photoRequired && !cameraReady) {
        await startCamera();
        return;
      }

      setSelectedAction(actionType);
      setMessage(
        photoRequired
          ? "Capturing Punch In photo and precise GPS..."
          : "Verifying GPS and saving the attendance action...",
      );

      const photoDataUrl = photoRequired ? capturePhoto() : "";
      const location = await getCurrentPosition();

      const formData = new FormData();
      formData.append("actionType", actionType);
      formData.append("latitude", String(location.latitude));
      formData.append("longitude", String(location.longitude));
      formData.append("accuracyMeters", String(location.accuracyMeters));
      formData.append("photoDataUrl", photoDataUrl);

      setMessage(
        photoRequired
          ? "Submitting verified Punch In..."
          : "Submitting verified attendance time...",
      );

      startTransition(async () => {
        await submitAttendancePunchAction(formData);
      });
    } catch (error) {
      setSelectedAction(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not submit attendance.",
      );
    }
  }

  return (
    <section
      aria-labelledby="attendance-action-center"
      className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:shadow-black/20"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <CameraIcon />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
              Verified attendance
            </p>
            <h2
              id="attendance-action-center"
              className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white"
            >
              Attendance action center
            </h2>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <ShieldIcon className="h-3.5 w-3.5" />
          Secure proof
        </span>
      </div>

      <div className="p-4 sm:p-6">
        {hasPhotoAction ? (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner dark:border-white/10">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-video w-full bg-slate-950 object-cover"
              />

              {!cameraReady ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/96 px-6 text-center text-white">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-blue-200 ring-1 ring-white/10">
                    <CameraIcon className="h-7 w-7" />
                  </span>
                  <p className="mt-4 text-sm font-black">
                    Live camera is off
                  </p>
                  <p className="mt-2 max-w-sm text-xs font-medium leading-5 text-slate-400">
                    Start the camera to prepare your one-time Punch In identity
                    proof.
                  </p>
                </div>
              ) : null}

              <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white backdrop-blur">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    cameraReady ? "animate-pulse bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                {cameraReady ? "Camera ready" : "Awaiting permission"}
              </span>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </>
        ) : (
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/[0.07]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <ShieldIcon />
              </span>
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Identity proof already secured
                </p>
                <p className="mt-1 text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
                  Break and Punch Out actions only verify live GPS, office
                  geofence and trusted server time.
                </p>
              </div>
            </div>
          </div>
        )}

        {message ? (
          <div
            aria-live="polite"
            className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/70 px-4 py-3.5 text-sm font-semibold leading-6 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/[0.08] dark:text-blue-200"
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            {message}
          </div>
        ) : null}

        {helperText ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm font-semibold leading-6 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/[0.08] dark:text-amber-200">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            {helperText}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {hasPhotoAction ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={disabled || isPending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
            >
              <CameraIcon className="h-4 w-4" />
              {cameraReady ? "Restart Camera" : "Start Live Camera"}
            </button>
          ) : null}

          {actions.map((action) => {
            const photoRequired = requiresLivePhoto(action.actionType);
            const actionDisabled =
              disabled || isPending || (photoRequired && !cameraReady);

            return (
              <button
                key={action.actionType}
                type="button"
                onClick={() => handleSubmit(action.actionType)}
                disabled={actionDisabled}
                className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass(
                  action.tone,
                )}`}
              >
                {isPending && selectedAction === action.actionType
                  ? "Submitting..."
                  : photoRequired && !cameraReady
                    ? "Start Camera First"
                    : action.label}
              </button>
            );
          })}
        </div>

        {actions.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/[0.08] dark:text-emerald-300">
            <ShieldIcon className="h-4 w-4 shrink-0" />
            Attendance is completed for today.
          </div>
        ) : null}

        <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs font-medium leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">
          <LocationIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Gallery uploads are disabled. The system accepts live camera proof
            for Punch In and verifies live GPS, office radius and server time
            for every attendance action.
          </p>
        </div>
      </div>
    </section>
  );
}
