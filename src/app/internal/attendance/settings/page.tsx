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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-blue-600">
          Attendance Setup
        </p>

        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black sm:text-5xl">Office Location</h1>
          </div>

          <Link
            href="/internal/attendance"
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            View Attendance
          </Link>
        </div>
      </section>

      {message ? (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-200"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Current Office</h2>

          {office ? (
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Name</p>
                <p className="mt-2 font-bold text-slate-950">{office.name}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Coordinates</p>
                <p className="mt-2 text-slate-950">{office.latitude}, {office.longitude}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Allowed Radius</p>
                <p className="mt-2 font-bold text-blue-600">{office.radiusMeters} meters</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Last Updated</p>
                <p className="mt-2 text-slate-950">{formatIndiaDateTime(office.updatedAt)}</p>
                <p className="mt-1 text-xs text-slate-500">By {office.updatedByName || "System"}</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              Office location is not configured yet. Use the form to set the first office geofence.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Edit Office Geofence</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
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
