import { NextResponse } from "next/server";
import { dataLayer } from "@/lib/data-layer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats — real-time usage counter (spec §1).
 * Returns { totalGenerations, uniqueUsernames }, cached for 60s.
 */
export async function GET() {
  const stats = await dataLayer.getStats();
  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
