import sharp from "sharp";
import { analyzeImage } from "./analysis";
import { composeBannerSvg } from "./banner";
import { AppError, toAppError } from "./errors";
import {
  defaultSeedFor,
  downloadAvatar,
  fetchContributions,
  fetchGitHubProfile,
  USERNAME_PATTERN,
  type GitHubProfile,
} from "./github";
import { artifactIdentityHash } from "./hash";
import { CONTENT_TYPES, store } from "./store";
import { coerceParams } from "./styles/params";
import { getStyle } from "./styles/registry";
import {
  HIDDEN_CONTRIB_KEY,
  HIDDEN_USERNAME_KEY,
  type AvatarStyle,
} from "./styles/types";

export interface RenderRequest {
  username: string;
  styleId: string;
  params?: Record<string, unknown>;
  seed?: number;
  format?: "svg" | "png" | "text" | "txt";
}

export interface RenderedArtifact {
  hash: string;
  urlPath: string; // /api/avatar/<hash>.<ext>
  ext: "svg" | "png" | "txt";
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  cached: boolean;
  textContent?: string;
}

/**
 * Deterministic render core shared by POST /api/render and the live
 * GET /api/avatar/<username> convenience route (spec §8).
 *
 * hash(username + avatarUrl + styleId + canonicalParams + seed) → check store →
 * hit: serve; miss: generate → persist → serve. Same identity = byte-identical.
 */
export async function renderArtifact(req: RenderRequest): Promise<RenderedArtifact & { profile: GitHubProfile; style: AvatarStyle }> {
  try {
    if (!USERNAME_PATTERN.test(req.username ?? "")) throw new AppError("INVALID_INPUT");
    const style = getStyle(req.styleId);
    if (!style) throw new AppError("STYLE_NOT_FOUND", 404);

    // Normalize format against the style's supported list.
    const requested = normalizeFormat(req.format);
    const format =
      requested && style.supportedFormats.includes(requested)
        ? requested
        : style.supportedFormats[0];

    const seedRaw = req.seed ?? defaultSeedFor(req.username);
    const seed =
      typeof seedRaw === "number" && Number.isFinite(seedRaw)
        ? Math.abs(Math.trunc(seedRaw)) % 2147483647
        : defaultSeedFor(req.username);

    const profile = await fetchGitHubProfile(req.username);
    const avatarBuf = await downloadAvatar(profile.avatarUrl);
    const analysis = await analyzeImage(avatarBuf, { size: 512 });

    let params = coerceParams(style, req.params);
    params = injectHiddenParams(style.id, params, profile.username);
    if (style.id === "heatmap") {
      params = await injectContributionData(params, profile.username);
    }

    const hash = artifactIdentityHash({
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      styleId: style.id,
      params,
      seed,
    });

    const existing = await store.get(hash);
    if (existing) return toResult(existing, true, style, profile);

    const artwork = await produce(style, analysis, params, seed, format, profile);
    const ext: "svg" | "png" | "txt" =
      artwork.format === "text" ? "txt" : artwork.format;
    await store.put({
      hash,
      ext,
      contentType: CONTENT_TYPES[ext],
      data: artwork.data,
      meta: {
        username: profile.username,
        styleId: style.id,
        seed,
        width: artwork.width,
        height: artwork.height,
        createdAt: new Date().toISOString(),
      },
    });
    const stored = await store.get(hash);
    if (!stored) throw new AppError("RENDER_FAILED", 500, "store write failed");
    return toResult(stored, false, style, profile);
  } catch (err) {
    throw toAppError(err);
  }
}

/** Hidden server-side params (spec §7: styles stay pure over AnalysisResult). */
export function injectHiddenParams(
  styleId: string,
  coerced: Record<string, unknown>,
  username: string
): Record<string, unknown> {
  const out = { ...coerced };
  if (styleId === "charmosa") {
    out[HIDDEN_USERNAME_KEY] = username.toLowerCase().replace(/[^a-z0-9-]/g, "");
  }
  return out;
}

/**
 * Contribution data for the heatmap style is fetched server-side and injected
 * as a validated hidden param (empty string when unavailable — the style falls
 * back to pure luminance levels). It participates in the identity hash, so a
 * calendar change naturally produces a new artifact.
 */
async function injectContributionData(
  params: Record<string, unknown>,
  username: string
): Promise<Record<string, unknown>> {
  const useContribs = params["useContributions"] === true;
  if (!useContribs) return { ...params, [HIDDEN_CONTRIB_KEY]: "" };
  const data = await fetchContributions(username).catch(() => null);
  const encoded = data ? data.counts.join(",").slice(0, 60000) : "";
  return { ...params, [HIDDEN_CONTRIB_KEY]: encoded };
}

function normalizeFormat(f: unknown): "svg" | "png" | "text" | undefined {
  if (f === "svg" || f === "png") return f;
  if (f === "text" || f === "txt") return "text";
  return undefined;
}

async function produce(
  style: AvatarStyle,
  analysis: Awaited<ReturnType<typeof analyzeImage>>,
  params: Record<string, unknown>,
  seed: number,
  format: "svg" | "png" | "text",
  profile: GitHubProfile
): Promise<{ format: "svg" | "png" | "text"; data: string | Buffer; width: number; height: number }> {
  if (format === "text") {
    if (!style.generateText) throw new AppError("BAD_REQUEST", 400, `style ${style.id} has no text output`);
    const t = style.generateText(analysis, params, seed);
    return { format: "text", data: t.rows.join("\n"), width: t.width, height: t.rows.length };
  }
  const base = style.generate(analysis, params, seed);

  // If banner card layout with right-side text is enabled
  if (params.bannerEnabled === true && typeof base.data === "string") {
    const banner = composeBannerSvg(base.data, {
      username: profile.username,
      title: typeof params.bannerTitle === "string" ? params.bannerTitle : profile.displayName || profile.username,
      subtitle: typeof params.bannerSubtitle === "string" ? params.bannerSubtitle : undefined,
      bio: typeof params.bannerBio === "string" ? params.bannerBio : profile.bio || undefined,
      tags: typeof params.bannerTags === "string" ? params.bannerTags : undefined,
      theme: typeof params.bannerTheme === "string" ? (params.bannerTheme as "terminal" | "blueprint" | "cyber" | "minimal") : undefined,
      background: typeof params.background === "string" ? params.background : undefined,
    });
    if (format === "png") {
      const buf = await sharp(Buffer.from(banner.data)).png().toBuffer();
      return { format: "png", data: buf, width: banner.width, height: banner.height };
    }
    return { format: "svg", data: banner.data, width: banner.width, height: banner.height };
  }

  if (format === "png") {
    const buf = await sharp(Buffer.from(base.data as string)).png().toBuffer();
    return { format: "png", data: buf, width: base.width, height: base.height };
  }
  return base;
}

function toResult(
  stored: NonNullable<Awaited<ReturnType<typeof store.get>>>,
  cached: boolean,
  style: AvatarStyle,
  _profile: GitHubProfile
) {
  const isText = stored.ext === "txt";
  return {
    hash: stored.hash,
    urlPath: `/api/avatar/${stored.hash}.${stored.ext}`,
    ext: stored.ext,
    contentType: stored.contentType,
    width: Number(stored.meta.width ?? 0),
    height: Number(stored.meta.height ?? 0),
    bytes: Buffer.isBuffer(stored.data) ? stored.data.byteLength : Buffer.byteLength(String(stored.data)),
    cached,
    textContent: isText ? String(stored.data) : undefined,
    style,
    profile: _profile,
  };
}
