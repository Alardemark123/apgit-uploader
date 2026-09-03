"use client";

import { FormEvent, useState } from "react";

type Props = {
  onAdded: () => void | Promise<void>;
  disabled?: boolean;
};

export default function AddSiteForm({ onAdded, disabled }: Props) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedId = id.trim();
    const trimmedLabel = label.trim();
    if (!trimmedId || !trimmedLabel) {
      setError("Site id and label are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trimmedId, label: trimmedLabel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (data as { message?: string }).message ||
            `Failed to add site (${res.status})`
        );
      }
      setId("");
      setLabel("");
      setSuccess("Site added.");
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add site.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-800">Add website</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-stone-600">Site ID</span>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={disabled || loading}
            placeholder="my-site"
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 disabled:bg-stone-100"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-stone-600">Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={disabled || loading}
            placeholder="My Site"
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 disabled:bg-stone-100"
          />
        </label>
      </div>
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
      <button
        type="submit"
        disabled={disabled || loading}
        className="rounded bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {loading ? "Adding…" : "Add site"}
      </button>
    </form>
  );
}
