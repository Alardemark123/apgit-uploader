"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function SubfolderInput({ value, onChange, disabled }: Props) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">
        Subfolder <span className="font-normal text-stone-500">(optional)</span>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="e.g. 2026/campaign"
        className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 disabled:bg-stone-100"
      />
    </label>
  );
}
