"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CopyButton from "./CopyButton";
import ParamControls from "./ParamControls";
import type { ProfileDTO, PreviewItem, RenderResponse } from "@/lib/types";

const FORMAT_LABELS: Record<string, string> = { svg: "SVG", png: "PNG", text: "Text" };

/**
 * Style detail view (spec §11): large preview, live re-render on param/seed
 * changes (debounced), seed randomizer, and copy-ready README embeds.
 */
export default function StyleDetail({
  profile,
  preview,
  onClose,
}: {
  profile: ProfileDTO;
  preview: PreviewItem;
  onClose: () => void;
}) {
  const [params, setParams] = useState<Record<string, unknown>>({ ...preview.defaults });
  const [seed, setSeed] = useState<number>(preview.defaultSeed);
  const [format, setFormat] = useState<"svg" | "png" | "text">(
    preview.supportedFormats[0] === "text" ? "text" : preview.supportedFormats[0]
  );
  const [result, setResult] = useState<RenderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embedTab, setEmbedTab] = useState<"centered" | "plain" | "codeBlock">("centered");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Debounced deterministic render whenever inputs change.
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: profile.username, styleId: preview.id, params, seed, format }),
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "Render failed");
        setResult(body as RenderResponse);
        setError(null);
        setEmbedTab((prev) =>
          prev === "codeBlock" && !(body as RenderResponse).markdown.codeBlock ? "centered" : prev
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [profile.username, preview.id, params, seed, format]);

  const onParam = useCallback((key: string, value: unknown) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const embedOptions: Array<"centered" | "plain" | "codeBlock"> =
    result?.markdown.codeBlock !== undefined
      ? ["centered", "plain", "codeBlock"]
      : ["centered", "plain"];
  const embedText =
    result && embedTab === "codeBlock"
      ? result.markdown.codeBlock!
      : result && embedTab === "plain"
        ? result.markdown.plain
        : result?.markdown.centered ?? "";

  return (
    <section
      ref={containerRef}
      aria-label={`${preview.name} detail`}
      className="rounded-xl border border-[#30363d] bg-[#0d1117]"
    >
      <div className="flex items-center justify-between border-b border-[#30363d] px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#e6edf3]">
            <span className="text-[#39d353]">$</span> render --style {preview.id} --seed {seed}
          </h2>
          <p className="mt-0.5 text-xs text-[#7d8590]">{preview.description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs hover:border-[#8b949e]"
        >
          ← All styles
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Preview */}
        <div>
          <div className="relative overflow-hidden rounded-lg border border-[#30363d] bg-[#010409]">
            {(busy || !result) && (
              <div
                aria-hidden
                className={`absolute inset-0 z-10 animate-pulse bg-[#161b22]/60 transition-opacity ${busy ? "" : "hidden"}`}
              />
            )}
            {format === "text" ? (
              <pre className="max-h-[440px] overflow-auto p-4 text-[10px] leading-[1.15] text-[#39d353] whitespace-pre">
                {result?.textContent ?? "…"}
              </pre>
            ) : result ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.url}
                width={result.width}
                height={result.height}
                alt={result.alt}
                className="block h-auto w-full"
              />
            ) : null}
            {!result && format !== "text" && <div className="aspect-square w-full" />}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {preview.supportedFormats.length > 1 && (
              <div role="group" aria-label="Output format" className="flex overflow-hidden rounded-md border border-[#30363d]">
                {preview.supportedFormats.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`px-2.5 py-1.5 text-xs ${
                      format === f ? "bg-[#238636] text-white" : "bg-[#161b22] hover:bg-[#21262d]"
                    }`}
                  >
                    {FORMAT_LABELS[f] ?? f}
                  </button>
                ))}
              </div>
            )}
            {result && (
              <a
                href={result.url}
                download={`${profile.username}-${preview.id}.${result.urlPath.split(".").pop()}`}
                className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs hover:border-[#8b949e]"
              >
                ↓ Download .{result.urlPath.split(".").pop()}
              </a>
            )}
            {result && (
              <span className="ml-auto font-mono text-[11px] text-[#7d8590]">
                {result.cached ? "(cached)" : "(fresh)"} · {(result.bytes / 1024).toFixed(1)} KB ·{" "}
                {result.hash.slice(0, 10)}…
              </span>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 rounded-md border border-[#f85149]/40 bg-[#f85149]/10 px-3 py-2 text-xs text-[#ffa198]">
              {error}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-5">
          <div className="flex items-end gap-2">
            <div className="grow">
              <label htmlFor="seed-input" className="mb-1.5 block text-xs text-[#7d8590]">
                Seed
              </label>
              <input
                id="seed-input"
                type="number"
                min={0}
                max={2147483646}
                value={seed}
                onChange={(e) => setSeed(Math.max(0, Math.min(2147483646, Math.trunc(Number(e.target.value) || 0))))}
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm outline-none focus:border-[#388bfd]"
              />
            </div>
            <button
              type="button"
              onClick={() => setSeed(Math.floor(Math.random() * 2147483647))}
              title="Randomize seed"
              className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm hover:border-[#8b949e]"
            >
              🎲
            </button>
          </div>

          <ParamControls schema={preview.paramSchema} values={params} onChange={onParam} disabled={busy} />

          {/* Growth & Trust Controls: Attribution Badge & Adaptive Theme */}
          <div className="space-y-2.5 rounded-lg border border-[#30363d] bg-[#090d13] p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-[#e6edf3]">🏷️ Attribution Badge</span>
                <p className="text-[11px] text-[#7d8590]">
                  Adds a subtle <code className="rounded bg-[#161b22] px-1 py-0.5 text-[10px]">gh-avatar-art</code> credit mark in the corner.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={params.showBadge !== false}
                  onChange={(e) => onParam("showBadge", e.target.checked)}
                  className="peer sr-only"
                />
                <div className="peer h-4 w-8 rounded-full bg-[#21262d] after:absolute after:top-[2px] after:left-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#238636] peer-checked:after:translate-x-full peer-focus:outline-none" />
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-[#21262d] pt-2.5">
              <div>
                <span className="font-semibold text-[#e6edf3]">🌓 Theme-Adaptive SVG</span>
                <p className="text-[11px] text-[#7d8590]">
                  Auto-switches styling between GitHub light and dark modes via CSS.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={params.adaptiveTheme !== false}
                  onChange={(e) => onParam("adaptiveTheme", e.target.checked)}
                  className="peer sr-only"
                />
                <div className="peer h-4 w-8 rounded-full bg-[#21262d] after:absolute after:top-[2px] after:left-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#238636] peer-checked:after:translate-x-full peer-focus:outline-none" />
              </label>
            </div>
          </div>

          {/* Right-Side Text & README Header Banner Card Section */}
          <div className="rounded-lg border border-[#30363d] bg-[#090d13] p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-[#e6edf3]">
                  🎨 README Header Banner with Text
                </h3>
                <p className="text-[11px] text-[#7d8590]">
                  Add a developer identity card with custom text on the right side of the art.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={Boolean(params.bannerEnabled)}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setParams((prev) => ({
                      ...prev,
                      bannerEnabled: enabled,
                      bannerTitle: prev.bannerTitle ?? profile.displayName ?? profile.username,
                      bannerSubtitle: prev.bannerSubtitle ?? "Full-Stack Developer",
                      bannerBio: prev.bannerBio ?? profile.bio ?? "Building things for the web & AI",
                      bannerTags: prev.bannerTags ?? "TypeScript, React, Next.js, Node.js",
                      bannerTheme: prev.bannerTheme ?? "terminal",
                    }));
                  }}
                  className="peer sr-only"
                />
                <div className="peer h-5 w-9 rounded-full bg-[#21262d] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#238636] peer-checked:after:translate-x-full peer-focus:outline-none" />
              </label>
            </div>

            {Boolean(params.bannerEnabled) && (
              <div className="mt-3.5 space-y-3 border-t border-[#21262d] pt-3 text-xs">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#7d8590]">
                    Banner Theme
                  </label>
                  <select
                    value={String(params.bannerTheme ?? "terminal")}
                    onChange={(e) => onParam("bannerTheme", e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#388bfd]"
                  >
                    <option value="terminal">Terminal Obsidian (Default)</option>
                    <option value="blueprint">Blueprint Navy</option>
                    <option value="cyber">Cyber Neon</option>
                    <option value="minimal">Minimal Dark</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#7d8590]">
                    Title / Developer Name
                  </label>
                  <input
                    type="text"
                    value={String(params.bannerTitle ?? profile.displayName ?? profile.username)}
                    placeholder="e.g. Ashutosh Sriwastav"
                    onChange={(e) => onParam("bannerTitle", e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#388bfd]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#7d8590]">
                    Role / Subtitle
                  </label>
                  <input
                    type="text"
                    value={String(params.bannerSubtitle ?? "Full-Stack Developer")}
                    placeholder="e.g. Software Engineer · Open Source"
                    onChange={(e) => onParam("bannerSubtitle", e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#388bfd]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#7d8590]">
                    Bio / Custom Description
                  </label>
                  <textarea
                    rows={2}
                    value={String(params.bannerBio ?? profile.bio ?? "")}
                    placeholder="e.g. Building tools and interactive web experiences"
                    onChange={(e) => onParam("bannerBio", e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#388bfd]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#7d8590]">
                    Tech Stack Badges (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={String(params.bannerTags ?? "TypeScript, React, Next.js, Node.js")}
                    placeholder="e.g. TypeScript, React, Next.js, Python"
                    onChange={(e) => onParam("bannerTags", e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#388bfd]"
                  />
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="space-y-3">
              {/* Embed code box */}
              <div className="rounded-lg border border-[#30363d] bg-[#010409] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#7d8590]">README embed:</span>
                  <div className="flex overflow-hidden rounded-md border border-[#30363d]">
                    {embedOptions.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setEmbedTab(tab)}
                        className={`px-2 py-1 text-[11px] ${
                          embedTab === tab ? "bg-[#238636] text-white" : "bg-[#161b22] hover:bg-[#21262d]"
                        }`}
                      >
                        {tab === "centered" ? "<p><img/>" : tab === "plain" ? "![]()" : "``` block"}
                      </button>
                    ))}
                  </div>
                  <CopyButton text={embedText} className="ml-auto" />
                </div>
                <pre className="max-h-40 overflow-auto rounded bg-[#0d1117] p-2 text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all">
                  {embedText}
                </pre>
              </div>

              {/* Community Showcase Status (Auto-added, removable) */}
              <div className="flex items-center justify-between rounded-lg border border-[#30363d] bg-[#0d1117] px-3.5 py-2.5 text-xs">
                <div>
                  <span className="flex items-center gap-1.5 font-semibold text-[#e6edf3]">
                    <span className="text-[#39d353]">✓</span> In Community Gallery
                  </span>
                  <p className="text-[11px] text-[#7d8590]">
                    {params.isPublic !== false
                      ? "Automatically featured in the community showcase."
                      : "Removed from public community gallery."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const next = params.isPublic === false ? true : false;
                    onParam("isPublic", next);
                    if (result?.hash) {
                      await fetch("/api/gallery", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "opt-in",
                          hash: result.hash,
                          username: profile.username,
                          styleId: preview.id,
                          isPublic: next,
                        }),
                      }).catch(() => null);
                    }
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    params.isPublic !== false
                      ? "border border-[#f85149]/40 bg-[#f85149]/10 text-[#ffa198] hover:bg-[#f85149]/20"
                      : "border border-[#238636] bg-[#238636]/20 text-[#39d353] hover:bg-[#238636]/30"
                  }`}
                >
                  {params.isPublic !== false ? "Remove from Gallery" : "+ Add Back to Gallery"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
