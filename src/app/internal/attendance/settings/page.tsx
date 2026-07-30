import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { OfficeLocationSettingsForm } from "@/components/office-location-settings-form";
import { WorkforceSetupNavigation } from "@/components/workforce-setup-navigation";
import { checkPermission } from "@/lib/auth-guards";
import { formatIndiaDateTime, getActiveOfficeLocation } from "@/lib/office-attendance";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function LocationIcon() {
  return (
    <Icon>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

function ShieldIcon() {
  return (
    <Icon>
      <path d="M12 3 5 6v5c0 4.5 2.9 8.1 7 10 4.1-1.9 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.5-3.8" />
    </Icon>
  );
}

function HistoryIcon() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </Icon>
  );
}

function UsersIcon() {
  return (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

function getMessage(error?: string, success?: string) {
  if (success === "office-updated") {
    return { type: "success", text: "Office location saved successfully." };
  }

  if (error === "location-required") {
    return { type: "error", text: "Latitude and longitude are required." };
  }

  if (error === "invalid-location") {
    return { type: "error", text: "Please enter valid latitude and longitude values." };
  }

  if (error === "permission-denied") {
    return { type: "error", text: "Only owner can update office attendance settings." };
  }

  return null;
}

export default async function AttendanceSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const { hasAccess } = await checkPermission(
    "manage_attendance_settings",
    "/internal/attendance/settings"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Office Setup Access Denied"
        description="Only the owner can update office location and geofence settings."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const office = await getActiveOfficeLocation();
  const officeReady =
    Boolean(office) &&
    office?.latitude !== null &&
    office?.longitude !== null;

  return (
    <div className="space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 text-slate-950 shadow-sm shadow-slate-200/70 sm:p-7 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:shadow-none">
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-100/80 blur-3xl dark:bg-blue-500/20"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-cyan-100/70 blur-2xl dark:bg-cyan-400/10"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-blue-600 dark:text-blue-300">
                Workforce setup
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                  officeReady
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                }`}
              >
                {officeReady ? "Geofence active" : "Setup required"}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Office & Geofence Setup
            </h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Set the trusted office location used to verify GPS attendance.
              Every update is recorded in the security audit trail.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[410px]">
            <Link
              href="/internal/attendance"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Open Team Attendance
            </Link>
            <Link
              href="/internal/teams"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
            >
              Manage Physical Teams
            </Link>
          </div>
        </div>
      </section>

      <WorkforceSetupNavigation active="office" />

      {message ? (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm font-bold ${
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Office status",
            value: officeReady ? "Configured" : "Not configured",
            helper: officeReady ? "GPS center is active" : "Save a trusted location",
            icon: <LocationIcon />,
            tone:
              "bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300",
          },
          {
            label: "Allowed radius",
            value: officeReady ? `${office?.radiusMeters ?? 200} m` : "—",
            helper: "30–1,000 meter control",
            icon: <ShieldIcon />,
            tone:
              "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300",
          },
          {
            label: "Attendance modes",
            value: "2",
            helper: "Office GPS or field flexible",
            icon: <UsersIcon />,
            tone:
              "bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300",
          },
          {
            label: "Audit protection",
            value: "Enabled",
            helper: office
              ? `Updated ${formatIndiaDateTime(office.updatedAt)}`
              : "Every change is logged",
            icon: <HistoryIcon />,
            tone:
              "bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[22px] border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${item.tone}`}
              >
                {item.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {item.label}
                </p>
                <p className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">
                  {item.value}
                </p>
                <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {item.helper}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-5">
          <div className="overflow-hidden rounded-[26px] border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
            <div className="border-b border-slate-200/80 p-5 dark:border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
                Trusted location
              </p>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">
                    {office?.name ?? "Office not configured"}
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
                    {office?.address ||
                      "Capture the current office GPS and add an address or landmark."}
                  </p>
                </div>
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-4 ${
                    officeReady
                      ? "bg-emerald-500 ring-emerald-100 dark:ring-emerald-500/15"
                      : "bg-amber-500 ring-amber-100 dark:ring-amber-500/15"
                  }`}
                />
              </div>
            </div>

            {officeReady ? (
              <div className="p-5">
                <div className="relative grid min-h-52 place-items-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950">
                  <div className="absolute h-44 w-44 rounded-full border border-blue-200 bg-blue-100/35 dark:border-blue-400/20 dark:bg-blue-500/[0.07]" />
                  <div className="absolute h-28 w-28 rounded-full border border-blue-300 bg-blue-200/30 dark:border-blue-400/30 dark:bg-blue-500/[0.09]" />
                  <div className="relative grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30">
                    <LocationIcon />
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Office center
                        </p>
                        <p className="mt-1 break-all text-xs font-bold text-slate-700 dark:text-slate-200">
                          {office?.latitude?.toFixed(6)},{" "}
                          {office?.longitude?.toFixed(6)}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                        {office?.radiusMeters} m radius
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Last updated
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                      {office
                        ? formatIndiaDateTime(office.updatedAt)
                        : "Not available"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Updated by
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                      {office?.updatedByName || "System"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-[22px] border border-dashed border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/[0.08] dark:text-amber-200">
                  <p className="font-black">First-time setup required</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-amber-800/80 dark:text-amber-200/75">
                    Save an office center and radius before office-based team
                    members can use attendance.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Attendance protection
            </p>
            <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">
              How verification works
            </h2>
            <div className="mt-5 space-y-4">
              {[
                [
                  "1",
                  "Live evidence",
                  "Punch In and Punch Out capture a current selfie and GPS position.",
                ],
                [
                  "2",
                  "Office verification",
                  "Office-based profiles must be inside the configured radius.",
                ],
                [
                  "3",
                  "Field flexibility",
                  "Approved field profiles still capture evidence without the office-radius restriction.",
                ],
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-950 text-xs font-black text-white dark:bg-blue-600">
                    {number}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      {title}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/internal/users"
              className="mt-5 inline-flex text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
            >
              Manage employee attendance modes →
            </Link>
          </div>
        </div>

        <div className="min-w-0 rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">
            Geofence editor
          </p>
          <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">
            {officeReady ? "Update trusted office" : "Configure trusted office"}
          </h2>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
            Capture GPS while standing at the office center, test the result,
            then save. Updates take effect for the next attendance action.
          </p>

          <div className="mt-6">
            <OfficeLocationSettingsForm
              initialName={office?.name ?? "Main Office"}
              initialAddress={office?.address ?? ""}
              initialLatitude={office?.latitude ?? null}
              initialLongitude={office?.longitude ?? null}
              initialRadiusMeters={office?.radiusMeters ?? 200}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
