import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { findSite, loadSitesConfig } from "@/lib/config";
import { deleteArticle, getArticle } from "@/lib/articles";
import { sanitizeSlug } from "@/lib/slug";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const siteRaw = request.nextUrl.searchParams.get("site")?.trim() ?? "";
  if (!siteRaw) {
    return NextResponse.json({ error: "site is required" }, { status: 400 });
  }

  let siteId: string;
  let articleId: string;
  try {
    const { id } = await context.params;
    siteId = sanitizeSlug(siteRaw);
    articleId = sanitizeSlug(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid id";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const config = await loadSitesConfig();
    if (!findSite(config, siteId)) {
      return NextResponse.json({ error: `Unknown site: ${siteId}` }, { status: 400 });
    }
    const article = await getArticle(siteId, articleId);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }
    return NextResponse.json({ article });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load article";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const siteRaw = request.nextUrl.searchParams.get("site")?.trim() ?? "";
  if (!siteRaw) {
    return NextResponse.json({ error: "site is required" }, { status: 400 });
  }

  let siteId: string;
  let articleId: string;
  try {
    const { id } = await context.params;
    siteId = sanitizeSlug(siteRaw);
    articleId = sanitizeSlug(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid id";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const config = await loadSitesConfig();
    if (!findSite(config, siteId)) {
      return NextResponse.json({ error: `Unknown site: ${siteId}` }, { status: 400 });
    }
    await deleteArticle(siteId, articleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete article";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
