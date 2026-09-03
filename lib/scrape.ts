import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { ScrapeResult } from "@/lib/article-types";

const MAX_HTML_BYTES = 2_500_000;

type CheerioRoot = ReturnType<typeof cheerio.load>;

function metaContent($: CheerioRoot, ...selectors: string[]): string {
  for (const sel of selectors) {
    const val = $(sel).attr("content")?.trim();
    if (val) return val;
  }
  return "";
}

function firstText($: CheerioRoot, selectors: string[]): string {
  for (const sel of selectors) {
    const text = $(sel).first().text().replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function absoluteUrl(base: string, href: string | undefined): string {
  if (!href?.trim()) return "";
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return "";
  }
}

function extractJsonLdAuthor($: CheerioRoot): string {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).html();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        const graph = obj["@graph"];
        const candidates = Array.isArray(graph) ? graph : [obj];
        for (const c of candidates) {
          if (!c || typeof c !== "object") continue;
          const item = c as Record<string, unknown>;
          const type = String(item["@type"] ?? "");
          if (!/Article|NewsArticle|BlogPosting/i.test(type)) continue;
          const author = item.author;
          if (typeof author === "string") return author.trim();
          if (author && typeof author === "object") {
            const name = (author as { name?: unknown }).name;
            if (typeof name === "string" && name.trim()) return name.trim();
          }
          if (Array.isArray(author) && author[0]) {
            const first = author[0];
            if (typeof first === "string") return first.trim();
            if (first && typeof first === "object") {
              const name = (first as { name?: unknown }).name;
              if (typeof name === "string" && name.trim()) return name.trim();
            }
          }
        }
      }
    } catch {
      // ignore bad JSON-LD
    }
  }
  return "";
}

function pickArticleRoot($: CheerioRoot) {
  // Prefer real article body — avoid full-page chrome (nav, related, share).
  const candidates = [
    ".prose",
    '[itemprop="articleBody"]',
    ".entry-content",
    ".post-content",
    ".article-content",
    ".article-body",
    ".td-post-content",
    "article .prose",
    "article",
    "main article",
    "main",
  ];

  for (const sel of candidates) {
    const el = $(sel).first();
    const text = el.text().replace(/\s+/g, " ").trim();
    if (el.length && text.length > 80) {
      return el;
    }
  }

  return $("body");
}

function cleanClone($: CheerioRoot, root: cheerio.Cheerio<any>): string {
  const clone = root.clone();
  clone
    .find(
      [
        "script",
        "style",
        "noscript",
        "iframe",
        "nav",
        "footer",
        "aside",
        "form",
        "button",
        "header",
        "[role='navigation']",
        "[role='dialog']",
        "[aria-modal='true']",
        ".sharedaddy",
        ".jp-relatedposts",
        ".related-posts",
        ".related-articles",
        ".ads",
        ".advertisement",
        ".social-share",
        ".share-buttons",
        ".breadcrumb",
        ".pagination",
        "svg",
      ].join(", ")
    )
    .remove();

  // Drop blocks whose text is mostly UI chrome
  clone.find("a, p, div, span, li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (
      /^(back to articles|read more|share|source|explore more|featured|author)$/i.test(
        text
      ) ||
      /^back to /i.test(text)
    ) {
      $(el).remove();
    }
  });

  return clone.html() ?? "";
}

function resolveNextImageUrl(src: string, pageUrl: string): string {
  // /_next/image?url=%2Fassets%2F... or url=https%3A%2F%2F...
  try {
    if (src.includes("/_next/image")) {
      const u = new URL(src, pageUrl);
      const inner = u.searchParams.get("url");
      if (inner) return absoluteUrl(pageUrl, decodeURIComponent(inner));
    }
  } catch {
    // ignore
  }
  return absoluteUrl(pageUrl, src);
}

