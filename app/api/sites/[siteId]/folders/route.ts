import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addFolder } from "@/lib/config";

type RouteContext = {
  params: { siteId: string };
};

export async function POST(request: NextRequest, context: RouteContext) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const siteId = context.params.siteId;

  let body: { folder?: string };
  try {
    body = (await request.json()) as { folder?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const folder = body.folder?.trim();
  if (!folder) {
    return NextResponse.json({ error: "folder is required" }, { status: 400 });
  }

  try {
    const config = await addFolder(siteId, folder);
    return NextResponse.json(config, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add folder";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
