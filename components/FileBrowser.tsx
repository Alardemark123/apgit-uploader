"use client";

import { useCallback, useEffect, useState } from "react";
import CopyButton from "./CopyButton";
import type { FileItem } from "@/lib/types";
import { normalizeFiles } from "@/lib/types";

type Props = {
  site: string;
  folder: string;
  refreshKey?: number;
  disabled?: boolean;
};

export default function FileBrowser({
  site,
  folder,
  refreshKey = 0,
  disabled,
}: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!site || !folder) {
      setFiles([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ site, folder });
      const res = await fetch(`/api/files?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (data as { message?: string }).message ||
            `Failed to load files (${res.status})`
        );
      }
      setFiles(normalizeFiles(data));
    } catch (err) {
      setFiles([]);
      setError(err instanceof Error ? err.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [site, folder]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles, refreshKey]);

  async function handleDelete(path: string) {
    if (!path) return;
    if (!window.confirm(`Delete ${path}?`)) return;

    setDeleting(path);
    setError(null);
    try {
      const params = new URLSearchParams({ path });
      const res = await fetch(`/api/files?${params.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (data as { message?: string }).message ||
            `Delete failed (${res.status})`
        );
      }
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  }

  if (!site || !folder) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-stone-800">Browse files</h3>
        <p className="text-sm text-stone-500">
          Select a site and folder to list uploaded files.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800">Browse files</h3>
        <button
          type="button"
          onClick={() => void loadFiles()}
          disabled={disabled || loading}
          className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading && files.length === 0 ? (
        <p className="text-sm text-stone-500">Loading files…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-stone-500">No files found in this folder.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {files.map((file) => (
            <li
              key={file.path || file.url}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800">
                  {file.name}
                </p>
                {file.path && (
                  <p className="truncate text-xs text-stone-500">{file.path}</p>
                )}
                {file.url && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-xs text-sky-800 underline hover:text-sky-950"
                  >
                    {file.url}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CopyButton text={file.url} />
                <button
                  type="button"
                  onClick={() => void handleDelete(file.path)}
                  disabled={disabled || !file.path || deleting === file.path}
                  className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === file.path ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
