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
      }
    );
  });
}

function getButtonClass(tone?: AttendanceActionOption["tone"]) {
  if (tone === "danger") {
    return "bg-red-300 text-red-950 hover:bg-red-200";
  }

  if (tone === "warning") {
    return "bg-amber-500 text-slate-950 hover:bg-amber-600";
  }

  return "bg-blue-600 text-white hover:bg-blue-700";
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
  const [selectedAction, setSelectedAction] = useState<AttendanceActionType | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPhotoAction = actions.some((action) => requiresLivePhoto(action.actionType));

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
      setMessage("Opening live camera for Punch In proof...");

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
      setMessage("Camera ready. Click Punch In to capture live photo and GPS.");
    } catch {
      setMessage("Camera permission is required for Punch In proof.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error("Camera is not ready yet.");
    }

    const outputWidth = 360;
    const outputHeight = Math.round((video.videoHeight / video.videoWidth) * outputWidth);

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
          ? "Capturing Punch In photo and GPS location..."
          : "Saving break/logout time with GPS location..."
      );

      const photoDataUrl = photoRequired ? capturePhoto() : "";
      const location = await getCurrentPosition();

      const formData = new FormData();
      formData.append("actionType", actionType);
      formData.append("latitude", String(location.latitude));
      formData.append("longitude", String(location.longitude));
      formData.append("accuracyMeters", String(location.accuracyMeters));
      formData.append("photoDataUrl", photoDataUrl);

      setMessage(photoRequired ? "Submitting Punch In proof..." : "Submitting attendance time...");

      startTransition(async () => {
        await submitAttendancePunchAction(formData);
      });
    } catch (error) {
      setSelectedAction(null);
      setMessage(error instanceof Error ? error.message : "Could not submit attendance.");
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-600/[0.04] p-4 sm:p-6">
      {hasPhotoAction ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-video w-full bg-slate-50 object-cover"
            />
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-bold text-slate-950">Photo already captured at Punch In</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Breaks and logout do not need another photo. Click the correct action and the system will save server time, GPS location, and office geofence verification.
          </p>
        </div>
      )}

      {message ? (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          {message}
        </p>
      ) : null}

      {helperText ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {helperText}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {hasPhotoAction ? (
          <button
            type="button"
            onClick={startCamera}
            disabled={disabled || isPending}
            className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cameraReady ? "Restart Camera" : "Start Live Camera"}
          </button>
        ) : null}

        {actions.map((action) => {
          const photoRequired = requiresLivePhoto(action.actionType);
          const actionDisabled = disabled || isPending || (photoRequired && !cameraReady);

          return (
            <button
              key={action.actionType}
              type="button"
              onClick={() => handleSubmit(action.actionType)}
              disabled={actionDisabled}
              className={`h-12 rounded-2xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass(action.tone)}`}
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
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          Attendance is completed for today.
        </p>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Gallery upload is not allowed. Punch In uses live camera photo, live GPS, server time, and office radius verification. Breaks and logout save server time with GPS/geofence verification only.
      </p>
    </div>
  );
}
