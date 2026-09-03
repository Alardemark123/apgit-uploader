import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addFolder, findSite, loadSitesConfig } from "@/lib/config";
import {
  listArticles,
  saveArticle,
  importRemoteImage,
  articleIdFromTitle,
} from "@/lib/articles";
import { emptyArticle, normalizeArticle, type Article } from "@/lib/article-types";
import { sanitizeSlug } from "@/lib/slug";

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const siteRaw = request.nextUrl.searchParams.get("site")?.trim() ?? "";
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
    const articles = await listArticles(siteId);
    return NextResponse.json({ articles });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list articles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const siteRaw = String(raw.site ?? "").trim();
  const importCover = Boolean(raw.importCover);
  const articleRaw = raw.article;

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
    // Ensure articles folder exists so signed image uploads succeed.
    const site = findSite(config, siteId);
    if (site && !site.folders.includes("articles")) {
      await addFolder(siteId, "articles");
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to validate site";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const base = emptyArticle();
  const merged =
    articleRaw && typeof articleRaw === "object"
      ? { ...base, ...(articleRaw as Partial<Article>) }
      : base;

  if (!merged.id?.trim() && (merged.title?.trim() || merged.description?.trim())) {
    merged.id = articleIdFromTitle(merged.title || merged.description || "");
  }
  if (!merged.title?.trim() && merged.description?.trim()) {
    merged.title = merged.description.trim();
  }
  if (!merged.slug?.trim()) {
    merged.slug = merged.id;
  }

  const normalized = normalizeArticle(merged);
  if (!normalized) {
    return NextResponse.json(
      { error: "Article needs at least id and title" },
      { status: 400 }
    );
  }

  try {
    let article = normalized;

    if (importCover && article.image) {
      const imported = await importRemoteImage(
        siteId,
        article.id,
        article.image,
        "cover"
      );
      if (imported) {
        article = { ...article, image: imported.url };
      }
    }

    const saved = await saveArticle(siteId, article);
    return NextResponse.json({ article: saved });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save article";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
