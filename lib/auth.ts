import { createHash, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "uploader_session";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function hasConfiguredPassword(): boolean {
  return Boolean(process.env.UPLOADER_PASSWORD?.trim());
}

function getPassword(): string {
  const password = process.env.UPLOADER_PASSWORD;
  if (!password) {
    throw new Error("UPLOADER_PASSWORD is not configured");
  }
  return password;
}

/** Deterministic session token derived from the configured password. */
export function sessionToken(): string {
  return createHash("sha256")
    .update(`apgit-uploader:${getPassword()}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyPassword(password: string): boolean {
  try {
    return safeEqual(password, getPassword());
  } catch {
    return false;
  }
}

export function verifySession(request: NextRequest): boolean {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return false;

  try {
    return safeEqual(cookie, sessionToken());
  } catch {
    return false;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export function createSessionResponse(
  body: unknown = { ok: true },
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(body, init);
  response.cookies.set(SESSION_COOKIE, sessionToken(), cookieOptions());
  return response;
}

export function clearSessionResponse(
  body: unknown = { ok: true },
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json(body, init);
  response.cookies.set(SESSION_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
  return response;
}

/** Returns a 401 NextResponse if unauthenticated; otherwise null. */
export function requireAuth(request: NextRequest): NextResponse | null {
  if (verifySession(request)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
