import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { findSite, loadSitesConfig } from "@/lib/config";
import { deleteFile, listFiles } from "@/lib/gcs";
import { sanitizeSlug } from "@/lib/slug";

function isSafeObjectPath(path: string): boolean {
  if (!path || path.includes("..") || path.includes("\\") || path.includes("\0")) {
    return false;
  }
  if (path.startsWith("/") || path.includes("//")) return false;
  // Disallow deleting the config object via this endpoint
  if (path === "config/sites.json" || path.startsWith("config/")) {
    return false;
  }
  return /^[a-z0-9][a-z0-9._/-]*$/i.test(path);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const siteRaw = searchParams.get("site")?.trim() ?? "";
  const folderRaw = searchParams.get("folder")?.trim() ?? "";

  if (!siteRaw || !folderRaw) {
    return NextResponse.json(
      { error: "site and folder query params are required" },
      { status: 400 }
    );
  }

  let siteId: string;
  let folder: string;
  try {
    siteId = sanitizeSlug(siteRaw);
    folder = sanitizeSlug(folderRaw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid query";
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
        { error: `Folder "${folder}" is not configured for site "${siteId}"` },
        { status: 400 }
      );
    }

    const files = await listFiles(`${siteId}/${folder}`);
    return NextResponse.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const pathParam = request.nextUrl.searchParams.get("path")?.trim() ?? "";
  if (!pathParam) {
    return NextResponse.json({ error: "path query param is required" }, { status: 400 });
  }

  if (!isSafeObjectPath(pathParam)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await deleteFile(pathParam);
    return NextResponse.json({ ok: true, path: pathParam });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
