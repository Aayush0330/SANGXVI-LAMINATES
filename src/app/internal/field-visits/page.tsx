import type { FieldVisitStatus } from "@/generated/prisma/client";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { FieldVisitPhotoGallery } from "@/components/field-visit-photo-gallery";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  fieldVisitStatuses,
  fieldVisitStatusLabels,
  fieldVisitTypeLabels,
  formatFieldVisitDate,
  getFieldVisitStatusClass,
} from "@/lib/field-visits";
import { updateFieldVisitStatusAction } from "./actions";

const selectStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 1rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "18px 18px",
} as const;

function isFieldVisitStatus(value: string): value is FieldVisitStatus {
  return fieldVisitStatuses.some((status) => status === value);
}

function getIndiaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getMessage(error?: string, success?: string) {
  if (success === "status-updated") {
    return {
      type: "success",
      text: "Field visit status updated successfully.",
    };
  }

  const errorMap: Record<string, string> = {
    "permission-denied":
      "You do not have permission to update field visit reports.",
    "missing-visit": "The visit ID is missing.",
    "visit-not-found": "The selected visit no longer exists.",
  };

  if (error && errorMap[error]) {
    return {
      type: "error",
      text: errorMap[error],
    };
  }

  return null;
}

export default async function InternalFieldVisitsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const requestedStatus = params?.status ?? "ALL";
  const selectedStatus = isFieldVisitStatus(requestedStatus)
    ? requestedStatus
    : "ALL";

  const { hasAccess } = await checkPermission(
    "view_field_visit_reports",
    "/internal/field-visits"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Field Visit Reports Access Denied"
        description="Only authorized owner and manager accounts can view all field visit reports."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const [visits, allVisits, photoProofCount] = await Promise.all([
    prisma.fieldVisit.findMany({
      where:
        selectedStatus === "ALL"
          ? undefined
          : {
              status: selectedStatus,
            },
      include: {
        photos: {
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
    prisma.fieldVisit.findMany({
      select: {
        status: true,
        createdAt: true,
      },
    }),
    prisma.fieldVisitPhoto.count(),
  ]);

  const achievedCount = allVisits.filter(
    (visit) => visit.status === "GOAL_ACHIEVED"
  ).length;
  const pendingCount = allVisits.filter(
    (visit) =>
      visit.status === "GOAL_PENDING" ||
      visit.status === "FOLLOW_UP_REQUIRED"
  ).length;
  const today = getIndiaDateKey(new Date());
  const todayCount = allVisits.filter(
    (visit) => getIndiaDateKey(visit.createdAt) === today
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 p-6 shadow-sm shadow-slate-200/70">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-emerald-700">
          Field Management
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-950">
              Field Visit Reports
            </h1>
          </div>

          <form className="flex items-end gap-3">
            <div>
              <label
                htmlFor="visitStatusFilter"
                className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-500"
              >
                Filter Status
              </label>
              <select
                id="visitStatusFilter"
                name="status"
                defaultValue={selectedStatus}
                className="h-12 min-w-56 appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-bold text-slate-950 outline-none focus:border-emerald-500"
                style={selectStyle}
              >
                <option value="ALL">All Visits</option>
                {fieldVisitStatuses.map((status) => (
                  <option key={status} value={status}>
                    {fieldVisitStatusLabels[status]}
                  </option>
                ))}
              </select>
            </div>
            <button className="h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-200">
              Apply
            </button>
          </form>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Total Visits</p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {allVisits.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Today</p>
            <p className="mt-2 text-3xl font-black text-blue-600">
              {todayCount}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Photo Proofs</p>
            <p className="mt-2 text-3xl font-black text-purple-700">
              {photoProofCount}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Goals Achieved</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {achievedCount}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Pending / Follow-up</p>
            <p className="mt-2 text-3xl font-black text-orange-600">
              {pendingCount}
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
          role="status"
        >
          {message.text}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        {visits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-sm text-slate-500">
            No field visit reports were found for this filter.
          </div>
        ) : (
          visits.map((visit) => (
            <article
              key={visit.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70"
            >
              <div className="border-b border-slate-200 bg-white p-3">
                <FieldVisitPhotoGallery
                  photos={visit.photos}
                  shopName={visit.shopName}
                />
              </div>

              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                      {visit.visitNumber} ·{" "}
                      {fieldVisitTypeLabels[visit.visitType] ?? visit.visitType}
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">
                      {visit.shopName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      By {visit.createdByName || "Unknown"} ·{" "}
                      {formatFieldVisitDate(visit.createdAt)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs font-black ${getFieldVisitStatusClass(visit.status)}`}
                  >
                    {fieldVisitStatusLabels[visit.status]}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                  <p>
                    <b className="text-slate-900">Dealer/company:</b>{" "}
                    {visit.dealerName || "-"}
                  </p>
                  <p>
                    <b className="text-slate-900">Contact:</b>{" "}
                    {visit.contactPerson || "-"}
                    {visit.contactPhone ? ` · ${visit.contactPhone}` : ""}
                  </p>
                  <p>
                    <b className="text-slate-900">Description:</b>{" "}
                    {visit.description}
                  </p>
                  {visit.pointsDiscussed ? (
                    <p>
                      <b className="text-blue-700">Points discussed:</b>{" "}
                      {visit.pointsDiscussed}
                    </p>
                  ) : null}
                  {visit.goalsAchieved ? (
                    <p>
                      <b className="text-emerald-700">Goals achieved:</b>{" "}
                      {visit.goalsAchieved}
                    </p>
                  ) : null}
                  {visit.goalsPending ? (
                    <p>
                      <b className="text-orange-700">Goals pending:</b>{" "}
                      {visit.goalsPending}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    <p className="font-bold text-slate-700">Location Proof</p>
                    <p className="mt-2">{visit.locationLabel}</p>
                    <p className="mt-1">
                      Accuracy:{" "}
                      {visit.accuracyMeters !== null
                        ? `${Math.round(visit.accuracyMeters)} m`
                        : "-"}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Open Map
                    </a>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    <p className="font-bold text-slate-700">Follow-up</p>
                    <p className="mt-2">
                      {formatFieldVisitDate(visit.nextFollowUpAt)}
                    </p>
                    <form
                      action={updateFieldVisitStatusAction}
                      className="mt-4 grid grid-cols-[1fr_auto] gap-2"
                    >
                      <input type="hidden" name="visitId" value={visit.id} />
                      <select
                        name="status"
                        aria-label={`Status for ${visit.visitNumber}`}
                        defaultValue={visit.status}
                        className="h-11 appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-10 text-xs font-bold text-slate-950 outline-none focus:border-emerald-500"
                        style={selectStyle}
                      >
                        {fieldVisitStatuses.map((status) => (
                          <option key={status} value={status}>
                            {fieldVisitStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-xl bg-emerald-300 px-4 text-xs font-black text-slate-950 transition hover:bg-emerald-200">
                        Save
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
