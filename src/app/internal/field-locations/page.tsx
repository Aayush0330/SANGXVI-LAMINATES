import { AccessDeniedCard } from "@/components/access-denied-card";
import {
  FieldLocationMonitor,
  type FieldLocationSnapshot,
} from "@/components/field-location-monitor";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  getFieldLocationHistoryCutoff,
  isFieldLocationFresh,
} from "@/lib/field-location";

export const dynamic = "force-dynamic";

export default async function InternalFieldLocationsPage() {
  const { hasAccess } = await checkPermission(
    "view_live_locations",
    "/internal/field-locations",
  );

  if (!hasAccess) {
    return (
      <AccessDeniedCard
        title="Live Location Access Denied"
        description="Only authorized owner and manager accounts can view field live locations."
        backHref="/internal/dashboard"
        backLabel="Go to Dashboard"
      />
    );
  }

  const since = getFieldLocationHistoryCutoff();
  const sessions = await prisma.fieldLocationSession.findMany({
    where: {
      OR: [{ status: "ACTIVE" }, { startedAt: { gte: since } }],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { lastRecordedAt: "desc" }],
    take: 100,
  });

  const snapshots: FieldLocationSnapshot[] = sessions.map((session) => ({
    id: session.id,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    lastLatitude: session.lastLatitude,
    lastLongitude: session.lastLongitude,
    lastAccuracyMeters: session.lastAccuracyMeters,
    lastRecordedAt: session.lastRecordedAt?.toISOString() ?? null,
    isFresh: isFieldLocationFresh(session.lastRecordedAt),
    user: session.user,
  }));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50 p-6 shadow-sm shadow-slate-200/70 dark:border-white/10 dark:bg-slate-900 dark:bg-none dark:shadow-none sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-300">
          Field operations
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">
          Live Team Locations
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          View positions that field users explicitly share from the ERP. A
          stale status means their browser stopped sending recent GPS updates.
          Access is restricted and stopped-session data follows the configured
          retention window.
        </p>
      </section>

      <FieldLocationMonitor initialSnapshots={snapshots} />
    </div>
  );
}
