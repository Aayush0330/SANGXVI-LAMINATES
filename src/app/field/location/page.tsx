import { AccessDeniedCard } from "@/components/access-denied-card";
import { FieldLiveLocationTracker } from "@/components/field-live-location-tracker";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getFieldLocationLimits } from "@/lib/field-location";
import {
  getPortalLandingLabel,
  getPortalLandingPath,
} from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function FieldLiveLocationPage() {
  const { currentUser, hasAccess } = await checkPermission(
    "share_live_location",
    "/field/location",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Live Location Access Denied"
        description="Your current role cannot share field live location."
        backHref={getPortalLandingPath(currentUser.role)}
        backLabel={getPortalLandingLabel(currentUser.role)}
      />
    );
  }

  const activeSession = await prisma.fieldLocationSession.findFirst({
    where: {
      userId: currentUser.id,
      status: "ACTIVE",
    },
    orderBy: {
      startedAt: "desc",
    },
  });
  const limits = getFieldLocationLimits();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-200">
          Field safety & visibility
        </p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">
          My Live Location
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
          Share your current field position with authorized owner and manager
          accounts while this page remains open.
        </p>
      </section>

      <FieldLiveLocationTracker
        initialSession={
          activeSession
            ? {
                id: activeSession.id,
                startedAt: activeSession.startedAt.toISOString(),
                lastLatitude: activeSession.lastLatitude,
                lastLongitude: activeSession.lastLongitude,
                lastAccuracyMeters: activeSession.lastAccuracyMeters,
                lastRecordedAt:
                  activeSession.lastRecordedAt?.toISOString() ?? null,
              }
            : null
        }
        maximumAccuracyMeters={limits.maxAccuracyMeters}
      />
    </div>
  );
}
