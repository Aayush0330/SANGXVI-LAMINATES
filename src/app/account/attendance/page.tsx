import Image from "next/image";
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
  formatIndiaTime,
  getActiveOfficeLocation,
  getAllowedAttendanceActions,
  getAttendanceActionLabel,
  getBreakTypeLabel,
  getTodayAttendanceEventsForUser,
  getTodayAttendanceForUser,
} from "@/lib/office-attendance";

type AttendanceNavIcon =
  | "leave"
  | "correction"
  | "payslip"
  | "advance"
  | "workspace";

function getMessage(error?: string, success?: string, distance?: string) {
  if (success === "punched-in") {
    return {
      type: "success",
      text: "Punch In saved successfully with live photo and location proof.",
    };
  }

  if (success === "punched-out") {
    return {
      type: "success",
      text: "Punch Out saved successfully with server time and GPS proof.",
    };
  }

  if (success === "lunch-started") {
    return {
      type: "success",
      text: "Lunch Break started. Break timer is now running.",
    };
  }

  if (success === "lunch-ended") {
    return {
      type: "success",
      text: "Lunch Break ended. Break time has been counted.",
    };
  }

  if (success === "tea-started") {
    return {
      type: "success",
      text: "Tea Break started. Break timer is now running.",
    };
  }

  if (success === "tea-ended") {
    return {
      type: "success",
      text: "Tea Break ended. Break time has been counted.",
    };
  }

  if (success === "small-break-started") {
    return {
      type: "success",
      text: "Small Break started. Break timer is now running.",
    };
  }

  if (success === "small-break-ended") {
    return {
      type: "success",
      text: "Small Break ended. Break time has been counted.",
    };
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
    return {
      type: "error",
      text: "Office location is not configured yet. Please contact the owner.",
    };
  }

  if (error === "location-required") {
    return {
      type: "error",
      text: "Live GPS location is required for attendance.",
    };
  }

  if (error === "photo-required") {
    return {
      type: "error",
      text: "Live camera photo is required for attendance.",
    };
  }

  if (error === "photo-too-large") {
    return {
      type: "error",
      text: "Captured photo is too large. Please restart camera and try again.",
    };
  }

  if (error === "invalid-photo-content") {
    return {
      type: "error",
      text: "Captured file is not a valid JPEG camera photo. Please retake it.",
    };
  }

  if (error === "inaccurate-location") {
    return {
      type: "error",
      text: "GPS accuracy is too low. Move near a window, enable precise location, and try again.",
    };
  }

  if (error === "already-punched-in") {
    return {
      type: "error",
      text: "You have already punched in today. Use break tags or Punch Out.",
    };
  }

  if (error === "already-completed") {
    return {
      type: "error",
      text: "Your attendance is already completed for today.",
    };
  }

  if (error === "punch-in-first") {
    return {
      type: "error",
      text: "Punch In is required before break or Punch Out.",
    };
  }

  if (error === "end-current-break-first") {
    return {
      type: "error",
      text: "Please end the current break before starting another break or logging out.",
    };
  }

  if (error === "invalid-break-end") {
    return {
      type: "error",
      text: "This break cannot be ended because a different break is currently active.",
    };
  }

  return null;
}

function getStatusLabel(
  attendance: Awaited<ReturnType<typeof getTodayAttendanceForUser>>,
) {
  if (!attendance?.punchInAt) return "Not Punched In";
  if (attendance.punchOutAt || attendance.status === "COMPLETED") {
    return "Completed";
  }
  if (attendance.currentBreakType) {
    return `On ${getBreakTypeLabel(attendance.currentBreakType)}`;
  }
  return "Punched In";
}

function getStatusClass(label: string) {
  if (label === "Completed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/25";
  }
  if (label.startsWith("On ")) {
    return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/25";
  }
  if (label === "Punched In") {
    return "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-400/15 dark:text-blue-200 dark:ring-blue-400/25";
  }
  return "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10";
}

