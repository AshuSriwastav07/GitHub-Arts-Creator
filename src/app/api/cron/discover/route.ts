import { NextResponse } from "next/server";
import { runCodeSearchDiscovery } from "@/lib/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled GitHub Code Search Discovery Job (spec §5).
 * Discovers real repositories that embed generated avatar art in their README.md.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, require either Bearer auth or Vercel cron header
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers.get("x-vercel-cron") !== "1") {
    // In local development or manual runs without secret, allow testing with query flag ?run=1
    const allowManual = url.searchParams.get("run") === "1" && process.env.NODE_ENV !== "production";
    if (!allowManual) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runCodeSearchDiscovery();
  return NextResponse.json(result);
}
