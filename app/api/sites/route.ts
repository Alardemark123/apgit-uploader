import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addSite, loadSitesConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const config = await loadSitesConfig();
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sites";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let body: { id?: string; label?: string };
  try {
    body = (await request.json()) as { id?: string; label?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim();
  const label = body.label?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const config = await addSite(id, label ?? id);
    return NextResponse.json(config, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add site";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
