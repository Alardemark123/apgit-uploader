"use client";

import { FormEvent, useState } from "react";

type Props = {
  siteId: string;
  onAdded: () => void | Promise<void>;
  disabled?: boolean;
};

export default function AddFolderForm({ siteId, onAdded, disabled }: Props) {
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!siteId) {
      setError("Select a site first.");
      return;
    }

    const trimmed = folder.trim();
    if (!trimmed) {
      setError("Folder name is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/sites/${encodeURIComponent(siteId)}/folders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: trimmed }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (data as { message?: string }).message ||
            `Failed to add folder (${res.status})`
        );
      }
      setFolder("");
      setSuccess("Folder added.");
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add folder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-800">Add folder</h3>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-stone-600">Folder name</span>
        <input
          type="text"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          disabled={disabled || loading || !siteId}
          placeholder="images"
          className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 disabled:bg-stone-100"
        />
      </label>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
      <button
        type="submit"
        disabled={disabled || loading || !siteId}
        className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {loading ? "Adding…" : "Add folder"}
      </button>
    </form>
  );
}
