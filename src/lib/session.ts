import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  OLD_MOCK_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./session-constants";

export {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  OLD_MOCK_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./session-constants";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
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

  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  cookieStore.delete(OLD_MOCK_COOKIE_NAME);
}

export async function setForcePasswordChangeCookie() {
  const cookieStore = await cookies();

  cookieStore.set(FORCE_PASSWORD_CHANGE_COOKIE_NAME, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
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
    include: {
      user: true,
    },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
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

  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(FORCE_PASSWORD_CHANGE_COOKIE_NAME);
  cookieStore.delete(OLD_MOCK_COOKIE_NAME);
}

export async function deleteUserSessions(userId: string) {
  await prisma.authSession.deleteMany({
    where: {
      userId,
    },
  });
}
