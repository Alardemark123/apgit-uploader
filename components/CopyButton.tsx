"use client";

import { useState } from "react";

type Props = {
  text: string;
  label?: string;
  className?: string;
};

export default function CopyButton({
  text,
  label = "Copy",
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className={`rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
