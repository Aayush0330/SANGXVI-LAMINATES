import { NextResponse, type NextRequest } from "next/server";
import {
  FORCE_PASSWORD_CHANGE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/session-constants";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    "/internal/:path*",
    "/dealer/:path*",
    "/field/:path*",
    "/account/:path*",
  ],
};
