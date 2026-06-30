import Link from "next/link";
import Image from "next/image";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { OfficeAttendanceCapture } from "@/components/office-attendance-capture";
import { OfficeAttendanceLiveSummary } from "@/components/office-attendance-live-summary";
import { getCurrentUser } from "@/lib/current-user";
import {
  canUseOfficeAttendance,
  formatIndiaDateTime,
  formatIndiaTime,
  getActiveOfficeLocation,
  getAllowedAttendanceActions,
  getAttendanceActionLabel,
  getBreakTypeLabel,
  getTodayAttendanceEventsForUser,
  getTodayAttendanceForUser,
} from "@/lib/office-attendance";

function getMessage(error?: string, success?: string, distance?: string) {
  if (success === "punched-in") {
    return { type: "success", text: "Punch In saved successfully with live photo and location proof." };
  }

  if (success === "punched-out") {
    return { type: "success", text: "Logging Out / Punch Out saved successfully with server time and GPS proof." };
  }

  if (success === "lunch-started") {
    return { type: "success", text: "Lunch Break started. Break timer is now running." };
  }

  if (success === "lunch-ended") {
    return { type: "success", text: "Lunch Break ended. Break time has been counted." };
  }

  if (success === "tea-started") {
    return { type: "success", text: "Tea Break started. Break timer is now running." };
  }

  if (success === "tea-ended") {
    return { type: "success", text: "Tea Break ended. Break time has been counted." };
  }

  if (success === "small-break-started") {
    return { type: "success", text: "Small Break started. Break timer is now running." };
  }

  if (success === "small-break-ended") {
    return { type: "success", text: "Small Break ended. Break time has been counted." };
  }

  if (error === "outside-office") {
    return {
      type: "error",
      text: distance
        ? `Action blocked. You are ${distance}m away from office location.`
        : "Action blocked. You are outside the allowed office area.",
    };
  }

  if (error === "office-not-configured") {
    return { type: "error", text: "Office location is not configured yet. Please contact the owner." };
  }

  if (error === "location-required") {
    return { type: "error", text: "Live GPS location is required for attendance." };
  }

  if (error === "invalid-location") {
    return { type: "error", text: "The browser returned invalid GPS coordinates. Please try again." };
  }

  if (error === "photo-required") {
    return { type: "error", text: "Live camera photo is required for attendance." };
  }

  if (error === "photo-too-large") {
    return { type: "error", text: "Captured photo is too large. Please restart camera and try again." };
  }

  if (error === "already-punched-in") {
    return { type: "error", text: "You have already punched in today. Use break tags or Punch Out." };
  }

  if (error === "already-completed") {
    return { type: "error", text: "Your attendance is already completed for today." };
  }

  if (error === "punch-in-first") {
    return { type: "error", text: "Punch In is required before break or Punch Out." };
  }

  if (error === "end-current-break-first") {
    return { type: "error", text: "Please end the current break before starting another break or logging out." };
  }

  if (error === "invalid-break-end") {
    return { type: "error", text: "This break cannot be ended because a different break is currently active." };
  }

  return null;
}

function getStatusLabel(attendance: Awaited<ReturnType<typeof getTodayAttendanceForUser>>) {
  if (!attendance?.punchInAt) return "Not Punched In";
  if (attendance.punchOutAt || attendance.status === "COMPLETED") return "Completed";
  if (attendance.currentBreakType) return `On ${getBreakTypeLabel(attendance.currentBreakType)}`;
  return "Punched In";
}

function getStatusClass(label: string) {
  if (label === "Completed") return "bg-emerald-300/10 text-emerald-300";
  if (label.startsWith("On ")) return "bg-yellow-300/10 text-yellow-300";
  if (label === "Punched In") return "bg-cyan-300/10 text-cyan-300";
  return "bg-slate-500/10 text-slate-400";
}

