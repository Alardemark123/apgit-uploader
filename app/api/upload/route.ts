import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { findSite, loadSitesConfig } from "@/lib/config";
import { uploadBuffer } from "@/lib/gcs";
import { sanitizeSlug } from "@/lib/slug";
import {
  buildObjectPath,
  sanitizeFilename,
  sanitizeOptionalSubfolder,
} from "@/lib/upload-path";

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const siteRaw = String(form.get("site") ?? "").trim();
  const folderRaw = String(form.get("folder") ?? "").trim();
  const subfolderRaw = String(form.get("subfolder") ?? "").trim();

  if (!siteRaw || !folderRaw) {
    return NextResponse.json(
      { error: "site and folder are required" },
      { status: 400 }
    );
  }

  let siteId: string;
  let folder: string;
  let subfolder: string | null;
  try {
    siteId = sanitizeSlug(siteRaw);
    folder = sanitizeSlug(folderRaw);
    subfolder = sanitizeOptionalSubfolder(subfolderRaw || null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid path segment";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const config = await loadSitesConfig();
    const site = findSite(config, siteId);
    if (!site) {
      return NextResponse.json({ error: `Unknown site: ${siteId}` }, { status: 400 });
    }
    if (!site.folders.includes(folder)) {
      return NextResponse.json(
        {
          error: `Folder "${folder}" is not configured for site "${siteId}". Add it via Add Folder first.`,
        },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to validate site";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Accept repeated fields named files / files[] / file (multi-select FormData).
  const entries = [
    ...form.getAll("files"),
    ...form.getAll("files[]"),
    ...form.getAll("file"),
  ];

  type UploadPart = { blob: Blob; name: string };
  const fileParts: UploadPart[] = [];
  for (const v of entries) {
    if (typeof File !== "undefined" && v instanceof File) {
      fileParts.push({ blob: v, name: v.name || "upload" });
      continue;
    }
    if (
      typeof Blob !== "undefined" &&
      v instanceof Blob &&
      typeof (v as Blob & { name?: unknown }).name === "string"
    ) {
      const name = (v as Blob & { name: string }).name;
      if (name) fileParts.push({ blob: v, name });
    }
  }

  if (fileParts.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const uploaded: { name: string; path: string; url: string }[] = [];

  try {
    for (const part of fileParts) {
      const filename = sanitizeFilename(part.name || "upload");
      const objectPath = buildObjectPath(siteId, folder, subfolder, filename);

      const buffer = Buffer.from(await part.blob.arrayBuffer());
      const contentType = part.blob.type || "application/octet-stream";
      const result = await uploadBuffer(objectPath, buffer, contentType);
      uploaded.push({ name: filename, path: result.path, url: result.url });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    files: uploaded,
    urls: uploaded.map((f) => f.url),
  });
}
