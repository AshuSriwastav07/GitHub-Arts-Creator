"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be unavailable (http); fall back to execCommand.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        copied
          ? "border-[#238636] bg-[#238636] text-white"
          : "border-[#30363d] bg-[#161b22] text-[#e6edf3] hover:border-[#8b949e]"
      } ${className}`}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}
