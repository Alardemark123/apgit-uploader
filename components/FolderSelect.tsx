"use client";

type Props = {
  folders: string[];
  value: string;
  onChange: (folder: string) => void;
  disabled?: boolean;
};

export default function FolderSelect({
  folders,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">Folder</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || folders.length === 0}
        className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 disabled:bg-stone-100"
      >
        <option value="">
          {folders.length === 0 ? "No folders yet" : "Select a folder…"}
        </option>
        {folders.map((folder) => (
          <option key={folder} value={folder}>
            {folder}
          </option>
        ))}
      </select>
    </label>
  );
}
