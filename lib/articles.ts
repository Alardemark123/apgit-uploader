import {
  deleteFile,
  downloadJson,
  listFiles,
  publicUrl,
  uploadBuffer,
  uploadJson,
} from "@/lib/gcs";
import { sanitizeSlug } from "@/lib/slug";
import { estimateReadTime } from "@/lib/read-time";
import { polishScrapedMarkdown, toHealthPrescriptionBody } from "@/lib/scrape";
import {
  normalizeArticle,
  normalizeArticlesIndex,
  toSummary,
  paragraphsToContentSections,
  isHealthPrescriptionSite,
  type Article,
  type ArticleSummary,
  type ArticlesIndex,
} from "@/lib/article-types";

const ARTICLES_FOLDER = "articles";

export function articlesIndexPath(siteId: string): string {
  return `${siteId}/${ARTICLES_FOLDER}/_index.json`;
}

export function deletedSlugsPath(siteId: string): string {
  return `${siteId}/${ARTICLES_FOLDER}/_deleted-slugs.json`;
}

export function articleObjectPath(siteId: string, articleId: string): string {
  return `${siteId}/${ARTICLES_FOLDER}/${articleId}/article.json`;
}

export function articleMediaPrefix(siteId: string, articleId: string): string {
  return `${siteId}/${ARTICLES_FOLDER}/${articleId}/`;
}

/** Build a slug-safe id from a title; never throws empty. */
export function articleIdFromTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return `article-${Date.now()}`;
  }

  try {
    return sanitizeSlug(trimmed);
  } catch {
    // ignore
  }

  const ascii = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return ascii || `article-${Date.now()}`;
}

export async function listArticles(siteId: string): Promise<ArticleSummary[]> {
  const index = await downloadJson<ArticlesIndex>(articlesIndexPath(siteId));
  let summaries = normalizeArticlesIndex(index);

  // Index can drift (empty CDN-stale writes, partial deletes). Rebuild from folders.
  if (summaries.length === 0) {
    const discovered = await discoverArticlesFromStorage(siteId);
    if (discovered.length > 0) {
      await writeIndex(siteId, discovered);
      summaries = discovered;
    }
  }

  return summaries.sort((a, b) => {
    const ta = a.updatedAt ?? a.date ?? "";
    const tb = b.updatedAt ?? b.date ?? "";
    return tb.localeCompare(ta);
  });
}

/** Scan site/articles/.../article.json and rebuild summaries. */
export async function discoverArticlesFromStorage(
  siteId: string
): Promise<ArticleSummary[]> {
  const prefix = `${siteId}/${ARTICLES_FOLDER}/`;
  const files = await listFiles(prefix);
  const articlePaths = files
    .map((f) => f.path)
    .filter((p) => /\/article\.json$/i.test(p));

  const summaries: ArticleSummary[] = [];
  for (const objectPath of articlePaths) {
    const raw = await downloadJson<unknown>(objectPath);
    const article = normalizeArticle(raw);
    if (article) summaries.push(toSummary(article));
  }
  return summaries;
}

/** Force rewrite articles/_index.json from on-disk article folders. */
export async function rebuildArticlesIndex(
  siteId: string
): Promise<ArticleSummary[]> {
  const discovered = await discoverArticlesFromStorage(siteId);
  await writeIndex(siteId, discovered);
  return discovered;
}

export async function getArticle(
  siteId: string,
  articleId: string
): Promise<Article | null> {
  const raw = await downloadJson<unknown>(articleObjectPath(siteId, articleId));
  return normalizeArticle(raw);
}

async function writeIndex(
  siteId: string,
  articles: ArticleSummary[]
): Promise<void> {
  const payload: ArticlesIndex = { articles };
  await uploadJson(articlesIndexPath(siteId), payload);
}

async function readDeletedSlugs(siteId: string): Promise<string[]> {
  const raw = await downloadJson<{ slugs?: string[] }>(deletedSlugsPath(siteId));
  if (!raw || !Array.isArray(raw.slugs)) return [];
  return raw.slugs.map((s) => String(s).trim()).filter(Boolean);
}

async function writeDeletedSlugs(
  siteId: string,
  slugs: string[]
): Promise<void> {
  const unique = Array.from(new Set(slugs.map((s) => s.trim()).filter(Boolean)));
  await uploadJson(deletedSlugsPath(siteId), { slugs: unique });
}

async function addDeletedSlug(siteId: string, slug: string): Promise<void> {
  const trimmed = slug.trim();
  if (!trimmed) return;
  const existing = await readDeletedSlugs(siteId);
  if (existing.includes(trimmed)) return;
  await writeDeletedSlugs(siteId, [...existing, trimmed]);
}

async function removeDeletedSlug(siteId: string, slug: string): Promise<void> {
  const trimmed = slug.trim();
  if (!trimmed) return;
  const existing = await readDeletedSlugs(siteId);
  await writeDeletedSlugs(
    siteId,
    existing.filter((s) => s !== trimmed)
  );
}

