import { NextResponse } from "next/server";
import { dataLayer } from "@/lib/data-layer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/used-in-the-wild — real repositories embedding the generated art (spec §5).
 * Returns array of discovered repository cards.
 */
export async function GET() {
  const usages = await dataLayer.getDiscoveredUsages();
  return NextResponse.json(
    { usages },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
