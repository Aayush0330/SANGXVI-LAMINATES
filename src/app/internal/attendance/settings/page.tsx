import Link from "next/link";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { OfficeLocationSettingsForm } from "@/components/office-location-settings-form";
import { checkPermission } from "@/lib/auth-guards";
import { formatIndiaDateTime, getActiveOfficeLocation } from "@/lib/office-attendance";

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

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
          Attendance Setup
        </p>

        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black sm:text-5xl">Office Location</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Set the official office geofence. Employees can punch in/out only when they are inside this radius.
            </p>
          </div>

          <Link
            href="/internal/attendance"
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.04]"
          >
            View Attendance
          </Link>
        </div>
      </section>

      {message ? (
        <div className={`rounded-3xl border px-5 py-4 text-sm font-semibold ${message.type === "success" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-red-300/20 bg-red-300/10 text-red-200"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-xl font-bold">Current Office</h2>

          {office ? (
            <div className="mt-5 space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Name</p>
                <p className="mt-2 font-bold text-white">{office.name}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Coordinates</p>
                <p className="mt-2 text-white">{office.latitude}, {office.longitude}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Allowed Radius</p>
                <p className="mt-2 font-bold text-cyan-300">{office.radiusMeters} meters</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Last Updated</p>
                <p className="mt-2 text-white">{formatIndiaDateTime(office.updatedAt)}</p>
                <p className="mt-1 text-xs text-slate-500">By {office.updatedByName || "System"}</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm leading-6 text-yellow-100">
              Office location is not configured yet. Use the form to set the first office geofence.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-xl font-bold">Edit Office Geofence</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Owner can update this any time. Every update is saved in security audit logs.
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
