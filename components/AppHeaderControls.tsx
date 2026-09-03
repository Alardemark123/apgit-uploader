"use client";

import type { Site } from "@/lib/types";

type Props = {
  sites: Site[];
  value: string;
  onChange: (siteId: string) => void;
  onLogout: () => void;
  disabled?: boolean;
  loggingOut?: boolean;
};

function ChevronDownIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function AppHeaderControls({
  sites,
  value,
  onChange,
  onLogout,
  disabled,
  loggingOut,
}: Props) {
  const blocked = disabled || sites.length === 0;

  return (
    <div className="flex items-center overflow-hidden rounded-full border border-stone-200 bg-white shadow-sm">
      <div className="relative min-w-[9rem] max-w-[12rem]">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={blocked}
          aria-label="Select website"
          className="w-full appearance-none bg-transparent py-1.5 pl-3.5 pr-8 text-sm font-medium text-stone-800 outline-none transition hover:bg-stone-50/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sites.length === 0 ? (
            <option value="">No sites</option>
          ) : (
            sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.label}
              </option>
            ))
          )}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
      </div>

      <div className="h-5 w-px shrink-0 bg-stone-200" aria-hidden="true" />

      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="shrink-0 px-3.5 py-1.5 text-sm text-stone-600 transition hover:bg-stone-50 hover:text-stone-900 disabled:opacity-50"
      >
        {loggingOut ? "…" : "Sign out"}
      </button>
    </div>
  );
}
