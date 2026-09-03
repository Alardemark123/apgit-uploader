"use client";

import { useCallback, useEffect, useState } from "react";
import type { Article, ArticleSummary } from "@/lib/article-types";

type Props = {
  site: string;
  refreshKey?: number;
  disabled?: boolean;
  onEdit?: (article: Article) => void;
};

export default function ArticleList({
  site,
  refreshKey = 0,
  disabled,
  onEdit,
}: Props) {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!site) {
      setArticles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let res = await fetch(
        `/api/articles?${new URLSearchParams({ site }).toString()}`
      );
      let data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            `Failed to load articles (${res.status})`
        );
      }
      let list = (data as { articles?: ArticleSummary[] }).articles;
      list = Array.isArray(list) ? list : [];

      if (list.length === 0) {
        const rebuildRes = await fetch("/api/articles/rebuild", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site }),
        });
        const rebuildData = await rebuildRes.json().catch(() => ({}));
        if (rebuildRes.ok) {
          list = Array.isArray(
            (rebuildData as { articles?: ArticleSummary[] }).articles
          )
            ? (rebuildData as { articles: ArticleSummary[] }).articles
            : [];
        }
      }

      setArticles(list);
    } catch (err) {
      setArticles([]);
      setError(err instanceof Error ? err.message : "Failed to load articles.");
    } finally {
      setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleEdit(id: string) {
    if (!site) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/articles/${encodeURIComponent(id)}?${new URLSearchParams({
          site,
        }).toString()}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            `Failed to load article (${res.status})`
        );
      }
      const article = (data as { article?: Article }).article;
      if (!article) throw new Error("Article not found");
      onEdit?.(article);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open article.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!site) return;
    if (!window.confirm(`Delete article "${title}"?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/articles/${encodeURIComponent(id)}?${new URLSearchParams({
          site,
        }).toString()}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || `Delete failed (${res.status})`
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (!site) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center">
        <p className="text-sm text-stone-500">Select a website to list posts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-stone-900">Published</h3>
          {!loading && articles.length > 0 && (
            <span className="text-xs text-stone-400">{articles.length}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={disabled || loading}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {loading && articles.length === 0 ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center">
          <p className="text-sm text-stone-500">
            No articles yet. Publish one above.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {articles.map((article) => {
            const busy = busyId === article.id;
            return (
              <li
                key={article.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50/80"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  {article.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-stone-400">
                      —
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {article.title}
                    </p>
                    {article.featured ? (
                      <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        Featured
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-stone-400">
                    {article.category || article.slug || article.id}
                    {article.date ? ` · ${article.date}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleEdit(article.id)}
                    disabled={disabled || busy}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                  >
                    {busy ? "…" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(article.id, article.title)}
                    disabled={disabled || busy}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
