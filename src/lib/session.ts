import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "./db";
import {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  LEGACY_USER_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_RENEWAL_WINDOW_SECONDS,
  SESSION_COOKIE_NAME,
} from "./session-constants";

export {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  LEGACY_USER_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_RENEWAL_WINDOW_SECONDS,
  SESSION_COOKIE_NAME,
} from "./session-constants";

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function requestUsesHttps() {
  const headerStore = await headers();
  const forwardedProtocol = headerStore
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProtocol) {
    return forwardedProtocol === "https";
  }

  const requestUrl =
    headerStore.get("origin") ?? headerStore.get("referer") ?? "";

  if (requestUrl) {
    try {
      return new URL(requestUrl).protocol === "https:";
    } catch {
      // Fall back to the deployment environment when the header is malformed.
    }
  }

  return process.env.NODE_ENV === "production";
}

export async function createAuthSession(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  const secure = await requestUsesHttps();

  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });

  cookieStore.delete(LEGACY_USER_COOKIE_NAME);
}

export async function setForcePasswordChangeCookie() {
  const cookieStore = await cookies();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const secure = await requestUsesHttps();

  cookieStore.set(FORCE_PASSWORD_CHANGE_COOKIE_NAME, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
}

export async function clearForcePasswordChangeCookie() {
  (await cookies()).delete(FORCE_PASSWORD_CHANGE_COOKIE_NAME);
}

export async function getCurrentSession() {
  const rawToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: {
      tokenHash: hashSessionToken(rawToken),
    },
    include: { user: { include: { roleAssignments: true } } },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE"
  ) {
    if (session) {
      await prisma.authSession
        .deleteMany({ where: { id: session.id } })
        .catch(() => undefined);
    }
    return null;
  }

  const renewalCutoff = new Date(
    Date.now() + SESSION_RENEWAL_WINDOW_SECONDS * 1000,
  );

  if (session.expiresAt <= renewalCutoff) {
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt },
    });

    return { ...session, expiresAt };
  }

  return session;
}

export async function deleteCurrentAuthSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    await prisma.authSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(rawToken),
      },
    });
  }

  await clearCurrentAuthCookies();
}

export async function clearCurrentAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(FORCE_PASSWORD_CHANGE_COOKIE_NAME);
  cookieStore.delete(LEGACY_USER_COOKIE_NAME);
}

export async function deleteUserSessions(userId: string) {
  await prisma.authSession.deleteMany({
    where: {
      userId,
    },
  });
}
