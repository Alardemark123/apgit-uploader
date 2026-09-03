"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import CopyButton from "./CopyButton";
import {
  emptyArticle,
  isHealthPrescriptionSite,
  paragraphsToContentSections,
  contentSectionsToBody,
  type Article,
  type ScrapeResult,
} from "@/lib/article-types";
import { estimateReadTime } from "@/lib/read-time";
import { toHealthPrescriptionBody } from "@/lib/scrape";
import {
  clearArticleDraft,
  readArticleDraft,
  writeArticleDraft,
} from "@/lib/uploader-persistence";

type Props = {
  site: string;
  disabled?: boolean;
  editing?: Article | null;
  onSaved?: () => void | Promise<void>;
  onCancelEdit?: () => void;
};

type SignedUpload = {
  name: string;
  contentType: string;
  path: string;
  url: string;
  uploadUrl: string;
};

const fieldClass =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-900/10 disabled:bg-stone-50 disabled:opacity-60";

const labelClass =
  "mb-1 block text-[11px] font-medium uppercase tracking-wide text-stone-400";

const pickClass =
  "flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400 hover:bg-stone-100";

function slugifyClient(title: string): string {
  const ascii = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `article-${Date.now()}`;
}

async function uploadFilesToGcs(opts: {
  site: string;
  folder: string;
  subfolder: string;
  files: File[];
}): Promise<{ name: string; path: string; url: string }[]> {
  const { site, folder, subfolder, files } = opts;
  if (files.length === 0) return [];

  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      site,
      folder,
      ...(subfolder ? { subfolder } : {}),
      files: files.map((file) => ({
        name: file.name,
        contentType: file.type || "application/octet-stream",
      })),
    }),
  });

  const signData = await signRes.json().catch(() => ({}));
  if (!signRes.ok) {
    throw new Error(
      (signData as { error?: string }).error ||
        `Failed to prepare upload (${signRes.status})`
    );
  }

  const uploads = (signData as { uploads?: SignedUpload[] }).uploads;
  if (!Array.isArray(uploads) || uploads.length !== files.length) {
    throw new Error("Invalid signed upload response");
  }

  const uploaded: { name: string; path: string; url: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const meta = uploads[i];
    const putRes = await fetch(meta.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Failed to upload "${file.name}" (${putRes.status})`);
    }
    uploaded.push({ name: meta.name, path: meta.path, url: meta.url });
  }
  return uploaded;
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

function formatFileSize(bytes?: number | null): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = decodeURIComponent(path.split("/").pop() || "");
    return name || "Image";
  } catch {
    const name = url.split("/").pop()?.split("?")[0];
    return name ? decodeURIComponent(name) : "Image";
  }
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function VideoIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function ImageIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function MediaFileRow({
  thumbUrl,
  name,
  sizeLabel,
  status = "Ready",
  mediaType = "image",
  disabled,
  onRemove,
}: {
  thumbUrl?: string | null;
  name: string;
  sizeLabel?: string | null;
  status?: string;
  mediaType?: "image" | "video";
  disabled?: boolean;
  onRemove?: () => void;
}) {
  const FallbackIcon = mediaType === "video" ? VideoIcon : ImageIcon;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-stone-200 bg-white px-2.5 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-stone-100 text-stone-400">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FallbackIcon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{name}</p>
        <p className="mt-0.5 truncate text-[11px]">
          <span className="font-medium text-emerald-600">{status}</span>
          {sizeLabel ? (
            <span className="text-stone-400"> · {sizeLabel}</span>
          ) : null}
        </p>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${name}`}
          className="shrink-0 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
        >
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}

