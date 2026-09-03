const SITE_KEY = "apgit-uploader:siteId";
const FOLDER_KEY = "apgit-uploader:folder";
const MODE_KEY = "apgit-uploader:mode";
const DRAFT_PREFIX = "apgit-uploader:draft:";

export type UploaderMode = "articles" | "files";

export type ArticleDraft = {
  form: Record<string, unknown>;
  tagsInput: string;
  scrapeUrl: string;
  importCover: boolean;
  slugTouched: boolean;
  savedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readSavedSiteId(): string {
  if (!canUseStorage()) return "";
  try {
    return localStorage.getItem(SITE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function writeSavedSiteId(siteId: string): void {
  if (!canUseStorage()) return;
  try {
    const trimmed = siteId.trim();
    if (!trimmed) localStorage.removeItem(SITE_KEY);
    else localStorage.setItem(SITE_KEY, trimmed);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readSavedFolder(): string {
  if (!canUseStorage()) return "";
  try {
    return localStorage.getItem(FOLDER_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function writeSavedFolder(folder: string): void {
  if (!canUseStorage()) return;
  try {
    const trimmed = folder.trim();
    if (!trimmed) localStorage.removeItem(FOLDER_KEY);
    else localStorage.setItem(FOLDER_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function readSavedMode(): UploaderMode | "" {
  if (!canUseStorage()) return "";
  try {
    const value = localStorage.getItem(MODE_KEY)?.trim();
    if (value === "articles" || value === "files") return value;
    return "";
  } catch {
    return "";
  }
}

export function writeSavedMode(mode: UploaderMode): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function draftKey(siteId: string): string {
  return `${DRAFT_PREFIX}${siteId.trim()}`;
}

export function readArticleDraft(siteId: string): ArticleDraft | null {
  if (!canUseStorage() || !siteId.trim()) return null;
  try {
    const raw = localStorage.getItem(draftKey(siteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArticleDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.form) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeArticleDraft(siteId: string, draft: Omit<ArticleDraft, "savedAt">): void {
  if (!canUseStorage() || !siteId.trim()) return;
  try {
    const payload: ArticleDraft = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(draftKey(siteId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearArticleDraft(siteId: string): void {
  if (!canUseStorage() || !siteId.trim()) return;
  try {
    localStorage.removeItem(draftKey(siteId));
  } catch {
    /* ignore */
  }
}
