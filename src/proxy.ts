import { NextResponse, type NextRequest } from "next/server";
import {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/session-constants";

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

  return NextResponse.next();
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
