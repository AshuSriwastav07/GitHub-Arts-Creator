import { NextResponse } from "next/server";
import { dataLayer } from "@/lib/data-layer";
import { AppError, toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gallery — paginated list of public opt-in creations (spec §3).
 * Query params: style, cursor, limit.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const style = url.searchParams.get("style") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "24", 10)));

    const result = await dataLayer.getPublicGallery(style, cursor, limit);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const e = toAppError(err);
    return NextResponse.json({ error: { code: e.code, message: e.userMessage } }, { status: e.status });
  }
}

/**
 * POST /api/gallery — opt-in to public showcase or request removal (spec §3).
 * Body: { action: "opt-in" | "report", hash, username, styleId, isPublic?, reason? }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      action?: string;
      hash?: string;
      username?: string;
      styleId?: string;
      isPublic?: boolean;
      reason?: string;
    } | null;

    if (!body || !body.hash) {
      throw new AppError("BAD_REQUEST", 400, "hash required");
    }

    if (body.action === "report") {
      const removed = await dataLayer.reportGalleryItem(body.hash, body.reason);
      return NextResponse.json({ ok: true, removed });
    }

    // Default action: opt-in / opt-out
    const isPublic = body.isPublic !== false;
    const ok = await dataLayer.setGalleryOptIn(
      body.hash,
      body.username || "developer",
      body.styleId || "halftone",
      isPublic
    );

    return NextResponse.json({ ok, isPublic });
  } catch (err) {
    const e = toAppError(err);
    return NextResponse.json({ error: { code: e.code, message: e.userMessage } }, { status: e.status });
  }
}
