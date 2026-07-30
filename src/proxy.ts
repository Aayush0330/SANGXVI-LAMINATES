import { NextResponse, type NextRequest } from "next/server";
import {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "@/lib/session-constants";

function requestUsesHttps(request: NextRequest) {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  return forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
}

function refreshPersistentCookies(request: NextRequest) {
  const response = NextResponse.next();
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  if (sessionCookie) {
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie.value, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(request),
      expires,
      maxAge: SESSION_MAX_AGE_SECONDS,
      priority: "high",
    });
  }

  const forcePasswordChangeCookie = request.cookies.get(
    FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  );

  if (forcePasswordChangeCookie) {
    response.cookies.set(
      FORCE_PASSWORD_CHANGE_COOKIE_NAME,
      forcePasswordChangeCookie.value,
      {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: requestUsesHttps(request),
        expires,
        maxAge: SESSION_MAX_AGE_SECONDS,
        priority: "high",
      },
    );
  }

  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedPath =
    pathname === "/internal" ||
    pathname.startsWith("/internal/") ||
    pathname === "/dealer" ||
    pathname.startsWith("/dealer/") ||
    pathname === "/field" ||
    pathname.startsWith("/field/") ||
    pathname === "/account" ||
    pathname.startsWith("/account/");

  // Extra safety: public routes must never enter the authentication redirect.
  // Server Actions perform their own authorization and must keep Next.js's
  // special POST response format intact.
  if (!isProtectedPath || request.headers.has("next-action")) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "session-required");
    loginUrl.searchParams.set("next", pathname);

    return NextResponse.redirect(loginUrl);
  }

  if (
    request.cookies.has(FORCE_PASSWORD_CHANGE_COOKIE_NAME) &&
    pathname !== "/account/change-password"
  ) {
    const changePasswordUrl = new URL("/account/change-password", request.url);
    changePasswordUrl.searchParams.set("reason", "required");

    return NextResponse.redirect(changePasswordUrl);
  }

  return refreshPersistentCookies(request);
}

export const config = {
  matcher: [
    {
      source: "/internal/:path*",
      missing: [{ type: "header", key: "next-action" }],
    },
    {
      source: "/dealer/:path*",
      missing: [{ type: "header", key: "next-action" }],
    },
    {
      source: "/field/:path*",
      missing: [{ type: "header", key: "next-action" }],
    },
    {
      source: "/account/:path*",
      missing: [{ type: "header", key: "next-action" }],
    },
  ],
};
