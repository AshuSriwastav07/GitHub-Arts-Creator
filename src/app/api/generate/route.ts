import { NextResponse } from "next/server";
import { analyzeImage } from "@/lib/analysis";
import { AppError, toAppError } from "@/lib/errors";
import {
  defaultSeedFor,
  downloadAvatar,
  fetchGitHubProfile,
} from "@/lib/github";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { injectHiddenParams } from "@/lib/render";
import { STYLES } from "@/lib/styles/registry";
import { defaultParams, withOverrides } from "@/lib/styles/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/generate — entry point of the flow (spec §3).
 * Body: { input: "<github profile url or username>" }
 * Fetches the profile + avatar server-side, runs the shared analysis pipeline
 * at low resolution, renders ALL styles as cheap previews concurrently-friendly
 * and returns them with each style's param schema for the UI.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`generate:${ip}`, 20, 60_000);
    if (!rl.ok) throw new AppError("RATE_LIMITED", 429, `retry in ${rl.retryAfterSec}s`);

    const body = (await req.json().catch(() => null)) as { input?: unknown } | null;
    const input = typeof body?.input === "string" ? body.input : "";
    if (!input.trim()) throw new AppError("INVALID_INPUT");

    // validate & parse → fetch profile → resolve avatar → download + normalize
    const profile = await fetchGitHubProfile(input);
    const avatarBuf = await downloadAvatar(profile.avatarUrl);
    const analysis = await analyzeImage(avatarBuf, { size: 144 });

    const previews = STYLES.map((style) => {
      try {
        let params = withOverrides(defaultParams(style), PREVIEW_OVERRIDES[style.id] ?? {});
        params = injectHiddenParams(style.id, params, profile.username);
        const art = style.generate(analysis, params, previewSeedFor(profile.username, style.id));
        return {
          id: style.id,
          name: style.name,
          family: style.family,
          description: style.description,
          estimatedCost: style.estimatedCost,
          supportedFormats: style.supportedFormats,
          paramSchema: style.paramSchema,
          defaults: params,
          defaultSeed: defaultSeedFor(profile.username),
          svg: typeof art.data === "string" ? art.data : "",
          error: false,
        };
      } catch (styleErr) {
        console.error(`[generate] preview failed for ${style.id}:`, styleErr);
        return {
          id: style.id,
          name: style.name,
          family: style.family,
          description: style.description,
          estimatedCost: style.estimatedCost,
          supportedFormats: style.supportedFormats,
          paramSchema: style.paramSchema,
          defaults: {},
          defaultSeed: defaultSeedFor(profile.username),
          svg: "",
          error: true,
        };
      }
    });

    return NextResponse.json({
      profile: {
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        htmlUrl: profile.htmlUrl,
        avatarUrl: profile.avatarUrl,
      },
      previews,
    });
  } catch (err) {
    const e = toAppError(err);
    if (e.status >= 500) console.error("[generate]", err);
    return NextResponse.json({ error: { code: e.code, message: e.userMessage } }, { status: e.status });
  }
}

/** Cheap low-res settings per style so all previews stay well under ~3s combined. */
const PREVIEW_OVERRIDES: Record<string, Record<string, unknown>> = {
  halftone: { resolution: 40 },
  lowpoly: { pointDensity: 200 },
  lineart: { detail: 4 },
  charmosa: { cols: 72 },
  hexmosaic: { cols: 32 },
  pixelart: { cols: 48 },
  heatmap: {},
};

function previewSeedFor(username: string, styleId: string): number {
  return (defaultSeedFor(username) ^ styleId.length) % 2147483647;
}
