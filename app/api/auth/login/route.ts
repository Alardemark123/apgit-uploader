import { NextResponse, type NextRequest } from "next/server";
import {
  clearSessionResponse,
  createSessionResponse,
  verifyPassword,
  verifySession,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  return createSessionResponse({ ok: true, authenticated: true });
}

export async function GET(request: NextRequest) {
  // Convenience for probing — prefer /api/auth/me
  const authenticated = verifySession(request);
  return NextResponse.json({ ok: authenticated, authenticated });
}
