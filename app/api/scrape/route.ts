import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { scrapeArticle } from "@/lib/scrape";

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const url =
    body && typeof body === "object"
      ? String((body as { url?: unknown }).url ?? "").trim()
      : "";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const scraped = await scrapeArticle(url);
    return NextResponse.json({ scraped });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to scrape article";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