function getStatusDotClass(label: string) {
  if (label === "Completed") return "bg-emerald-400";
  if (label.startsWith("On ")) return "bg-amber-400";
  if (label === "Punched In") return "animate-pulse bg-blue-400";
  return "bg-slate-500";
}

function getIndiaDateLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function AttendanceIcon({
  type,
  className = "h-4 w-4",
}: {
  type: AttendanceNavIcon;
  className?: string;
}) {
  const commonProps = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "leave") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M4 10h16M8 14h3" />
      </svg>
    );
  }

  if (type === "correction") {
    return (
      <svg {...commonProps}>
        <path d="M4 19h4l11-11-4-4L4 15v4Z" />
        <path d="m13.5 5.5 4 4M4 21h16" />
      </svg>
    );
  }

  if (type === "payslip") {
    return (
      <svg {...commonProps}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5M9 12h6M9 16h6" />
      </svg>
    );
  }

  if (type === "advance") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M3 10h18M8 15h2" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 12h13M13 7l5 5-5 5" />
      <path d="M20 4v16" />
    </svg>
  );
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
  const message = getMessage(
    params?.error,
    params?.success,
    params?.distance,
  );

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
  const hasOffice = Boolean(
    office && office.latitude !== null && office.longitude !== null,
  );
  const actions = hasOffice ? getAllowedAttendanceActions(attendance) : [];
  const statusLabel = getStatusLabel(attendance);
  const currentBreakText = attendance?.currentBreakType
    ? `${getBreakTypeLabel(attendance.currentBreakType)} is currently running. End it before logging out.`
    : null;

  const personalNavigation: {
    label: string;
    href: string;
    icon: AttendanceNavIcon;
    primary?: boolean;
  }[] = [
    {
      label: "Apply Leave",
      href: "/account/attendance/leave",
      icon: "leave",
    },
    {
      label: "Request Correction",
      href: "/account/attendance/corrections",
      icon: "correction",
    },
    {
      label: "My Payslips",
      href: "/account/attendance/payslips",
      icon: "payslip",
    },
    {
      label: "Advance Pay",
      href: "/account/attendance/advance",
      icon: "advance",
    },
    {
      label: portalBackLabel,
      href: portalBackHref,
      icon: "workspace",
      primary: true,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f9] px-3 pb-28 pt-4 text-slate-950 sm:px-5 sm:pt-5 lg:px-7 lg:pb-8 lg:pt-7 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 text-slate-950 shadow-sm shadow-slate-200/70 sm:p-7 lg:p-8 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:shadow-none">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-100/80 blur-3xl dark:bg-blue-500/20"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-100/70 blur-3xl dark:bg-cyan-400/10"
            aria-hidden="true"
          />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-sm font-black text-blue-700 ring-1 ring-blue-100 dark:bg-white/10 dark:text-blue-100 dark:ring-white/10">
                  {getInitials(currentUser.name)}
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
                    Workforce command center
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {getIndiaDateLabel()}
                  </p>
                </div>
              </div>

              <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
                My Attendance
              </h1>
              <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">
                Record verified office time, manage breaks and review today&apos;s
                complete attendance trail.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:min-w-[420px]">
              <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-white/[0.06] dark:ring-white/10">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Current status
                </p>
                <span
                  className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ring-1 ${getStatusClass(
                    statusLabel,
                  )}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${getStatusDotClass(
                      statusLabel,
                    )}`}
                  />
                  {statusLabel}
                </span>
              </div>
              <div className="grid min-w-0 flex-[1.35] grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200 dark:bg-white/10 dark:ring-white/10">
                <div className="bg-slate-50 p-4 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Punch In
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
                    {formatIndiaTime(attendance?.punchInAt)}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Punch Out
                  </p>
                  <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
                    {formatIndiaTime(attendance?.punchOutAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <nav
          aria-label="Attendance shortcuts"
          className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900"
        >
          {personalNavigation.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                item.primary
                  ? "ml-auto bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
              }`}
            >
              <AttendanceIcon type={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        {message ? (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm font-bold leading-6 ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/[0.08] dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/[0.08] dark:text-rose-200"
            }`}
          >
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                message.type === "success" ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {message.text}
          </div>
        ) : null}

        {!hasOffice ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/[0.08] dark:text-amber-200">
            <h2 className="font-black">Office location is not configured</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-amber-800/80 dark:text-amber-200/75">
              The owner must set the office GPS location and allowed radius
              before team attendance can start.
            </p>
          </div>
        ) : null}

        <OfficeAttendanceLiveSummary
          initialNow={new Date().toISOString()}
          punchInAt={
            attendance?.punchInAt
              ? new Date(attendance.punchInAt).toISOString()
              : null
          }
          punchOutAt={
            attendance?.punchOutAt
              ? new Date(attendance.punchOutAt).toISOString()
              : null
          }
          currentBreakStartedAt={
            attendance?.currentBreakStartedAt
              ? new Date(attendance.currentBreakStartedAt).toISOString()
              : null
          }
          breakMinutes={attendance?.breakMinutes ?? 0}
          totalMinutes={attendance?.totalMinutes ?? null}
          netWorkingMinutes={attendance?.netWorkingMinutes ?? null}
        />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.65fr)]">
          <OfficeAttendanceCapture
            actions={actions}
            disabled={!hasOffice || actions.length === 0}
            helperText={currentBreakText || undefined}
          />

          <aside className="space-y-4 xl:sticky xl:top-24">
            <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-5 dark:border-white/10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
                  Workplace verification
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                  Office access rule
                </h2>
              </div>

              <div className="p-5">
                {office ? (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="font-black text-slate-950 dark:text-white">
                          {office.name}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-5 text-slate-500 dark:text-slate-400">
                          {office.address || "Office address not added"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.04]">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Allowed radius
                        </p>
                        <p className="mt-2 text-xl font-black text-blue-700 dark:text-blue-300">
                          {office.radiusMeters}m
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.04]">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Verification
                        </p>
                        <p className="mt-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
                          GPS + server time
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
                    Office configuration is pending. Attendance actions will
                    stay disabled until setup is complete.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                How verification works
              </p>
              <div className="mt-4 space-y-4">
                {[
                  "Punch In captures a live camera photo.",
                  "Every action validates precise live GPS.",
                  "Trusted server time prevents manual time changes.",
                ].map((item, index) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[10px] font-black text-white dark:bg-blue-600">
                      {index + 1}
                    </span>
                    <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-white/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
                Verified activity
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Today&apos;s timeline
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {events.length} {events.length === 1 ? "event" : "events"}
            </span>
          </div>

          <div className="p-4 sm:p-6">
            {events.length > 0 ? (
              <div className="relative space-y-3 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-slate-200 dark:before:bg-white/10">
                {events.map((event, index) => (
                  <article
                    key={event.id}
                    className="relative flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-200 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-blue-400/30"
                  >
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white ring-4 ring-white dark:bg-blue-600 dark:ring-slate-900">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="font-black text-slate-950 dark:text-white">
                            {getAttendanceActionLabel(event.eventType)}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            {formatIndiaTime(event.createdAt)}
                          </p>
                        </div>
                        {event.photoDataUrl ? (
                          <Image
                            src={event.photoDataUrl}
                            alt={event.label}
                            width={112}
                            height={80}
                            unoptimized
                            className="h-20 w-28 rounded-2xl border border-slate-200 object-cover dark:border-white/10"
                          />
                        ) : null}
                      </div>

                      <p className="mt-3 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
                        {event.note || "Verified attendance event recorded."}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        <AttendanceIcon type="workspace" className="h-3 w-3" />
                        {event.distanceMeters !== null &&
                        event.distanceMeters !== undefined
                          ? `${Math.round(event.distanceMeters)}m from office`
                          : "Distance unavailable"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-white/10">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/[0.06]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </span>
                <p className="mt-4 text-sm font-black text-slate-800 dark:text-slate-200">
                  No attendance activity yet
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Your verified actions will appear here in chronological
                  order.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
