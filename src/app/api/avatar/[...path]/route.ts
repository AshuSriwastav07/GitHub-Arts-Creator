import { AppError } from "@/lib/errors";
import { USERNAME_PATTERN } from "@/lib/github";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { renderArtifact, type RenderRequest } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated artifact serving (spec §8).
 *
 * Two URL shapes under /api/avatar/:
 *   1. /api/avatar/<40-hex-hash>.<svg|png|txt>  — permanent artifact.
 *      Cache-Control: public, max-age=31536000, immutable (hash ⇒ content).
 *   2. /api/avatar/<username>?style=halftone&seed=123&<params> — "live"
 *      convenience URL on current default params. Short TTL cache since
 *      defaults may evolve; resolves to a stored artifact under the hood.
 */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const seg = path?.[0] ?? "";

    // 1) Permanent hash artifact
    const artifactMatch = /^([0-9a-f]{40})\.(svg|png|txt)$/.exec(seg);
    if (artifactMatch) {
      const { store } = await import("@/lib/store");
      const artifact = await store.get(artifactMatch[1]);
      if (!artifact || artifact.ext !== artifactMatch[2]) {
        return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
      }
      const body = Buffer.isBuffer(artifact.data)
        ? artifact.data
        : Buffer.from(String(artifact.data), "utf8");
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: {
          "Content-Type": artifact.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: `"${artifact.hash}"`,
        },
      });
    }

    // 2) Live convenience URL: /api/avatar/<username>?style=&seed=&format=&...
    if (USERNAME_PATTERN.test(seg)) {
      const ip = clientIp(req);
      const rl = rateLimit(`live:${ip}`, 60, 60_000);
      if (!rl.ok) throw new AppError("RATE_LIMITED", 429, `retry in ${rl.retryAfterSec}s`);

      const url = new URL(req.url);
      const params: Record<string, unknown> = {};
      url.searchParams.forEach((value, key) => {
        if (key === "style" || key === "seed" || key === "format") return;
        params[key] = value;
      });

      const seedParam = url.searchParams.get("seed");
      const request: RenderRequest = {
        username: seg,
        styleId: url.searchParams.get("style") ?? "halftone",
        params,
        seed: seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : undefined,
        format: (url.searchParams.get("format") as RenderRequest["format"]) ?? undefined,
      };

      const result = await renderArtifact(request);
      const { store: s } = await import("@/lib/store");
      const stored = await s.get(result.hash);
      if (!stored) throw new AppError("RENDER_FAILED", 500);

      const body = Buffer.isBuffer(stored.data)
        ? stored.data
        : Buffer.from(String(stored.data), "utf8");
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: {
          "Content-Type": stored.contentType,
          // NOT immutable — default params could evolve (spec §8).
          "Cache-Control": "public, max-age=300",
          ETag: `"${result.hash}"`,
        },
      });
    }

    throw new AppError("BAD_REQUEST", 400, `unrecognized path segment`);
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError("RENDER_FAILED", 500);
    if (e.status >= 500) console.error("[avatar]", err);
    return new Response(e.userMessage, {
      status: e.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