function htmlToMarkdown(html: string, pageUrl: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  turndown.remove(["script", "style", "noscript", "button"] as ("script" | "style" | "noscript" | "button")[]);

  // Resolve Next.js image optimizer URLs → real asset URLs
  turndown.addRule("images", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const alt = (el.getAttribute("alt") || "").replace(/[[\]]/g, "");
      const rawSrc = el.getAttribute("src") || "";
      const src = resolveNextImageUrl(rawSrc, pageUrl);
      if (!src || src.includes("/_next/image")) return "";
      return alt ? `\n\n![${alt}](${src})\n\n` : `\n\n![](${src})\n\n`;
    },
  });

  // Skip empty / UI-only links
  turndown.addRule("skipUiLinks", {
    filter: (node) => {
      if (node.nodeName !== "A") return false;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return /^(back to articles|read more|share|explore more)$/i.test(text);
    },
    replacement: () => "",
  });

  const md = turndown.turndown(html || "");
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip chrome / duplicates left after HTML→markdown conversion. */
export function polishScrapedMarkdown(
  markdown: string,
  opts: { title?: string; pageUrl?: string } = {}
): string {
  let md = markdown.replace(/\r\n/g, "\n").trim();
  if (!md) return "";

  const titleNorm = opts.title ? normalizeLoose(opts.title) : "";

  // Fix mashed "[Source](url)Share"
  md = md.replace(/\]\((https?:\/\/[^)\s]+)\)Share/gi, "]($1)");

  // Drop Back to Articles / Read More / Share-only markdown links
  md = md.replace(
    /\[(?:Back to Articles|Read More|Read Article|Share|Explore More|Preview image)\]\([^)]+\)/gi,
    ""
  );

  // Drop orphaned link closers from list scrapes: ](/articles/...)[
  md = md.replace(/\]\(\/articles\/[^)]+\)\[?/gi, "");
  md = md.replace(/\]\((https?:\/\/[^)\s]+)\)\[/gi, "]($1)");

  // Drop Next.js optimizer image leftovers that weren't resolved
  md = md.replace(/!\[[^\]]*\]\(\/_next\/image[^)]*\)/gi, "");

  // Split source: line handling later — temporarily extract
  let sourceLine = "";
  md = md.replace(/(?:^|\n)source:\s*(https?:\/\/\S+)/i, (_, url) => {
    sourceLine = `source: ${url}`;
    return "\n";
  });

  const lines = md.split("\n");
  const out: string[] = [];
  const seenHeadings = new Set<string>();
  let sawTitleHeading = false;

  const chromeExact = new Set([
    "author",
    "share",
    "article",
    "explore more",
    "related articles",
    "featured",
    "tags",
    "source",
    "read more",
    "back to articles",
  ]);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    // Skip UI chrome lines
    const low = trimmed.toLowerCase();
    if (chromeExact.has(low)) continue;
    if (/^\d+\s*min read$/i.test(trimmed)) continue;
    if (/^•?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(trimmed) && trimmed.length < 40)
      continue;

    // Skip markdown links that are only navigation
    if (/^\[(Back to Articles|Read More|Share)\]/i.test(trimmed)) continue;

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1];
      const text = headingMatch[2].trim();
      const norm = normalizeLoose(text);

      if (
        norm === "related articles" ||
        norm === "explore more" ||
        norm === "tags" ||
        norm === "articles insights" ||
        norm === "latest in dialysis innovation" ||
        norm === "featured article"
      ) {
        // Drop listing / related chrome and everything after when it's a list page heading
        if (norm === "related articles" || norm === "explore more" || norm === "tags") {
          break;
        }
        continue;
      }

      if (titleNorm && norm === titleNorm) {
        if (sawTitleHeading) continue; // duplicate title
        sawTitleHeading = true;
        out.push(`# ${text}`);
        continue;
      }

      if (seenHeadings.has(norm)) continue;
      seenHeadings.add(norm);
      out.push(`${level} ${text}`);
      continue;
    }

    // Skip bare category-looking short lines right after title (often UI badges)
    if (
      out.length <= 2 &&
      trimmed.length < 40 &&
      !trimmed.includes(".") &&
      !/^https?:\/\//i.test(trimmed) &&
      !/^!\[/.test(trimmed) &&
      !/^source:/i.test(trimmed)
    ) {
      // keep if it looks like a real sentence later; skip common badge words
      if (
        /facilities|healthcare|dialysis|news|insights|breakthrough/i.test(trimmed) &&
        trimmed.split(" ").length <= 4
      ) {
        continue;
      }
    }

    // Skip related-card crumbs: markdown images of other articles after "Related"
    out.push(line);
  }

  md = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // If title never appeared as heading, prepend once
  if (opts.title && !sawTitleHeading) {
    md = `# ${opts.title}\n\n${md}`.trim();
  }

  // Prefer original page URL as source (cleaner than mashed markdown)
  if (opts.pageUrl) {
    sourceLine = `source: ${opts.pageUrl}`;
  }
  if (sourceLine && !/source:\s*https?:\/\//i.test(md)) {
    md = `${md}\n\n${sourceLine}`.trim();
  }

  return md;
}

/**
 * Convert scraped markdown into plain Health Prescription body paragraphs.
 * Strips headings markers, images, broken list-page links, and UI chrome.
 */
