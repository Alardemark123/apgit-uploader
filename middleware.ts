import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Must match SESSION_COOKIE in lib/auth.ts (Edge middleware cannot import Node crypto). */
const SESSION_COOKIE = "uploader_session";

/**
 * Presence check for `uploader_session`.
 * Cookie creation/validation lives in lib/auth.ts + /api/auth/*.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
