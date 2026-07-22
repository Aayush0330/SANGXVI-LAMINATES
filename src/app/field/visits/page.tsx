import { AccessDeniedCard } from "@/components/access-denied-card";
import { FieldVisitPhotoGallery } from "@/components/field-visit-photo-gallery";
import { FieldVisitReportForm } from "@/components/field-visit-report-form";
import { checkPermission } from "@/lib/auth-guards";
import { getPortalLandingLabel, getPortalLandingPath } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  fieldVisitStatusLabels,
  fieldVisitTypeLabels,
  formatFieldVisitDate,
  getFieldVisitStatusClass,
} from "@/lib/field-visits";
import { createFieldVisitAction } from "./actions";

function getMessage(error?: string, success?: string) {
  if (success === "visit-saved") {
    return {
      type: "success",
      text: "Field visit report saved successfully.",
    };
  }

  const errorMap: Record<string, string> = {
    "permission-denied":
      "You do not have permission to create field visit reports.",
    "missing-shop": "Please enter the shop or customer name.",
    "missing-description": "Please add a visit description.",
    "missing-location": "Please capture a valid live GPS location before saving.",
    "missing-photo": "Please upload at least one visit photo.",
    "too-many-photos": "Please upload no more than 5 visit photos.",
    "invalid-photo-type": "Only JPG, PNG, or WebP visit photos are allowed.",
    "invalid-photo-content": "The uploaded file is not a valid supported image.",
    "photo-too-large": "Each visit photo must not exceed 3 MB.",
    "photos-total-too-large": "The combined visit photos must not exceed 15 MB.",
  };

  if (error && errorMap[error]) {
    return {
      type: "error",
      text: errorMap[error],
    };
  }

  return null;
}

export default async function FieldVisitsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const message = getMessage(params?.error, params?.success);
  const { currentUser, hasAccess } = await checkPermission(
    "manage_field_visits",
    "/field/visits"
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Field Visit Access Denied"
        description="Your current role does not have permission to manage field visits."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const visits = await prisma.fieldVisit.findMany({
    where: {
      createdById: currentUser.id,
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
    take: 20,
  });

  const goalAchievedCount = visits.filter(
    (visit) => visit.status === "GOAL_ACHIEVED"
  ).length;
  const pendingCount = visits.filter(
    (visit) =>
      visit.status === "GOAL_PENDING" ||
      visit.status === "FOLLOW_UP_REQUIRED"
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 p-5 shadow-sm shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:bg-none dark:shadow-none sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-700">
          Field Management
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
          Shop Visit Updates
        </h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">My Visit Reports</p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {visits.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Goals Achieved</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {goalAchievedCount}
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

      <FieldVisitReportForm action={createFieldVisitAction} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-2xl font-black text-slate-950">My Recent Visits</h2>
        <p className="mt-2 text-sm text-slate-500">
          The latest visit reports uploaded from your account.
        </p>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {visits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              No field visit reports have been uploaded yet.
            </div>
          ) : (
            visits.map((visit) => (
              <article
                key={visit.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <FieldVisitPhotoGallery
                  photos={visit.photos}
                  shopName={visit.shopName}
                  compact
                />

                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                      {visit.visitNumber} ·{" "}
                      {fieldVisitTypeLabels[visit.visitType] ?? visit.visitType}
                    </p>
                    <h3 className="mt-2 text-xl font-black text-slate-950">
                      {visit.shopName}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {visit.dealerName || "Dealer/company not added"} ·{" "}
                      {formatFieldVisitDate(visit.createdAt)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs font-black ${getFieldVisitStatusClass(visit.status)}`}
                  >
                    {fieldVisitStatusLabels[visit.status]}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-600">
                  <p>{visit.description}</p>
                  {visit.pointsDiscussed ? (
                    <p>
                      <b className="text-slate-900">Discussed:</b>{" "}
                      {visit.pointsDiscussed}
                    </p>
                  ) : null}
                  {visit.goalsAchieved ? (
                    <p>
                      <b className="text-emerald-700">Achieved:</b>{" "}
                      {visit.goalsAchieved}
                    </p>
                  ) : null}
                  {visit.goalsPending ? (
                    <p>
                      <b className="text-orange-700">Pending:</b>{" "}
                      {visit.goalsPending}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                  <p>{visit.locationLabel}</p>
                  <p>
                    Accuracy:{" "}
                    {visit.accuracyMeters !== null
                      ? `${Math.round(visit.accuracyMeters)} m`
                      : "Not available"}
                  </p>
                  <p>
                    Follow-up: {formatFieldVisitDate(visit.nextFollowUpAt)}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
