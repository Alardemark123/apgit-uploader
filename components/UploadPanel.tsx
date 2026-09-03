"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import CopyButton from "./CopyButton";
import type { UploadResultFile } from "@/lib/types";

type Props = {
  site: string;
  folder: string;
  subfolder: string;
  disabled?: boolean;
  onUploaded?: () => void | Promise<void>;
};

type SignedUpload = {
  name: string;
  contentType: string;
  path: string;
  url: string;
  uploadUrl: string;
};

export default function UploadPanel({
  site,
  folder,
  subfolder,
  disabled,
  onUploaded,
}: Props) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResultFile[]>([]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFiles(e.target.files);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResults([]);
    setProgress(null);

    if (!site || !folder) {
      setError("Select a site and folder before uploading.");
      return;
    }
    if (!files || files.length === 0) {
      setError("Choose at least one file.");
      return;
    }

    const fileList = Array.from(files);
    setLoading(true);

    try {
      setProgress("Preparing upload…");
      const signRes = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site,
          folder,
          ...(subfolder.trim() ? { subfolder: subfolder.trim() } : {}),
          files: fileList.map((file) => ({
            name: file.name,
            contentType: file.type || "application/octet-stream",
          })),
        }),
      });

      const signData = await signRes.json().catch(() => ({}));
      if (!signRes.ok) {
        throw new Error(
          (signData as { error?: string }).error ||
            (signData as { message?: string }).message ||
            `Failed to prepare upload (${signRes.status})`
        );
      }

      const uploads = (signData as { uploads?: SignedUpload[] }).uploads;
      if (!Array.isArray(uploads) || uploads.length !== fileList.length) {
        throw new Error("Invalid signed upload response");
      }

      const uploaded: UploadResultFile[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const meta = uploads[i];
        setProgress(
          `Uploading ${i + 1}/${fileList.length}: ${file.name}`
        );

        const contentType = file.type || "application/octet-stream";
        const putRes = await fetch(meta.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });

        if (!putRes.ok) {
          const detail = await putRes.text().catch(() => "");
          throw new Error(
            `Failed to upload "${file.name}" (${putRes.status})${
              detail ? `: ${detail.slice(0, 200)}` : ""
            }`
          );
        }

        uploaded.push({
          name: meta.name,
          path: meta.path,
          url: meta.url,
        });
      }

      setResults(uploaded);
      setFiles(null);
      const input = document.getElementById(
        "upload-files"
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      await onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const selectedCount = files?.length ?? 0;
  const canUpload =
    !disabled && !loading && !!site && !!folder && selectedCount > 0;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">Upload files</h3>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-stone-600">
            Any file type (multiple allowed)
          </span>
          <input
            id="upload-files"
            type="file"
            multiple
            onChange={handleFileChange}
            disabled={disabled || loading || !site || !folder}
            className="block w-full text-sm text-stone-700 file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-800 hover:file:bg-stone-300 disabled:opacity-50"
          />
          <p className="text-xs text-stone-500">
            Select several files in the file picker (Ctrl/Cmd+click or
            Shift+click). Large videos and documents upload directly to
            storage.
          </p>
        </label>
        {selectedCount > 0 && files && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-stone-600">
              {selectedCount} file{selectedCount === 1 ? "" : "s"} selected
            </p>
            <ul className="max-h-28 overflow-y-auto rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-600">
              {Array.from(files).map((file, i) => (
                <li key={`${file.name}-${file.size}-${i}`} className="truncate">
                  {file.name}
                  {file.size > 0
                    ? ` (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {progress && (
          <p className="text-sm text-stone-600" aria-live="polite">
            {progress}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!canUpload}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading
            ? selectedCount > 0
              ? `Uploading ${selectedCount}…`
              : "Uploading…"
            : selectedCount > 0
              ? `Upload ${selectedCount} file${selectedCount === 1 ? "" : "s"}`
              : "Upload"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Upload results ({results.length})
          </h4>
          <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
            {results.map((item, i) => (
              <li
                key={`${item.url}-${i}`}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  {(item.name || item.path) && (
                    <p className="truncate text-xs text-stone-500">
                      {item.name || item.path}
                    </p>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm text-sky-800 underline hover:text-sky-950"
                  >
                    {item.url}
                  </a>
                </div>
                <CopyButton text={item.url} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