export function toHealthPrescriptionBody(
  markdown: string,
  opts: { title?: string; pageUrl?: string } = {}
): { body: string; sourceUrl: string } {
  let md = polishScrapedMarkdown(markdown, opts);
  let sourceUrl = opts.pageUrl?.trim() || "";

  md = md.replace(/(?:^|\n)source:\s*(https?:\/\/\S+)/gi, (_, url: string) => {
    if (!sourceUrl) sourceUrl = url;
    return "\n";
  });

  // Broken leftovers like "](/articles/foo)[" from list scrapes
  md = md.replace(/\]\([^)\s]+\)\[?/g, "");
  // Keep markdown images as blank (cover is separate); drop to alt text only
  md = md.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  // Keep headings / bold / italic for HP markdown body — do not strip

  const dropLine =
    /^(articles?\s*&?\s*insights?.*|latest in dialysis.*|featured article|read article|read more|healthcare facilities|explore more|related articles|back to articles|stay informed about.*|discover the latest.*|no cover|preview image|\[+)$/i;

  const lines = md.split("\n");
  const kept: string[] = [];
  for (const lineRaw of lines) {
    const line = lineRaw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (dropLine.test(trimmed)) continue;
    if (trimmed === "[" || trimmed === "]") continue;
    if (/^https?:\/\//i.test(trimmed) && trimmed.length < 120) continue;
    if (/articles?\s*&?\s*insights?\s*\|/i.test(trimmed)) continue;
    if (
      trimmed.split(" ").length <= 4 &&
      /facilities|insights|featured/i.test(trimmed) &&
      !trimmed.startsWith("#")
    ) {
      continue;
    }
    kept.push(line);
  }

  let body = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Listing-page scrape: too many short card titles → prefer longer blocks
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const looksLikeListing =
    blocks.filter((p) => p.length < 160 && !p.startsWith("#")).length >= 5 &&
    blocks.length >= 6;
  if (looksLikeListing) {
    body = blocks
      .filter((p) => p.length >= 120 || p.startsWith("#"))
      .slice(0, 6)
      .join("\n\n");
  }

  // Drop duplicate title-only heading/paragraph
  if (opts.title) {
    const titleNorm = normalizeLoose(opts.title);
    body = body
      .split(/\n\s*\n/)
      .filter((block) => {
        const plain = block.replace(/^#{1,6}\s+/, "").trim();
        return normalizeLoose(plain) !== titleNorm;
      })
      .join("\n\n")
      .trim();
  }

  return {
    body,
    sourceUrl,
  };
}

function formatDate(raw: string): string {
  if (!raw.trim()) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.trim();
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function extractTags($: CheerioRoot): string[] {
  const tags = new Set<string>();
  $('meta[property="article:tag"]').each((_, el) => {
    const v = $(el).attr("content")?.trim();
    if (v) tags.add(v);
  });
  $('a[rel="tag"]').each((_, el) => {
    const v = $(el).text().replace(/\s+/g, " ").trim();
    if (v && !/explore more|read more|share/i.test(v)) tags.add(v);
  });
  return Array.from(tags).slice(0, 12);
}

export async function scrapeArticle(url: string): Promise<ScrapeResult> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Invalid URL");
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Only http(s) URLs are supported");
  }

  const res = await fetch(parsed.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page (${res.status})`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_HTML_BYTES) {
    throw new Error("Page HTML is too large to scrape");
  }

  const html = buf.toString("utf8");
  const $ = cheerio.load(html);
  const finalUrl = res.url || parsed.toString();

  const title =
    metaContent($, 'meta[property="og:title"]', 'meta[name="twitter:title"]') ||
    firstText($, ["h1", "title"]) ||
    "";

  const excerpt =
    metaContent(
      $,
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]'
    ) || "";

  const image = absoluteUrl(
    finalUrl,
    metaContent(
      $,
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="og:image:url"]'
    ) || $("article img").first().attr("src")
  );

  // Don't keep Next.js optimizer URLs as cover
  const coverImage =
    image.includes("/_next/image")
      ? resolveNextImageUrl(image, finalUrl)
      : image;

  const author =
    metaContent(
      $,
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="byl"]'
    ) ||
    extractJsonLdAuthor($) ||
    firstText($, [".author", ".byline", '[rel="author"]', ".entry-author"]);

  const dateRaw =
    metaContent(
      $,
      'meta[property="article:published_time"]',
      'meta[name="publish-date"]',
      'meta[name="date"]',
      'meta[name="pubdate"]'
    ) ||
    $("time[datetime]").first().attr("datetime") ||
    $("time").first().text().trim() ||
    "";

  const root = pickArticleRoot($);
  const bodyHtml = cleanClone($, root);
  let content = htmlToMarkdown(bodyHtml, finalUrl);
  content = polishScrapedMarkdown(content, {
    title,
    pageUrl: finalUrl,
  });

  if (content.length > 80_000) {
    content = content.slice(0, 80_000) + "\n\n…";
  }

  return {
    title,
    excerpt,
    content,
    author: /^(author)?$/i.test(author) ? "" : author,
    date: formatDate(dateRaw),
    image: coverImage.includes("/_next/image") ? "" : coverImage,
    link: finalUrl,
    tags: extractTags($).filter(
      (t) => !/explore more|related|read more|share/i.test(t)
    ),
  };
}