export default async function AccountAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    distance?: string;
  }>;
}) {
  const currentUser = await getCurrentUser();
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success, params?.distance);

  if (!canUseOfficeAttendance(currentUser.role)) {
    return (
      <AccessDeniedCard
        title="Attendance Not Available"
        description="Office attendance is only available for company team members. Dealer accounts do not need office punch in/out."
        backHref="/dealer/dashboard"
        backLabel="Go to Dealer Dashboard"
      />
    );
  }

  const office = await getActiveOfficeLocation();
  const attendance = await getTodayAttendanceForUser(currentUser.id);
  const events = await getTodayAttendanceEventsForUser(currentUser.id);
  const hasOffice = Boolean(office && office.latitude !== null && office.longitude !== null);
  const actions = hasOffice ? getAllowedAttendanceActions(attendance) : [];
  const statusLabel = getStatusLabel(attendance);
  const currentBreakText = attendance?.currentBreakType
    ? `${getBreakTypeLabel(attendance.currentBreakType)} is currently running. End it before logging out.`
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
            Office Attendance
          </p>

          <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Punch, Breaks & Logout</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Punch In requires live photo and GPS. Breaks and logout use server time plus office GPS verification.
              </p>
            </div>

            <Link
              href="/internal/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.04]"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

        {message ? (
          <div
            className={`rounded-3xl border p-5 text-sm font-semibold ${
              message.type === "success"
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border-red-300/20 bg-red-300/10 text-red-100"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {!hasOffice ? (
          <div className="rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-5 text-yellow-100">
            <h2 className="font-bold">Office location is not configured</h2>
            <p className="mt-2 text-sm leading-6 text-yellow-100/80">
              Owner must set office GPS location and allowed radius before team attendance can start.
            </p>
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 lg:col-span-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Today Status</p>
            <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(statusLabel)}`}>
              {statusLabel}
            </span>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Punch In</p>
                <p className="mt-1 font-bold text-slate-200">{formatIndiaDateTime(attendance?.punchInAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Logging Out / Punch Out</p>
                <p className="mt-1 font-bold text-slate-200">{formatIndiaDateTime(attendance?.punchOutAt)}</p>
              </div>
            </div>
          </div>

        </section>

        <OfficeAttendanceLiveSummary
          initialNow={new Date().toISOString()}
          punchInAt={attendance?.punchInAt ? new Date(attendance.punchInAt).toISOString() : null}
          punchOutAt={attendance?.punchOutAt ? new Date(attendance.punchOutAt).toISOString() : null}
          currentBreakStartedAt={attendance?.currentBreakStartedAt ? new Date(attendance.currentBreakStartedAt).toISOString() : null}
          breakMinutes={attendance?.breakMinutes ?? 0}
          totalMinutes={attendance?.totalMinutes ?? null}
          netWorkingMinutes={attendance?.netWorkingMinutes ?? null}
        />

        {office ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Office</p>
                <p className="mt-2 font-bold text-white">{office.name}</p>
                <p className="mt-1 text-sm text-slate-400">{office.address || "No address added"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Allowed Radius</p>
                <p className="mt-2 font-bold text-cyan-300">{office.radiusMeters}m</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">GPS Rule</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Only office area punch, break, and logout actions are accepted.</p>
              </div>
            </div>
          </section>
        ) : null}

        <OfficeAttendanceCapture
          actions={actions}
          disabled={!hasOffice || actions.length === 0}
          helperText={currentBreakText || undefined}
        />

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">Today Timeline</h2>
              <p className="mt-1 text-sm text-slate-500">Punch In, lunch, tea, small break and logging out history.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {events.map((event) => (
              <article key={event.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-bold text-white">{getAttendanceActionLabel(event.eventType)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatIndiaTime(event.createdAt)}</p>
                    <p className="mt-2 text-sm text-slate-400">{event.note || "-"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.distanceMeters !== null && event.distanceMeters !== undefined
                        ? `${Math.round(event.distanceMeters)}m from office`
                        : "Distance not available"}
                    </p>
                  </div>

                  {event.photoDataUrl ? (
                    <Image
                      src={event.photoDataUrl}
                      alt={event.label}
                      width={112}
                      height={80}
                      unoptimized
                      className="h-20 w-28 rounded-2xl border border-white/10 object-cover"
                    />
                  ) : null}
                </div>
              </article>
            ))}

            {events.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-500">
                No attendance action submitted today.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