export async function saveArticle(
  siteId: string,
  input: Article
): Promise<Article> {
  const id = input.id?.trim() || articleIdFromTitle(input.title);
  const slug = input.slug?.trim() || id;
  const title = input.title?.trim() || input.description?.trim() || "";

  if (!title) {
    throw new Error("Title is required");
  }

  const now = new Date().toISOString();
  const isHp = isHealthPrescriptionSite(siteId);
  const pageUrl = input.link?.trim() || undefined;
  const hpCleaned = isHp
    ? toHealthPrescriptionBody(input.content ?? "", { title, pageUrl })
    : null;
  const cleanedContent = isHp
    ? hpCleaned?.body || (input.content ?? "").trim()
    : polishScrapedMarkdown(input.content ?? "", { title, pageUrl });

  const images = Array.from(
    new Set(
      (Array.isArray(input.images) ? input.images : [])
        .map((u) => u.trim())
        .filter(Boolean)
    )
  );
  const videos = Array.from(
    new Set(
      (Array.isArray(input.videos) ? input.videos : [])
        .map((u) => u.trim())
        .filter(Boolean)
    )
  );
  const lead = (input.lead ?? input.excerpt ?? "").trim();
  const month = (input.month ?? "").trim();
  const description = (input.description ?? title).trim();
  const contentSections = isHp
    ? paragraphsToContentSections(cleanedContent, images)
    : input.contentSections;

  const article: Article = {
    ...input,
    id,
    slug,
    title,
    excerpt: (input.excerpt ?? lead).trim(),
    content: cleanedContent,
    author: input.author?.trim() ?? "",
    date:
      input.date?.trim() ||
      month ||
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    readTime: input.readTime?.trim() || estimateReadTime(cleanedContent),
    category: input.category?.trim() ?? "",
    tags: Array.isArray(input.tags)
      ? input.tags
          .map((t) => t.trim())
          .filter(Boolean)
          .filter((t) => !/explore more|related|read more|share/i.test(t))
      : [],
    image: input.image?.trim() ?? "",
    images,
    video: input.video?.trim() ?? "",
    videos,
    link: (isHp ? hpCleaned?.sourceUrl : undefined) || input.link?.trim() || "",
    featured: Boolean(input.featured),
    updatedAt: now,
    activities: isHp
      ? (input.activities?.trim() || "Health Prescription")
      : (input.activities?.trim() ?? ""),
    description,
    month,
    location: (input.location ?? "").trim(),
    lead,
    titleParts: Array.isArray(input.titleParts) ? input.titleParts : [],
    contentSections: contentSections ?? [],
  };

  await uploadJson(articleObjectPath(siteId, id), article);

  // Rebuild from storage so index never stays empty when article.json exists.
  const discovered = await discoverArticlesFromStorage(siteId);
  const summary = toSummary(article);
  const withoutCurrent = discovered.filter((a) => a.id !== id);
  await writeIndex(siteId, [summary, ...withoutCurrent]);
  await removeDeletedSlug(siteId, slug);

  return article;
}

export async function deleteArticle(
  siteId: string,
  articleId: string
): Promise<void> {
  const existingArticle = await getArticle(siteId, articleId);
  const slug =
    existingArticle?.slug?.trim() ||
    existingArticle?.id?.trim() ||
    articleId;

  const prefix = articleMediaPrefix(siteId, articleId);
  const files = await listFiles(prefix);
  for (const file of files) {
    await deleteFile(file.path);
  }
  // Also remove article.json if list missed it
  await deleteFile(articleObjectPath(siteId, articleId));

  const existing = await listArticles(siteId);
  await writeIndex(
    siteId,
    existing.filter((a) => a.id !== articleId)
  );
  await addDeletedSlug(siteId, slug);
}

/**
 * Download a remote image and store under the article folder in GCS.
 * Returns public URL, or null if download fails.
 */
export async function importRemoteImage(
  siteId: string,
  articleId: string,
  imageUrl: string,
  filename = "cover"
): Promise<{ path: string; url: string } | null> {
  const url = imageUrl.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;

  // Already on our public base / GCS — keep as-is
  const ourHint = process.env.PUBLIC_ASSET_BASE_URL?.trim() || "";
  const bucket = process.env.GCS_BUCKET?.trim() || "";
  if (
    (ourHint && url.startsWith(ourHint.replace(/\/+$/, ""))) ||
    (bucket && url.includes(`storage.googleapis.com/${bucket}/`))
  ) {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; APGIT-ArticleUploader/1.0; +https://localhost)",
        Accept: "image/*,*/*",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;

    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";
    if (!contentType.startsWith("image/")) return null;

    const extFromType = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const urlPath = new URL(url).pathname;
    const urlExt = urlPath.split(".").pop()?.toLowerCase();
    const ext =
      urlExt && /^[a-z0-9]{2,5}$/.test(urlExt) ? urlExt : extFromType;

    const safeName = `${sanitizeSlug(filename)}.${ext}`;
    const objectPath = `${articleMediaPrefix(siteId, articleId)}${safeName}`;
    const buffer = Buffer.from(await res.arrayBuffer());
    return uploadBuffer(objectPath, buffer, contentType);
  } catch {
    return null;
  }
}

export function articlePublicUrl(objectPath: string): string {
  return publicUrl(objectPath);
}
