"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FolderSelect from "@/components/FolderSelect";
import SubfolderInput from "@/components/SubfolderInput";
import AddSiteForm from "@/components/AddSiteForm";
import AddFolderForm from "@/components/AddFolderForm";
import UploadPanel from "@/components/UploadPanel";
import FileBrowser from "@/components/FileBrowser";
import BucketSetupBanner from "@/components/BucketSetupBanner";
import ArticleForm from "@/components/ArticleForm";
import ArticleList from "@/components/ArticleList";
import AppHeaderControls from "@/components/AppHeaderControls";
import type { Article } from "@/lib/article-types";
import type { Site } from "@/lib/types";
import { normalizeSites } from "@/lib/types";
import {
  readSavedFolder,
  readSavedMode,
  readSavedSiteId,
  writeSavedFolder,
  writeSavedMode,
  writeSavedSiteId,
  type UploaderMode,
} from "@/lib/uploader-persistence";

type Mode = UploaderMode;

export default function HomePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [folder, setFolder] = useState("");
  const [subfolder, setSubfolder] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [articleRefreshKey, setArticleRefreshKey] = useState(0);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [mode, setMode] = useState<Mode>("articles");
  const [bucketReady, setBucketReady] = useState<boolean | null>(null);
  const [bucketName, setBucketName] = useState("");
  const [checkingBucket, setCheckingBucket] = useState(false);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [bucketCreateError, setBucketCreateError] = useState<string | null>(null);
  const [bucketCreateMessage, setBucketCreateMessage] = useState<string | null>(
    null
  );

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId]
  );
  const folders = useMemo(() => selectedSite?.folders ?? [], [selectedSite]);

  useEffect(() => {
    const savedMode = readSavedMode();
    if (savedMode) setMode(savedMode);
  }, []);

  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    setSitesError(null);
    try {
      const res = await fetch("/api/sites");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (data as { message?: string }).message ||
            `Failed to load sites (${res.status})`
        );
      }
      const next = normalizeSites(data);
      setSites(next);
      setSiteId((prev) => {
        if (prev && next.some((s) => s.id === prev)) return prev;
        const saved = readSavedSiteId();
        if (saved && next.some((s) => s.id === saved)) return saved;
        return next[0]?.id ?? "";
      });
    } catch (err) {
      setSitesError(
        err instanceof Error ? err.message : "Failed to load sites."
      );
    } finally {
      setLoadingSites(false);
    }
  }, []);

  const checkBucket = useCallback(async () => {
    setCheckingBucket(true);
    setBucketCreateError(null);
    try {
      const res = await fetch("/api/setup/bucket");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (data as { message?: string }).message ||
            `Failed to check bucket (${res.status})`
        );
      }
      const payload = data as { exists?: boolean; bucket?: string };
      setBucketReady(Boolean(payload.exists));
      setBucketName(payload.bucket ?? "");
    } catch (err) {
      setBucketReady(false);
      setBucketCreateError(
        err instanceof Error ? err.message : "Failed to check bucket status."
      );
    } finally {
      setCheckingBucket(false);
    }
  }, []);

  const createBucket = useCallback(async () => {
    setCreatingBucket(true);
    setBucketCreateError(null);
    setBucketCreateMessage(null);
    try {
      const res = await fetch("/api/setup/bucket", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      const payload = data as {
        exists?: boolean;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          payload.message || payload.error || `Setup failed (${res.status})`
        );
      }

      setBucketReady(Boolean(payload.exists));
      setBucketCreateMessage(
        payload.message || "Bucket is ready. You can upload files now."
      );
      await loadSites();
    } catch (err) {
      setBucketCreateError(
        err instanceof Error ? err.message : "Failed to create bucket."
      );
    } finally {
      setCreatingBucket(false);
    }
  }, [loadSites]);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json().catch(() => ({}));
        const payload = data as { ok?: boolean; authenticated?: boolean };
        const authenticated =
          typeof payload.ok === "boolean"
            ? payload.ok
            : typeof payload.authenticated === "boolean"
              ? payload.authenticated
              : res.ok;

        if (!authenticated) {
          router.replace("/login");
          return;
        }
        if (!cancelled) {
          setAuthChecked(true);
          await checkBucket();
          await loadSites();
        }
      } catch {
        if (!cancelled) router.replace("/login");
      }
    }

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router, loadSites, checkBucket]);

  useEffect(() => {
    if (!siteId) {
      setFolder("");
      return;
    }
    writeSavedSiteId(siteId);
    if (folder && folders.includes(folder)) return;
    const savedFolder = readSavedFolder();
    if (savedFolder && folders.includes(savedFolder)) {
      setFolder(savedFolder);
      return;
    }
    setFolder(
      folders.includes("articles") ? "articles" : folders[0] ?? ""
    );
  }, [siteId, folders, folder]);

  useEffect(() => {
    if (folder) writeSavedFolder(folder);
  }, [folder]);

  useEffect(() => {
    writeSavedMode(mode);
  }, [mode]);

  function handleSiteChange(nextId: string) {
    setSiteId(nextId);
    writeSavedSiteId(nextId);
    setFolder("");
    setSubfolder("");
    setEditingArticle(null);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still redirect
    } finally {
      router.replace("/login");
      setLoggingOut(false);
    }
  }

  async function handleSitesChanged() {
    if (bucketReady) {
      await loadSites();
    }
  }

  const storageBlocked = bucketReady === false;
  const storagePending = bucketReady === null || checkingBucket;

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-stone-500">Checking session…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Article Uploader
          </h1>
        </div>
        <AppHeaderControls
          sites={sites}
          value={siteId}
          onChange={handleSiteChange}
          onLogout={() => void handleLogout()}
          disabled={loadingSites || storageBlocked || storagePending}
          loggingOut={loggingOut}
        />
      </header>

      <div className="space-y-6">
        {bucketReady && bucketCreateMessage && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-900">{bucketCreateMessage}</p>
          </section>
        )}

        {storageBlocked && bucketName && (
          <BucketSetupBanner
            bucket={bucketName}
            creating={creatingBucket}
            createError={bucketCreateError}
            createMessage={bucketCreateMessage}
            onCreate={() => void createBucket()}
          />
        )}

        {storageBlocked && !bucketName && bucketCreateError && (
          <section
            className="rounded-2xl border border-red-200 bg-red-50 p-4"
            role="alert"
          >
            <p className="text-sm text-red-800">{bucketCreateError}</p>
            <button
              type="button"
              onClick={() => void checkBucket()}
              className="mt-2 text-sm underline"
            >
              Retry bucket check
            </button>
          </section>
        )}

        {sitesError && (
          <p className="text-sm text-red-700" role="alert">
            {sitesError}{" "}
            <button
              type="button"
              onClick={() => void loadSites()}
              className="underline"
            >
              Retry
            </button>
          </p>
        )}

        <div className="inline-flex gap-1 rounded-full bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => setMode("articles")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mode === "articles"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Articles
          </button>
          <button
            type="button"
            onClick={() => setMode("files")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mode === "files"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Files
          </button>
        </div>

        {mode === "articles" ? (
          <div className="space-y-6">
            <section className="rounded-2xl border border-stone-200/70 bg-[#fafaf8] p-3 sm:p-4">
              <ArticleForm
                key={siteId}
                site={siteId}
                disabled={storageBlocked || storagePending}
                editing={editingArticle}
                onCancelEdit={() => setEditingArticle(null)}
                onSaved={async () => {
                  setEditingArticle(null);
                  setArticleRefreshKey((k) => k + 1);
                }}
              />
            </section>

            <section>
              <ArticleList
                site={siteId}
                refreshKey={articleRefreshKey}
                disabled={storageBlocked || storagePending}
                onEdit={(article) => {
                  setEditingArticle(article);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </section>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-stone-800">
                Destination
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <FolderSelect
                  folders={folders}
                  value={folder}
                  onChange={setFolder}
                  disabled={
                    !siteId || loadingSites || storageBlocked || storagePending
                  }
                />
                <SubfolderInput
                  value={subfolder}
                  onChange={setSubfolder}
                  disabled={
                    !siteId || !folder || storageBlocked || storagePending
                  }
                />
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <AddSiteForm
                  onAdded={handleSitesChanged}
                  disabled={storageBlocked || storagePending}
                />
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <AddFolderForm
                  siteId={siteId}
                  onAdded={handleSitesChanged}
                  disabled={!siteId || storageBlocked || storagePending}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <UploadPanel
                site={siteId}
                folder={folder}
                subfolder={subfolder}
                disabled={storageBlocked || storagePending}
                onUploaded={() => setRefreshKey((k) => k + 1)}
              />
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <FileBrowser
                site={siteId}
                folder={folder}
                refreshKey={refreshKey}
                disabled={storageBlocked || storagePending}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
