import { prisma } from "@/lib/db";
import {
  getFieldLocationHistoryCutoff,
  isFieldLocationFresh,
} from "@/lib/field-location";
import { hasPermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { getAppRolesFromUser } from "@/lib/user-role-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET() {
  const authSession = await getCurrentSession();
  if (!authSession) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const roles = getAppRolesFromUser(authSession.user);
  if (!hasPermission(roles, "view_live_locations")) {
    return noStoreJson({ error: "Forbidden." }, { status: 403 });
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

  return noStoreJson({
    generatedAt: new Date().toISOString(),
    snapshots: sessions.map((session) => ({
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
    })),
  });
}
