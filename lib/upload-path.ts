import { sanitizeSlug } from "@/lib/slug";

export function sanitizeFilename(original: string): string {
  const base = original.split(/[/\\]/).pop() ?? original;
  const trimmed = base.trim();
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    throw new Error("Invalid filename");
  }

  const lastDot = trimmed.lastIndexOf(".");
  const hasExt = lastDot > 0;
  const namePart = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const extPart = hasExt ? trimmed.slice(lastDot + 1) : "";

  const safeName = sanitizeSlug(namePart);
  const safeExt = extPart
    ? extPart.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";

  if (!safeName) throw new Error("Invalid filename");
  return safeExt ? `${safeName}.${safeExt}` : safeName;
}

export function sanitizeOptionalSubfolder(value: string | null): string | null {
  if (!value?.trim()) return null;
  const parts = value
    .trim()
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => sanitizeSlug(p));
  if (parts.length === 0) return null;
  return parts.join("/");
}

export function buildObjectPath(
  siteId: string,
  folder: string,
  subfolder: string | null,
  filename: string
): string {
  const segments = [siteId, folder];
  if (subfolder) segments.push(subfolder);
  segments.push(filename);
  return segments.join("/");
}
