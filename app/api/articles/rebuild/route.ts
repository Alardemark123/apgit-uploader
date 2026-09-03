import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { findSite, loadSitesConfig } from "@/lib/config";
import { rebuildArticlesIndex } from "@/lib/articles";
import { sanitizeSlug } from "@/lib/slug";

/** POST { site } — rebuild `_index.json` from existing article folders. */
export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const siteRaw =
    body && typeof body === "object"
      ? String((body as { site?: unknown }).site ?? "").trim()
      : "";

  if (!siteRaw) {
    return NextResponse.json({ error: "site is required" }, { status: 400 });
  }

  let siteId: string;
  try {
    siteId = sanitizeSlug(siteRaw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid site";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const config = await loadSitesConfig();
    if (!findSite(config, siteId)) {
      return NextResponse.json({ error: `Unknown site: ${siteId}` }, { status: 400 });
    }
    const articles = await rebuildArticlesIndex(siteId);
    return NextResponse.json({
      ok: true,
      count: articles.length,
      articles,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to rebuild index";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
