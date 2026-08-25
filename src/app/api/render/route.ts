import { NextResponse } from "next/server";
import { AppError, toAppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { renderArtifact } from "@/lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/render — final deterministic generation.
 * Body: { username, styleId, params?, seed?, format? }
 * Returns permanent artifact URL + copy-ready README embeds (spec §9).
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`render:${ip}`, 30, 60_000);
    if (!rl.ok) throw new AppError("RATE_LIMITED", 429, `retry in ${rl.retryAfterSec}s`);

    const body = (await req.json().catch(() => null)) as
      | { username?: unknown; styleId?: unknown; params?: unknown; seed?: unknown; format?: unknown }
      | null;
    if (!body || typeof body !== "object") throw new AppError("BAD_REQUEST");
    if (typeof body.username !== "string" || typeof body.styleId !== "string") {
      throw new AppError("BAD_REQUEST", 400, "username and styleId required");
    }

    const result = await renderArtifact({
      username: body.username,
      styleId: body.styleId,
      params:
        body.params && typeof body.params === "object"
          ? (body.params as Record<string, unknown>)
          : {},
      seed: typeof body.seed === "number" ? body.seed : undefined,
      format: typeof body.format === "string" ? (body.format as "svg" | "png" | "text" | "txt") : undefined,
    });

    // Heatmap contribution blending happens after basic validation but before
    // hashing; contribution data changes produce new artifacts (correctly).
    const origin = publicOrigin(req);
    const alt = `${result.profile.username}'s GitHub avatar art — ${result.style.name}`;
    const url = `${origin}${result.urlPath}`;
    const markdown = {
      centered: `<p align="center">\n  <img src="${url}" width="300" alt="${alt}" />\n</p>`,
      plain: `![${alt}](${url})`,
      ...(result.textContent !== undefined
        ? { codeBlock: "```\n" + result.textContent + "\n```" }
        : {}),
    };

    return NextResponse.json({
      hash: result.hash,
      url,
      urlPath: result.urlPath,
      format: result.ext === "txt" ? "text" : result.ext,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      cached: result.cached,
      alt,
      markdown,
      textContent: result.textContent,
      styleName: result.style.name,
    });
  } catch (err) {
    const e = toAppError(err);
    if (e.status >= 500) console.error("[render]", err);
    return NextResponse.json({ error: { code: e.code, message: e.userMessage } }, { status: e.status });
  }
}

function publicOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}
