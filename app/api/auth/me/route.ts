import { type NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authenticated = verifySession(request);
  return NextResponse.json({ ok: authenticated, authenticated });
}
