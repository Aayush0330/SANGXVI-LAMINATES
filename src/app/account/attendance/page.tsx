import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { OfficeAttendanceCapture } from "@/components/office-attendance-capture";
import { OfficeAttendanceLiveSummary } from "@/components/office-attendance-live-summary";
import {
  getCurrentUser,
  getPortalLandingLabel,
  getPortalLandingPath,
} from "@/lib/current-user";
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
    return { type: "success", text: "Punch Out saved successfully with server time and GPS proof." };
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
  if (label === "Completed") return "bg-emerald-50 text-emerald-700";
  if (label.startsWith("On ")) return "bg-amber-50 text-yellow-300";
  if (label === "Punched In") return "bg-blue-50 text-blue-600";
  return "bg-slate-500/10 text-slate-500";
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

  if (!currentUser.roles.some((role) => canUseOfficeAttendance(role))) {
    return (
      <AccessDeniedCard
        title="Attendance Not Available"
        description="Office attendance is only available for company team members. Dealer accounts do not need office punch in/out."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const portalBackHref = getPortalLandingPath(currentUser.role);
  const portalBackLabel = getPortalLandingLabel(currentUser.role);

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
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-600">
            Office Attendance
          </p>

          <div className="mt-3 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Attendance</h1>
            </div>

            <nav className="flex flex-wrap gap-2.5 xl:justify-end">
              <Link
                href="/account/attendance/leave"
                className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Leave Apply
              </Link>
              <Link
                href="/account/attendance/corrections"
                className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Correction Request
              </Link>
              <Link
                href="/account/attendance/payslips"
                className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                My Payslips
              </Link>
              <Link
                href="/account/attendance/advance"
                className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Advance Pay
              </Link>
              <Link
                href={portalBackHref}
                className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                {portalBackLabel}
              </Link>
            </nav>
          </div>
        </section>

        {message ? (
          <div
            className={`rounded-2xl border p-5 text-sm font-semibold ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-100"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {!hasOffice ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
            <h2 className="font-bold">Office location is not configured</h2>
            <p className="mt-2 text-sm leading-6 text-amber-800/80">
              Owner must set office GPS location and allowed radius before team attendance can start.
            </p>
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Today Status</p>
            <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(statusLabel)}`}>
              {statusLabel}
            </span>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Punch In</p>
                <p className="mt-1 font-bold text-slate-700">{formatIndiaDateTime(attendance?.punchInAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Punch Out</p>
                <p className="mt-1 font-bold text-slate-700">{formatIndiaDateTime(attendance?.punchOutAt)}</p>
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
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Office</p>
                <p className="mt-2 font-bold text-slate-950">{office.name}</p>
                <p className="mt-1 text-sm text-slate-500">{office.address || "No address added"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Allowed Radius</p>
                <p className="mt-2 font-bold text-blue-600">{office.radiusMeters}m</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">GPS Rule</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Only office area punch, break, and logout actions are accepted.</p>
              </div>
            </div>
          </section>
        ) : null}

        <OfficeAttendanceCapture
          actions={actions}
          disabled={!hasOffice || actions.length === 0}
          helperText={currentBreakText || undefined}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold">Today Timeline</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {events.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-bold text-slate-950">{getAttendanceActionLabel(event.eventType)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatIndiaTime(event.createdAt)}</p>
                    <p className="mt-2 text-sm text-slate-500">{event.note || "-"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.distanceMeters !== null && event.distanceMeters !== undefined
                        ? `${Math.round(event.distanceMeters)}m from office`
                        : "Distance not available"}
                    </p>
                  </div>

                  {event.photoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.photoDataUrl}
                      alt={event.label}
                      className="h-20 w-28 rounded-2xl border border-slate-200 object-cover"
                    />
                  ) : null}
                </div>
              </article>
            ))}

            {events.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                No attendance action submitted today.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
