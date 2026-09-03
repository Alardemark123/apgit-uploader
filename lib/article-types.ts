/** Matches prime_dialysis articles.js shape (+ gallery images & videos).
 *  Health Prescription also stores Latest News fields on the same JSON. */
export const HEALTH_PRESCRIPTION_SITE_ID = "health-prescription";

export type ContentSection =
  | { type: "paragraph"; text: string }
  | { type: "images"; columns?: number; images: string[] };

export type TitlePart = {
  text: string;
  emphasis: boolean;
};

export type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  readTime: string;
  category: string;
  tags: string[];
  image: string;
  images: string[];
  /** Primary / featured video URL (optional). */
  video: string;
  /** Additional video URLs (GCS or external). */
  videos: string[];
  link: string;
  featured: boolean;
  updatedAt?: string;
  /** Health Prescription Latest News fields */
  activities?: string;
  description?: string;
  month?: string;
  location?: string;
  lead?: string;
  titleParts?: TitlePart[];
  contentSections?: ContentSection[];
};

export type ArticleSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  author: string;
  date: string;
  category: string;
  image: string;
  featured: boolean;
  updatedAt?: string;
};

export type ArticlesIndex = {
  articles: ArticleSummary[];
};

export type ScrapeResult = {
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  image: string;
  link: string;
  tags: string[];
};

export function emptyArticle(partial?: Partial<Article>): Article {
  return {
    id: "",
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    author: "",
    date: "",
    readTime: "",
    category: "",
    tags: [],
    image: "",
    images: [],
    video: "",
    videos: [],
    link: "",
    featured: false,
    activities: "",
    description: "",
    month: "",
    location: "",
    lead: "",
    titleParts: [],
    contentSections: [],
    ...partial,
  };
}

export function toSummary(article: Article): ArticleSummary {
  return {
    id: article.id,
    title: article.title || article.description || article.id,
    slug: article.slug,
    excerpt: article.excerpt || article.lead || "",
    author: article.author,
    date: article.date || article.month || "",
    category: article.category || article.activities || "",
    image: article.image,
    featured: article.featured,
    updatedAt: article.updatedAt,
  };
}

export function isHealthPrescriptionSite(siteId: string): boolean {
  return siteId.trim() === HEALTH_PRESCRIPTION_SITE_ID;
}

export function paragraphsToContentSections(
  body: string,
  images: string[] = []
): ContentSection[] {
  const paragraphs = String(body ?? "")
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ type: "paragraph" as const, text }));

  const uniqueImages = Array.from(
    new Set(images.map((u) => String(u).trim()).filter(Boolean))
  );

  const sections: ContentSection[] = [...paragraphs];
  if (uniqueImages.length > 0) {
    sections.push({ type: "images", columns: 3, images: uniqueImages });
  }
  return sections;
}

export function contentSectionsToBody(sections?: ContentSection[]): string {
  if (!Array.isArray(sections)) return "";
  return sections
    .filter((s): s is Extract<ContentSection, { type: "paragraph" }> => s.type === "paragraph")
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeContentSections(raw: unknown): ContentSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (s.type === "paragraph") {
      const text = String(s.text ?? "").trim();
      if (text) out.push({ type: "paragraph", text });
      continue;
    }
    if (s.type === "images") {
      const images = Array.isArray(s.images)
        ? s.images.map((u) => String(u).trim()).filter(Boolean)
        : [];
      if (images.length === 0) continue;
      const columnsRaw = Number(s.columns);
      const columns = columnsRaw === 1 || columnsRaw === 2 || columnsRaw === 3 ? columnsRaw : 3;
      out.push({ type: "images", columns, images });
    }
  }
  return out;
}

function normalizeTitleParts(raw: unknown): TitlePart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const text = String(p.text ?? "").trim();
      if (!text) return null;
      return { text, emphasis: Boolean(p.emphasis) };
    })
    .filter((p): p is TitlePart => Boolean(p));
}

export function normalizeArticle(raw: unknown): Article | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const id = String(a.id ?? "").trim();
  const title = String(a.title ?? a.description ?? "").trim();
  if (!id || !title) return null;

  const tagsRaw = a.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const imagesRaw = a.images;
  const images = Array.isArray(imagesRaw)
    ? imagesRaw.map((u) => String(u).trim()).filter(Boolean)
    : [];

  const videosRaw = a.videos;
  const videos = Array.isArray(videosRaw)
    ? videosRaw.map((u) => String(u).trim()).filter(Boolean)
    : [];

  // Legacy: single `video` string, or first of videos
  const video =
    String(a.video ?? "").trim() || (videos[0] ?? "");

  const description = String(a.description ?? title).trim();
  const lead = String(a.lead ?? a.excerpt ?? "").trim();
  const month = String(a.month ?? "").trim();
  let contentSections = normalizeContentSections(a.contentSections);
  const content = String(a.content ?? "");
  if (contentSections.length === 0 && (content.trim() || images.length > 0)) {
    contentSections = paragraphsToContentSections(content, images);
  }

  return {
    id,
    title,
    slug: String(a.slug ?? id).trim() || id,
    excerpt: String(a.excerpt ?? lead).trim(),
    content,
    author: String(a.author ?? "").trim(),
    date: String(a.date ?? month).trim(),
    readTime: String(a.readTime ?? "").trim(),
    category: String(a.category ?? "").trim(),
    tags,
    image: String(a.image ?? "").trim(),
    images,
    video,
    videos,
    link: String(a.link ?? "").trim(),
    featured: Boolean(a.featured),
    updatedAt: a.updatedAt ? String(a.updatedAt) : undefined,
    activities: String(a.activities ?? "").trim(),
    description,
    month,
    location: String(a.location ?? "").trim(),
    lead,
    titleParts: normalizeTitleParts(a.titleParts),
    contentSections,
  };
}

export function normalizeArticlesIndex(raw: unknown): ArticleSummary[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as ArticlesIndex).articles;
  if (!Array.isArray(list)) return [];

  const out: ArticleSummary[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const id = String(a.id ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      title: String(a.title ?? id),
      slug: String(a.slug ?? id),
      excerpt: String(a.excerpt ?? ""),
      author: String(a.author ?? ""),
      date: String(a.date ?? ""),
      category: String(a.category ?? ""),
      image: String(a.image ?? ""),
      featured: Boolean(a.featured),
      ...(a.updatedAt ? { updatedAt: String(a.updatedAt) } : {}),
    });
  }
  return out;
}
