/**
 * Sanitize a string into a slug-safe id or folder name.
 * - lowercase
 * - spaces/underscores → hyphens
 * - strips non [a-z0-9-]
 * - collapses / trims hyphens
 * - rejects path traversal and empty results
 */
export function sanitizeSlug(input: string): string {
  if (typeof input !== "string") {
    throw new Error("Slug must be a string");
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Slug cannot be empty");
  }

  // Block path traversal and separators before normalizing
  if (
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    throw new Error("Slug must not contain path separators or traversal");
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Slug is empty after sanitization");
  }

  if (slug.includes("..")) {
    throw new Error("Slug must not contain path traversal");
  }

  return slug;
}
