import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { addFolder, findSite, loadSitesConfig } from "@/lib/config";
import { ensureBucketCorsOnce, getSignedUploadUrl } from "@/lib/gcs";
import { sanitizeSlug } from "@/lib/slug";
import {
  buildObjectPath,
  sanitizeFilename,
  sanitizeOptionalSubfolder,
} from "@/lib/upload-path";

type SignFileInput = {
  name?: unknown;
  contentType?: unknown;
};

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
  const folderRaw = String(raw.folder ?? "").trim();
  const subfolderRaw = String(raw.subfolder ?? "").trim();
  const filesRaw = raw.files;

  if (!siteRaw || !folderRaw) {
    return NextResponse.json(
      { error: "site and folder are required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
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
      if (folder === "articles") {
        await addFolder(siteId, "articles");
      } else {
        return NextResponse.json(
          {
            error: `Folder "${folder}" is not configured for site "${siteId}". Add it via Add Folder first.`,
          },
          { status: 400 }
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to validate site";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await ensureBucketCorsOnce();
  } catch (err) {
    console.warn("Failed to ensure bucket CORS (uploads may fail in browser):", err);
  }

  try {
    const uploads = [];
    for (const item of filesRaw as SignFileInput[]) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "Invalid file entry" }, { status: 400 });
      }
      const name = String(item.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "Each file needs a name" }, { status: 400 });
      }
      const contentType =
        String(item.contentType ?? "").trim() || "application/octet-stream";
      const filename = sanitizeFilename(name);
      const objectPath = buildObjectPath(siteId, folder, subfolder, filename);
      const signed = await getSignedUploadUrl(objectPath, contentType);
      uploads.push({
        name: filename,
        contentType,
        path: signed.path,
        url: signed.url,
        uploadUrl: signed.uploadUrl,
      });
    }

    return NextResponse.json({ uploads });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create signed upload URLs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
