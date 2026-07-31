import { hasPermission } from "@/lib/permissions";
import {
  getFieldLocationLimits,
  validateFieldLocationSample,
  type FieldLocationSample,
} from "@/lib/field-location";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { getCurrentSession } from "@/lib/session";
import { getAppRolesFromUser } from "@/lib/user-role-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LocationRequestBody = {
  action?: unknown;
  sessionId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  accuracyMeters?: unknown;
  heading?: unknown;
  speedMps?: unknown;
  capturedAt?: unknown;
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function requestIsSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestUrl = new URL(request.url);
    return new URL(origin).host === requestUrl.host;
  } catch {
    return false;
  }
}

async function getAuthorizedFieldUser() {
  const session = await getCurrentSession();
  if (!session) return null;

  const roles = getAppRolesFromUser(session.user);
  if (!hasPermission(roles, "share_live_location")) return null;

  return {
    session,
    roles,
    auditUser: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: roles.join(","),
    },
  };
}

function optionalFiniteNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseLocationSample(
  body: LocationRequestBody,
): FieldLocationSample | null {
  if (typeof body.capturedAt !== "string") return null;

  return {
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    accuracyMeters: Number(body.accuracyMeters),
    heading: optionalFiniteNumber(body.heading),
    speedMps: optionalFiniteNumber(body.speedMps),
    capturedAt: new Date(body.capturedAt),
  };
}

export async function GET() {
  const authorized = await getAuthorizedFieldUser();
  if (!authorized) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const activeSession = await prisma.fieldLocationSession.findFirst({
    where: {
      userId: authorized.session.user.id,
      status: "ACTIVE",
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  return noStoreJson({
    activeSession: activeSession
      ? {
          id: activeSession.id,
          startedAt: activeSession.startedAt.toISOString(),
          lastLatitude: activeSession.lastLatitude,
          lastLongitude: activeSession.lastLongitude,
          lastAccuracyMeters: activeSession.lastAccuracyMeters,
          lastRecordedAt: activeSession.lastRecordedAt?.toISOString() ?? null,
        }
      : null,
    limits: getFieldLocationLimits(),
  });
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  }

  const authorized = await getAuthorizedFieldUser();
  if (!authorized) {
    return noStoreJson({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | LocationRequestBody
    | null;

  if (!body || typeof body.action !== "string") {
    return noStoreJson({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = authorized.session.user.id;

  if (body.action === "start") {
    const limits = getFieldLocationLimits();
    const retentionCutoff = new Date(
      Date.now() - limits.retentionDays * 24 * 60 * 60_000,
    );
    await prisma.fieldLocationSession.deleteMany({
      where: {
        status: "STOPPED",
        endedAt: { lt: retentionCutoff },
      },
    });

    const existing = await prisma.fieldLocationSession.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });

    const locationSession =
      existing ??
      (await prisma.fieldLocationSession.create({
        data: { userId },
      }));

    if (!existing) {
      await createSecurityAuditLog({
        eventType: "FIELD_LOCATION_STARTED",
        user: authorized.auditUser,
        path: "/field/location",
        description:
          "Field user explicitly started browser-based live location sharing.",
      });
    }

    return noStoreJson({
      ok: true,
      activeSession: {
        id: locationSession.id,
        startedAt: locationSession.startedAt.toISOString(),
      },
    });
  }

  if (body.action === "stop") {
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId : undefined;
    const result = await prisma.fieldLocationSession.updateMany({
      where: {
        userId,
        status: "ACTIVE",
        ...(sessionId ? { id: sessionId } : {}),
      },
      data: {
        status: "STOPPED",
        endedAt: new Date(),
      },
    });

    if (result.count > 0) {
      await createSecurityAuditLog({
        eventType: "FIELD_LOCATION_STOPPED",
        user: authorized.auditUser,
        path: "/field/location",
        description: "Field user stopped live location sharing.",
      });
    }

    return noStoreJson({ ok: true, stopped: result.count });
  }

  if (body.action === "point") {
    if (typeof body.sessionId !== "string") {
      return noStoreJson({ error: "Location session is required." }, { status: 400 });
    }

    const sample = parseLocationSample(body);
    if (!sample) {
      return noStoreJson({ error: "Invalid location sample." }, { status: 400 });
    }

    const validationError = validateFieldLocationSample(sample);
    if (validationError) {
      return noStoreJson({ error: validationError }, { status: 422 });
    }

    const locationSession = await prisma.fieldLocationSession.findFirst({
      where: {
        id: body.sessionId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!locationSession) {
      return noStoreJson(
        { error: "Active location session was not found." },
        { status: 404 },
      );
    }

    const limits = getFieldLocationLimits();
    if (
      locationSession.lastRecordedAt &&
      Date.now() - locationSession.lastRecordedAt.getTime() <
        limits.minimumIntervalMs
    ) {
      return noStoreJson({
        ok: true,
        accepted: false,
        reason: "rate-limited",
        nextAllowedAt: new Date(
          locationSession.lastRecordedAt.getTime() + limits.minimumIntervalMs,
        ).toISOString(),
      });
    }

    await prisma.$transaction([
      prisma.fieldLocationPoint.create({
        data: {
          sessionId: locationSession.id,
          latitude: sample.latitude,
          longitude: sample.longitude,
          accuracyMeters: sample.accuracyMeters,
          heading: sample.heading,
          speedMps: sample.speedMps,
          capturedAt: sample.capturedAt,
        },
      }),
      prisma.fieldLocationSession.update({
        where: { id: locationSession.id },
        data: {
          lastLatitude: sample.latitude,
          lastLongitude: sample.longitude,
          lastAccuracyMeters: sample.accuracyMeters,
          lastHeading: sample.heading,
          lastSpeedMps: sample.speedMps,
          lastRecordedAt: sample.capturedAt,
        },
      }),
    ]);

    return noStoreJson({
      ok: true,
      accepted: true,
      recordedAt: sample.capturedAt.toISOString(),
    });
  }

  return noStoreJson({ error: "Unsupported action." }, { status: 400 });
}
