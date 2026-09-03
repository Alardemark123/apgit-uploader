"use client";

import type { Site } from "@/lib/types";

type Props = {
  sites: Site[];
  value: string;
  onChange: (siteId: string) => void;
  disabled?: boolean;
};

export default function SiteSelect({
  sites,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">Website</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || sites.length === 0}
        className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 disabled:bg-stone-100"
      >
        <option value="">
          {sites.length === 0 ? "No sites yet" : "Select a site…"}
        </option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.label} ({site.id})
          </option>
        ))}
      </select>
    </label>
  );
}
