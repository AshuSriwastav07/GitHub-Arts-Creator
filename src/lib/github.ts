import { AppError } from "./errors";

/**
 * Server-side GitHub data access (spec §4).
 * Credentials, if configured, live only in server env vars (GITHUB_TOKEN)
 * and are never shipped to the client bundle.
 */
export interface GitHubProfile {
  username: string;
  avatarUrl: string;
  displayName: string;
  bio: string;
  htmlUrl: string;
}

export interface ContributionData {
  counts: number[];
  max: number;
}

// GitHub username rules: max 39 chars, alphanumerics and single hyphens,
// cannot start/end with a hyphen.
export const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/**
 * Accepts a bare username ("octocat", "@octocat") or a full profile URL
 * ("https://github.com/octocat"). Rejects non-github.com hosts, org/repo-shaped
 * or deeper paths, and anything that isn't a syntactically valid username.
 */
export function parseGitHubInput(raw: string): string {
  let input = (raw ?? "").trim();
  if (!input) throw new AppError("INVALID_INPUT");

  // Tolerate protocol-less github.com/... URLs
  if (/^(www\.)?github\.com\//i.test(input)) input = `https://${input}`;

  if (!/^https?:\/\//i.test(input)) {
    const name = input.replace(/^@/, "").replace(/\/+$/, "");
    if (!USERNAME_PATTERN.test(name) || name.includes("/")) {
      throw new AppError("INVALID_INPUT");
    }
    return name;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("INVALID_INPUT");
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "github.com") throw new AppError("INVALID_INPUT", 400, `host ${host}`);

  const segments = url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (segments.length !== 1) {
    // e.g. /user/repos, /orgs/foo — profile-shaped paths only
    throw new AppError("INVALID_INPUT");
  }
  const name = segments[0];
  if (!USERNAME_PATTERN.test(name)) throw new AppError("INVALID_INPUT", 400, `username ${name}`);
  return name;
}

/* ------------------------------------------------------------------ */
/* Profile lookup with cache                                           */
/* ------------------------------------------------------------------ */

const PROFILE_TTL_MS = 60 * 60 * 1000; // 1 hour
const profileCache = new Map<string, { profile: GitHubProfile; expires: number }>();

function ghHeaders(accept: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept,
    "User-Agent": "github-avatar-art/1.0",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghFetch(url: string, accept: string, timeoutMs = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: ghHeaders(accept), signal: ctrl.signal, redirect: "follow" });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError("NETWORK_ERROR", 504, "timeout");
    }
    throw new AppError("NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGitHubProfile(usernameOrUrl: string): Promise<GitHubProfile> {
  const username = parseGitHubInput(usernameOrUrl);
  const key = username.toLowerCase();
  const hit = profileCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.profile;

  let res: Response;
  try {
    res = await ghFetch(`https://api.github.com/users/${encodeURIComponent(username)}`, "application/vnd.github+json");
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("NETWORK_ERROR", 502);
  }

  if (res.status === 404) {
    // GitHub returns 404 for both deleted and suspended accounts; one clear message covers both.
    throw new AppError("USER_NOT_FOUND", 404);
  }
  if (res.status === 403 || res.status === 429) {
    if ((res.headers.get("x-ratelimit-remaining") ?? "1") === "0") {
      throw new AppError("GITHUB_RATE_LIMITED", 429);
    }
    throw new AppError("GITHUB_ERROR", 502, `status ${res.status}`);
  }
  if (!res.ok) throw new AppError("GITHUB_ERROR", 502, `status ${res.status}`);

  let data: {
    login?: string;
    avatar_url?: string;
    name?: string | null;
    bio?: string | null;
    html_url?: string;
    type?: string;
  };
  try {
    data = await res.json();
  } catch {
    throw new AppError("GITHUB_ERROR", 502, "bad json");
  }
  if (!data.login || !data.avatar_url) throw new AppError("USER_NOT_FOUND", 404);

  const profile: GitHubProfile = {
    username: data.login,
    avatarUrl: data.avatar_url,
    displayName: data.name?.trim() || data.login,
    bio: typeof data.bio === "string" ? data.bio : "",
    htmlUrl: data.html_url ?? `https://github.com/${data.login}`,
  };
  profileCache.set(key, { profile, expires: Date.now() + PROFILE_TTL_MS });
  if (profileCache.size > 2000) profileCache.clear();
  return profile;
}

/* ------------------------------------------------------------------ */
/* Avatar download with validation + short-lived LRU cache             */
/* ------------------------------------------------------------------ */

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

const AVATAR_TTL_MS = 10 * 60 * 1000;
const avatarCache = new Map<string, { buf: Buffer; expires: number }>();

function withSizeParam(url: string, size: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set("size", String(size));
    return u.toString();
  } catch {
    return url;
  }
}

export async function downloadAvatar(avatarUrl: string): Promise<Buffer> {
  const hit = avatarCache.get(avatarUrl);
  if (hit && hit.expires > Date.now()) return hit.buf;

  let res: Response;
  try {
    res = await ghFetch(withSizeParam(avatarUrl, 1024), "*/*", 15000);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("AVATAR_UNREACHABLE", 502);
  }
  if (!res.ok) throw new AppError("AVATAR_UNREACHABLE", 502, `status ${res.status}`);

  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type && !ALLOWED_IMAGE_TYPES.has(type)) {
    throw new AppError("IMAGE_INVALID", 415, `content-type ${type}`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength === 0) throw new AppError("IMAGE_INVALID");
  if (ab.byteLength > MAX_AVATAR_BYTES) throw new AppError("IMAGE_INVALID", 413, "avatar too large");

  const buf = Buffer.from(ab);
  avatarCache.set(avatarUrl, { buf, expires: Date.now() + AVATAR_TTL_MS });
  while (avatarCache.size > 64) {
    const oldest = avatarCache.keys().next().value;
    if (oldest === undefined) break;
    avatarCache.delete(oldest);
  }
  return buf;
}

/* ------------------------------------------------------------------ */
/* Contribution calendar (best-effort scrape of the public page).      */
/* The Heatmap style falls back gracefully when this is unavailable.   */
/* ------------------------------------------------------------------ */

const CONTRIB_TTL_MS = 6 * 60 * 60 * 1000;
const CONTRIB_NEG_TTL_MS = 30 * 60 * 1000;
const contribCache = new Map<string, { counts: number[]; max: number; expires: number }>();

export async function fetchContributions(username: string): Promise<ContributionData | null> {
  const key = username.toLowerCase();
  const cached = contribCache.get(key);
  if (cached && Date.now() < cached.expires) {
    // Empty counts = negative cache entry (unavailable last time we looked).
    return cached.counts.length > 0 ? { counts: cached.counts, max: cached.max } : null;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
        headers: ghHeaders("text/html"),
        signal: ctrl.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    const html = await res.text();
    const counts: number[] = [];
    const re = /data-count="(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) counts.push(parseInt(m[1], 10));
    if (counts.length < 28) throw new Error("no contribution rects found");
    let max = 0;
    for (const c of counts) if (c > max) max = c;
    contribCache.set(key, { counts, max, expires: Date.now() + CONTRIB_TTL_MS });
    return { counts, max };
  } catch {
    // Negative cache so we don't hammer the page when data is unavailable.
    contribCache.set(key, { counts: [], max: 0, expires: Date.now() + CONTRIB_NEG_TTL_MS });
    return null;
  }
}

/** Stable pseudo-random seed derived from a username (for default seeds). */
export function defaultSeedFor(username: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < username.length; i++) {
    h ^= username.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 999_999_999) + 1;
}
