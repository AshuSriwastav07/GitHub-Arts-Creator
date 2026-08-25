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

          {result && (
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
          )}
        </div>
      </div>
    </section>
  );
}
