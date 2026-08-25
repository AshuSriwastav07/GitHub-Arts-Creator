"use client";

import { useRef, useState } from "react";
import StyleDetail from "@/components/StyleDetail";
import type { ApiErrorBody, GenerateResponse, PreviewItem } from "@/lib/types";

const EXAMPLES = ["torvalds", "gaearon", "sindresorhus", "yyx990803"];

export default function HomePage() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const [data, setData] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  async function generate(raw?: string) {
    const value = (raw ?? input).trim();
    if (!value || phase === "loading") return;
    setPhase("loading");
    setError(null);
    setSelectedId(null);
    setData(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        const errBody = body as ApiErrorBody;
        setError({
          code: errBody?.error?.code ?? "NETWORK_ERROR",
          message: errBody?.error?.message ?? "Something failed before we could render anything.",
        });
        setPhase("idle");
        return;
      }
      setData(body as GenerateResponse);
      setPhase("ready");
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: "Could not reach the rendering server. Check your connection and retry.",
      });
      setPhase("idle");
    }
  }

  const selected: PreviewItem | undefined =
    data?.previews.find((p) => p.id === selectedId) ?? undefined;

  return (
    <main className="bg-grid min-h-screen">
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:pt-16">
        {/* Header */}
        <header className="mb-10">
          <p className="text-xs text-[#7d8590]">
            <span className="text-[#39d353]">~/</span>github-avatar-art — deterministic README art
          </p>
          <h1 className="caret mt-2 text-2xl font-bold tracking-tight text-[#e6edf3] sm:text-3xl">
            $ gh-avatar-art
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8b949e]">
            Paste a GitHub profile URL. We fetch the public avatar, run it through an original
            algorithmic pipeline, and hand you permanent image URLs + copy-paste Markdown for your
            README. No login. Deterministic: same inputs → identical output.
          </p>
        </header>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="flex grow items-center rounded-lg border border-[#30363d] bg-[#0d1117] px-4 focus-within:border-[#388bfd]">
            <span aria-hidden className="mr-2 select-none text-[#39d353]">
              $
            </span>
            <label htmlFor="profile-url" className="sr-only">
              GitHub profile URL or username
            </label>
            <input
              id="profile-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/<username>"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-[#484f58]"
            />
          </div>
          <button
            type="submit"
            disabled={phase === "loading"}
            className="rounded-lg border border-[#238636] bg-[#238636] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2ea043] disabled:cursor-wait disabled:opacity-60"
          >
            {phase === "loading" ? "rendering…" : "Generate art"}
          </button>
        </form>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#7d8590]">
          try:
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setInput(ex);
                void generate(ex);
              }}
              className="rounded border border-[#30363d] px-1.5 py-0.5 hover:border-[#39d353] hover:text-[#39d353]"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Error states — one specific message per failure mode (spec §4) */}
        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-[#f85149]/40 bg-[#f85149]/10 p-4">
            <p className="font-mono text-xs uppercase tracking-wide text-[#ffa198]">error: {error.code}</p>
            <p className="mt-1 text-sm text-[#e6edf3]">{error.message}</p>
          </div>
        )}

        {/* Results */}
        {data && (
          <div ref={resultsRef} className="mt-12 scroll-mt-6">
            {/* Profile card */}
            <section className="mb-8 flex flex-col gap-4 rounded-xl border border-[#30363d] bg-[#0d1117] p-5 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${data.profile.avatarUrl}&size=160`}
                alt={`${data.profile.username}'s GitHub avatar (original)`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-full border-2 border-[#30363d]"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{data.profile.displayName}</h2>
                <a
                  href={data.profile.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-[#58a6ff] hover:underline"
                >
                  @{data.profile.username} ↗
                </a>
                {data.profile.bio && (
                  <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-relaxed text-[#8b949e]">
                    {data.profile.bio}
                  </p>
                )}
              </div>
              <p className="ml-auto hidden shrink-0 font-mono text-[11px] text-[#484f58] lg:block">
                original ↑ · derived art ↓
              </p>
            </section>

            {/* Style detail */}
            {selected && (
              <StyleDetail profile={data.profile} preview={selected} onClose={() => setSelectedId(null)} />
            )}

            {/* Preview grid */}
            <section aria-label="Style previews" className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {data.previews.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  aria-pressed={p.id === selectedId}
                  className={`group overflow-hidden rounded-xl border bg-[#0d1117] text-left transition-all hover:-translate-y-0.5 ${
                    p.id === selectedId
                      ? "border-[#39d353] shadow-[0_0_0_1px_#238636]"
                      : "border-[#30363d] hover:border-[#8b949e]"
                  }`}
                >
                  <div className="aspect-square w-full overflow-hidden bg-white/5">
                    {p.svg ? (
                      <div
                        className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                        // SVGs are generated server-side by our own pipeline.
                        dangerouslySetInnerHTML={{ __html: p.svg }}
                        role="img"
                        aria-label={`${p.name} preview of ${data.profile.username}'s avatar`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[#f85149]">
                        style failed to preview
                      </div>
                    )}
                  </div>
                  <div className="border-t border-[#21262d] px-3 py-2">
                    <p className="flex items-center justify-between text-xs font-semibold text-[#e6edf3]">
                      {p.name}
                      <span className="rounded bg-[#161b22] px-1.5 py-0.5 font-mono text-[10px] font-normal text-[#7d8590]">
                        {p.family}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </section>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-20 border-t border-[#21262d] pt-6 text-[11px] leading-relaxed text-[#484f58]">
          <p>
            runs fully server-side · seeded PRNG ⇒ byte-identical artifacts · public URLs need no auth ·
            rate-limited per IP
          </p>
          <p className="mt-1">
            v1 scope note: dot-matrix/stipple ship as halftone params, blueprint/circuit as line-art presets,
            binary/hex/blocks/username/markdown as character-set options — see README for the full cut list.
          </p>
        </footer>
      </div>
    </main>
  );
}
