export type Site = {
  id: string;
  label: string;
  folders: string[];
};

export type SitesConfig = {
  sites: Site[];
};

export type FileItem = {
  name: string;
  path: string;
  url: string;
};

export type UploadResultFile = {
  path?: string;
  url: string;
  name?: string;
};

export function normalizeSites(data: unknown): Site[] {
  if (!data || typeof data !== "object") return [];
  const raw = data as Record<string, unknown>;
  const list = (raw.sites ?? raw.data ?? data) as unknown;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const s = item as Record<string, unknown>;
      const id = String(s.id ?? s.siteId ?? "").trim();
      if (!id) return null;
      const label = String(s.label ?? s.name ?? id);
      const foldersRaw = s.folders ?? s.folderList ?? [];
      const folders = Array.isArray(foldersRaw)
        ? foldersRaw.map((f) => String(f)).filter(Boolean)
        : [];
      return { id, label, folders };
    })
    .filter((s): s is Site => s !== null);
}

export function normalizeFiles(data: unknown): FileItem[] {
  if (!data || typeof data !== "object") return [];
  const raw = data as Record<string, unknown>;
  const list = (raw.files ?? raw.data ?? []) as unknown;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const f = item as Record<string, unknown>;
      const url = String(f.url ?? f.publicUrl ?? "").trim();
      const path = String(f.path ?? f.name ?? "").trim();
      const name = String(f.name ?? path.split("/").pop() ?? path);
      if (!url && !path) return null;
      return { name, path, url };
    })
    .filter((f): f is FileItem => f !== null);
}

export function normalizeUploadUrls(data: unknown): UploadResultFile[] {
  if (!data || typeof data !== "object") return [];
  const raw = data as Record<string, unknown>;

  if (Array.isArray(raw.files)) {
    return raw.files
      .map((item) => {
        if (typeof item === "string") return { url: item };
        if (!item || typeof item !== "object") return null;
        const f = item as Record<string, unknown>;
        const url = String(f.url ?? f.publicUrl ?? "").trim();
        if (!url) return null;
        return {
          url,
          path: f.path ? String(f.path) : undefined,
          name: f.name ? String(f.name) : undefined,
        };
      })
      .filter((f): f is UploadResultFile => f !== null);
  }

  if (Array.isArray(raw.urls)) {
    return raw.urls
      .map((u) => String(u).trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }

  return [];
}