export default function ArticleForm({
  site,
  disabled,
  editing,
  onSaved,
  onCancelEdit,
}: Props) {
  const [form, setForm] = useState<Article>(emptyArticle());
  const [tagsInput, setTagsInput] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [importCover, setImportCover] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const isEditing = Boolean(editing?.id);
  const isHp = isHealthPrescriptionSite(site);
  const coverPreview = useObjectUrl(coverFile);
  const galleryPreviews = useObjectUrls(galleryFiles);
  const videoPreviews = useObjectUrls(videoFiles);

  // Restore draft for this site when composing (not editing)
  useEffect(() => {
    if (editing?.id) {
      setDraftReady(true);
      return;
    }
    if (!site) {
      setDraftReady(true);
      return;
    }

    const draft = readArticleDraft(site);
    if (draft?.form) {
      setForm({ ...emptyArticle(), ...(draft.form as Partial<Article>) });
      setTagsInput(draft.tagsInput || "");
      setScrapeUrl(draft.scrapeUrl || "");
      setImportCover(draft.importCover !== false);
      setSlugTouched(Boolean(draft.slugTouched));
    } else {
      setForm(emptyArticle());
      setTagsInput("");
      setScrapeUrl("");
      setImportCover(true);
      setSlugTouched(false);
    }
    setCoverFile(null);
    setGalleryFiles([]);
    setVideoFiles([]);
    setDraftReady(true);
  }, [site, editing?.id]);

  useEffect(() => {
    if (editing) {
      const next = { ...editing };
      if (isHealthPrescriptionSite(site)) {
        next.title = editing.title || editing.description || "";
        next.description = editing.description || editing.title || "";
        next.content =
          editing.content || contentSectionsToBody(editing.contentSections);
        next.activities = editing.activities || "Health Prescription";
        next.lead = editing.lead || editing.excerpt || "";
        next.month = editing.month || "";
      }
      setForm(next);
      setTagsInput((editing.tags || []).join(", "));
      setSlugTouched(true);
      setScrapeUrl(editing.link || "");
      setCoverFile(null);
      setGalleryFiles([]);
      setVideoFiles([]);
      setMessage(null);
      setError(null);
    }
  }, [editing, site]);

  // Persist draft while composing
  useEffect(() => {
    if (!draftReady || !site || isEditing) return;

    const timer = window.setTimeout(() => {
      writeArticleDraft(site, {
        form: { ...form },
        tagsInput,
        scrapeUrl,
        importCover,
        slugTouched,
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    draftReady,
    site,
    isEditing,
    form,
    tagsInput,
    scrapeUrl,
    importCover,
    slugTouched,
  ]);

  const previewReadTime = useMemo(
    () => form.readTime || estimateReadTime(form.content),
    [form.readTime, form.content]
  );

  const galleryDisplay = useMemo(() => {
    const pending = galleryPreviews.map((url, i) => ({
      key: `pending-${i}`,
      url,
      pending: true as const,
      name: galleryFiles[i]?.name || `Image ${i + 1}`,
      sizeLabel: formatFileSize(galleryFiles[i]?.size),
      index: i,
    }));
    const saved = form.images.map((url) => ({
      key: url,
      url,
      pending: false as const,
      name: filenameFromUrl(url),
      sizeLabel: "Saved" as string | null,
      index: -1,
    }));
    return [...pending, ...saved];
  }, [galleryPreviews, galleryFiles, form.images]);

  const videoDisplay = useMemo(() => {
    const pending = videoPreviews.map((url, i) => ({
      key: `pending-v-${i}`,
      url,
      pending: true as const,
      name: videoFiles[i]?.name || `Video ${i + 1}`,
      sizeLabel: formatFileSize(videoFiles[i]?.size),
      index: i,
    }));
    const saved = form.videos.map((url, i) => ({
      key: url,
      url,
      pending: false as const,
      name: filenameFromUrl(url) || `Video ${i + 1}`,
      sizeLabel: "Saved" as string | null,
      index: -1,
    }));
    if (form.video && !form.videos.includes(form.video)) {
      saved.unshift({
        key: form.video,
        url: form.video,
        pending: false,
        name: filenameFromUrl(form.video) || "Primary video",
        sizeLabel: "Saved",
        index: -1,
      });
    }
    return [...pending, ...saved];
  }, [videoPreviews, videoFiles, form.videos, form.video]);

  function updateField<K extends keyof Article>(key: K, value: Article[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" && !slugTouched && !isEditing) {
        const id = slugifyClient(String(value));
        next.id = id;
        next.slug = id;
      }
      return next;
    });
  }

  function applyScrape(scraped: ScrapeResult) {
    const id = form.id || slugifyClient(scraped.title || "article");
    setForm((prev) => {
      const title = scraped.title || prev.title;
      const excerpt = scraped.excerpt || prev.excerpt;
      const content = scraped.content || prev.content;
      const next = {
        ...prev,
        id: prev.id || id,
        slug: prev.slug || id,
        title,
        excerpt,
        content,
        author: scraped.author || prev.author,
        date: scraped.date || prev.date,
        image: scraped.image || prev.image,
        link: scraped.link || prev.link,
        tags: scraped.tags.length ? scraped.tags : prev.tags,
        readTime: estimateReadTime(content),
      };

      if (isHealthPrescriptionSite(site)) {
        const cleaned = toHealthPrescriptionBody(content, {
          title,
          pageUrl: scraped.link || scrapeUrl.trim(),
        });
        next.description = title;
        next.lead = excerpt || prev.lead || "";
        next.content = cleaned.body || excerpt || prev.content;
        next.month = scraped.date || prev.month || "";
        next.activities = prev.activities || "Health Prescription";
        next.link =
          cleaned.sourceUrl || scraped.link || prev.link || scrapeUrl.trim();
        next.excerpt = next.lead;
        next.author = scraped.author || prev.author;
        next.category = prev.category || "";
        next.tags = scraped.tags.length ? scraped.tags : prev.tags;
        next.readTime = estimateReadTime(cleaned.body || excerpt || "");
      }

      return next;
    });
    if (scraped.tags.length) setTagsInput(scraped.tags.join(", "));
    if (scraped.link) setScrapeUrl(scraped.link);
    if (!slugTouched && !isEditing) setSlugTouched(false);
  }

  async function handleScrape() {
    setError(null);
    setMessage(null);
    if (!scrapeUrl.trim()) {
      setError("Paste an article URL to scrape.");
      return;
    }
    setScraping(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || `Scrape failed (${res.status})`
        );
      }
      const scraped = (data as { scraped?: ScrapeResult }).scraped;
      if (!scraped) throw new Error("Empty scrape response");
      applyScrape(scraped);
      setMessage("Fields filled — review before publishing.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed.");
    } finally {
      setScraping(false);
    }
  }

  function resetForm() {
    setForm(emptyArticle());
    setTagsInput("");
    setScrapeUrl("");
    setCoverFile(null);
    setGalleryFiles([]);
    setVideoFiles([]);
    setSlugTouched(false);
    setImportCover(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    if (site) clearArticleDraft(site);
    onCancelEdit?.();
  }

  function removeSavedImage(url: string) {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((u) => u !== url),
      image: prev.image === url ? "" : prev.image,
    }));
  }

  function removePendingGallery(index: number) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function removeCoverSelection() {
    setCoverFile(null);
  }

  function removeSavedVideo(url: string) {
    setForm((prev) => ({
      ...prev,
      videos: prev.videos.filter((u) => u !== url),
      video: prev.video === url ? prev.videos.find((u) => u !== url) || "" : prev.video,
    }));
  }

  function removePendingVideo(index: number) {
    setVideoFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setProgress(null);

    if (!site) {
      setError("Select a website first.");
      return;
    }
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    const id = form.id.trim() || slugifyClient(form.title);
    const slug = form.slug.trim() || id;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      let image = form.image.trim();
      let images = [...form.images];
      let video = form.video.trim();
      let videos = [...form.videos];

      if (coverFile || galleryFiles.length > 0) {
        setProgress("Uploading images…");
        if (coverFile) {
          const [cover] = await uploadFilesToGcs({
            site,
            folder: "articles",
            subfolder: id,
            files: [coverFile],
          });
          if (cover) image = cover.url;
        }
        if (galleryFiles.length > 0) {
          const gallery = await uploadFilesToGcs({
            site,
            folder: "articles",
            subfolder: `${id}/images`,
            files: galleryFiles,
          });
          images = [...images, ...gallery.map((g) => g.url)];
        }
      }

      if (videoFiles.length > 0) {
        setProgress(
          `Uploading video${videoFiles.length === 1 ? "" : "s"}…`
        );
        const uploadedVideos = await uploadFilesToGcs({
          site,
          folder: "articles",
          subfolder: `${id}/videos`,
          files: videoFiles,
        });
        const urls = uploadedVideos.map((v) => v.url);
        videos = [...videos, ...urls];
        if (!video && urls[0]) video = urls[0];
      }

      setProgress("Saving…");
      const lead = (form.lead || form.excerpt || "").trim();
      const description = form.title.trim();
      const imagesDeduped = Array.from(new Set(images.filter(Boolean)));
      const hpCleaned = isHp
        ? toHealthPrescriptionBody(form.content, {
            title: description,
            pageUrl: (form.link || "").trim(),
          })
        : null;
      const article: Article = isHp
        ? {
            ...form,
            id,
            slug,
            title: description,
            description,
            activities: (form.activities || "").trim() || "Health Prescription",
            month: (form.month || "").trim(),
            location: (form.location || "").trim(),
            lead,
            excerpt: lead,
            date: (form.month || "").trim(),
            image,
            images: imagesDeduped,
            video,
            videos: Array.from(new Set(videos.filter(Boolean))),
            content: hpCleaned?.body || form.content,
            contentSections: paragraphsToContentSections(
              hpCleaned?.body || form.content,
              imagesDeduped
            ),
            author: (form.author || "").trim(),
            category: (form.category || "").trim(),
            tags,
            featured: Boolean(form.featured),
            readTime:
              form.readTime.trim() ||
              estimateReadTime(hpCleaned?.body || form.content),
            link: hpCleaned?.sourceUrl || (form.link || "").trim(),
          }
        : {
            ...form,
            id,
            slug,
            tags,
            image,
            images: imagesDeduped,
            video,
            videos: Array.from(new Set(videos.filter(Boolean))),
            readTime: form.readTime.trim() || estimateReadTime(form.content),
          };

      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site,
          importCover: importCover && !coverFile,
          article,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || `Save failed (${res.status})`
        );
      }

      const saved = (data as { article?: Article }).article;
      setMessage(isEditing ? "Updated." : "Published.");
      if (saved) {
        setForm(saved);
        setTagsInput(saved.tags?.join(", ") || "");
        setSlugTouched(true);
      }
      if (!isEditing && site) {
        // Keep published values on screen, but start fresh draft after next reset.
        // Still persist current form so reload mid-review does not lose fields.
        writeArticleDraft(site, {
          form: { ...(saved || article) },
          tagsInput: saved?.tags?.join(", ") || tagsInput,
          scrapeUrl,
          importCover,
          slugTouched: true,
        });
      }
      setCoverFile(null);
      setGalleryFiles([]);
      setVideoFiles([]);
      await onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save article.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const blocked = disabled || loading || scraping || !site;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <div className="shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">
            {isEditing ? "Edit" : "Compose"}
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            {isEditing ? "Edit article" : "New article"}
          </h2>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="url"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder={
              isHp
                ? "Paste a single news article URL (not a listing page)…"
                : "Paste article URL to auto-fill…"
            }
            disabled={blocked}
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void handleScrape()}
            disabled={blocked || !scrapeUrl.trim()}
            className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {scraping ? "…" : "Scrape"}
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(isEditing || form.title) && (
            <button
              type="button"
              onClick={resetForm}
              disabled={loading || scraping}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              {isEditing ? "Cancel" : "Clear"}
            </button>
          )}
          <button
            type="submit"
            disabled={blocked || !form.title.trim()}
            className="rounded-lg bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {loading ? "Saving…" : isEditing ? "Update" : "Publish"}
          </button>
        </div>
      </div>

      {(error || message || progress) && (
        <div className="space-y-0.5">
          {progress && (
            <p className="text-xs text-stone-500" aria-live="polite">
              {progress}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-xs text-emerald-700" role="status">
              {message}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.85fr)]">
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
          <div>
            <label className={labelClass}>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              disabled={blocked}
              required
              placeholder={isHp ? "News headline" : "Article headline"}
              className={`${fieldClass} font-medium`}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>ID</label>
              <input
                type="text"
                value={form.id}
                onChange={(e) => {
                  setSlugTouched(true);
                  updateField("id", e.target.value);
                }}
                disabled={blocked || isEditing}
                className={`${fieldClass} font-mono text-xs`}
              />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  updateField("slug", e.target.value);
                }}
                disabled={blocked}
                className={`${fieldClass} font-mono text-xs`}
              />
            </div>
          </div>

          {isHp ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Activities</label>
                  <input
                    type="text"
                    value={form.activities || ""}
                    onChange={(e) => updateField("activities", e.target.value)}
                    disabled={blocked}
                    placeholder="Health Prescription"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Month</label>
                  <input
                    type="text"
                    value={form.month || ""}
                    onChange={(e) => updateField("month", e.target.value)}
                    disabled={blocked}
                    placeholder="May 2026"
                    className={fieldClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <input
                  type="text"
                  value={form.location || ""}
                  onChange={(e) => updateField("location", e.target.value)}
                  disabled={blocked}
                  placeholder="EDSA Shangri-La Hotel | May 27–29, 2026"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Lead</label>
                <textarea
                  value={form.lead || ""}
                  onChange={(e) => updateField("lead", e.target.value)}
                  disabled={blocked}
                  rows={3}
                  placeholder="Intro paragraph under the headline…"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Body</label>
                <textarea
                  value={form.content}
                  onChange={(e) => updateField("content", e.target.value)}
                  disabled={blocked}
                  rows={10}
                  placeholder="Markdown ok: # headings, **bold**. Separate paragraphs with a blank line."
                  className={`${fieldClass} min-h-[200px] font-mono text-[12px] leading-relaxed`}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Author</label>
                  <input
                    type="text"
                    value={form.author || ""}
                    onChange={(e) => updateField("author", e.target.value)}
                    disabled={blocked}
                    placeholder="Written by…"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <input
                    type="text"
                    value={form.category || ""}
                    onChange={(e) => updateField("category", e.target.value)}
                    disabled={blocked}
                    placeholder="Healthcare Facilities"
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Tags</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    disabled={blocked}
                    placeholder="Dialysis, Manila, Partnership"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Read time</label>
                  <input
                    type="text"
                    value={form.readTime || ""}
                    onChange={(e) => updateField("readTime", e.target.value)}
                    disabled={blocked}
                    placeholder={previewReadTime}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Source link</label>
                <input
                  type="url"
                  value={form.link || ""}
                  onChange={(e) => updateField("link", e.target.value)}
                  disabled={blocked}
                  placeholder="https://…"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-wrap gap-4 border-t border-stone-100 pt-2.5">
                <label className="flex items-center gap-1.5 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={Boolean(form.featured)}
                    onChange={(e) => updateField("featured", e.target.checked)}
                    disabled={blocked}
                    className="rounded border-stone-300"
                  />
                  Featured (show at top of Latest News)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={importCover}
                    onChange={(e) => setImportCover(e.target.checked)}
                    disabled={blocked}
                    className="rounded border-stone-300"
                  />
                  Copy remote cover to GCS
                </label>
              </div>
            </>
          ) : (
            <>
          <div>
            <label className={labelClass}>Excerpt</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => updateField("excerpt", e.target.value)}
              disabled={blocked}
              rows={2}
              placeholder="Short summary for cards…"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Content</label>
            <textarea
              value={form.content}
              onChange={(e) => updateField("content", e.target.value)}
              disabled={blocked}
              rows={10}
              placeholder="Markdown body…"
              className={`${fieldClass} min-h-[200px] font-mono text-[12px] leading-relaxed`}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass}>Author</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => updateField("author", e.target.value)}
                disabled={blocked}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="text"
                value={form.date}
                onChange={(e) => updateField("date", e.target.value)}
                placeholder="July 1, 2023"
                disabled={blocked}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
                placeholder="Healthcare Facilities"
                disabled={blocked}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Read time</label>
              <input
                type="text"
                value={form.readTime}
                onChange={(e) => updateField("readTime", e.target.value)}
                placeholder={previewReadTime}
                disabled={blocked}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Cavite, Free Dialysis"
                disabled={blocked}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Source link</label>
              <input
                type="url"
                value={form.link}
                onChange={(e) => updateField("link", e.target.value)}
                disabled={blocked}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-stone-100 pt-2.5">
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => updateField("featured", e.target.checked)}
                disabled={blocked}
                className="rounded border-stone-300"
              />
              Featured
            </label>
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={importCover}
                onChange={(e) => setImportCover(e.target.checked)}
                disabled={blocked}
                className="rounded border-stone-300"
              />
              Copy remote cover to GCS
            </label>
          </div>
            </>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              Cover
            </p>
            {coverFile && coverPreview ? (
              <MediaFileRow
                thumbUrl={coverPreview}
                name={coverFile.name}
                sizeLabel={formatFileSize(coverFile.size)}
                disabled={blocked}
                onRemove={removeCoverSelection}
              />
            ) : null}
            {!coverFile && form.image ? (
              <MediaFileRow
                thumbUrl={form.image}
                name={filenameFromUrl(form.image)}
                sizeLabel="Saved"
                disabled={blocked}
                onRemove={() => updateField("image", "")}
              />
            ) : null}
            {!coverFile && !form.image ? (
              <p className="rounded-lg bg-stone-50 px-2.5 py-3 text-center text-[11px] text-stone-400">
                No cover yet
              </p>
            ) : null}
            <input
              type="url"
              value={form.image}
              onChange={(e) => updateField("image", e.target.value)}
              placeholder="Cover image URL"
              disabled={blocked}
              className={fieldClass}
            />
            <label className={pickClass}>
              <input
                id="article-cover"
                type="file"
                accept="image/*"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setCoverFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
                disabled={blocked}
                className="hidden"
              />
              Choose cover image
            </label>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                Gallery
              </p>
              {galleryDisplay.length > 0 && (
                <span className="text-[11px] text-stone-400">
                  {galleryDisplay.length}
                </span>
              )}
            </div>
            {galleryDisplay.length > 0 ? (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {galleryDisplay.map((item) => (
                  <MediaFileRow
                    key={item.key}
                    thumbUrl={item.url}
                    name={item.name}
                    sizeLabel={item.sizeLabel}
                    disabled={blocked}
                    onRemove={() =>
                      item.pending
                        ? removePendingGallery(item.index)
                        : removeSavedImage(item.url)
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-stone-50 px-2.5 py-3 text-center text-[11px] text-stone-400">
                No gallery images
              </p>
            )}
            <label className={pickClass}>
              <input
                id="article-gallery"
                type="file"
                accept="image/*"
                multiple
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const next = Array.from(e.target.files ?? []);
                  if (next.length) {
                    setGalleryFiles((prev) => [...prev, ...next]);
                  }
                  e.target.value = "";
                }}
                disabled={blocked}
                className="hidden"
              />
              Add images
            </label>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              {isHp ? "Video" : "Videos"}
            </p>
              {videoDisplay.length > 0 && (
                <span className="text-[11px] text-stone-400">
                  {videoDisplay.length}
                </span>
              )}
            </div>
            <input
              type="url"
              value={form.video}
              onChange={(e) => updateField("video", e.target.value)}
              placeholder="Primary video URL"
              disabled={blocked}
              className={fieldClass}
            />
            {videoDisplay.length > 0 ? (
              <div className="space-y-2">
                {videoDisplay.map((item) =>
                  item.pending ? (
                    <MediaFileRow
                      key={item.key}
                      name={item.name}
                      sizeLabel={item.sizeLabel}
                      mediaType="video"
                      disabled={blocked}
                      onRemove={() => removePendingVideo(item.index)}
                    />
                  ) : (
                    <div
                      key={item.key}
                      className="overflow-hidden rounded-lg border border-stone-100 bg-stone-950"
                    >
                      <video
                        src={item.url}
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        className="aspect-video w-full bg-black"
                      />
                      <div className="flex items-center justify-between gap-2 bg-stone-900 px-2.5 py-1.5">
                        <p className="truncate text-[11px] text-stone-300">
                          {item.name}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <CopyButton text={item.url} />
                          <button
                            type="button"
                            onClick={() => removeSavedVideo(item.url)}
                            disabled={blocked}
                            className="rounded-md p-1 text-stone-400 hover:bg-white/10 hover:text-white"
                            aria-label={`Remove ${item.name}`}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-stone-50 px-2.5 py-3 text-center text-[11px] text-stone-400">
                No videos yet
              </p>
            )}
            <label className={pickClass}>
              <input
                id="article-videos"
                type="file"
                accept="video/*"
                multiple
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const next = Array.from(e.target.files ?? []);
                  if (next.length) {
                    setVideoFiles((prev) => [...prev, ...next]);
                  }
                  e.target.value = "";
                }}
                disabled={blocked}
                className="hidden"
              />
              Add videos
            </label>
            <p className="text-[10px] leading-relaxed text-stone-400">
              Large videos upload to GCS. First file becomes primary if URL is
              empty.
            </p>
          </section>
        </aside>
      </div>
    </form>
  );
}
