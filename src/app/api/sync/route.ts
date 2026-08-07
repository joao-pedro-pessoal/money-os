import { NextResponse } from "next/server";
import { syncAllConnections } from "@/actions/connections";
import { refreshRates } from "@/actions/fx";

export const dynamic = "force-dynamic";

/**
 * Schedulable sync endpoint.
 *
 * Protected by a shared secret rather than the session cookie, so a scheduler
 * (Windows Task Scheduler, cron, a Vercel cron job) can call it without a
 * browser. If SYNC_SECRET isn't set the route refuses to run at all — it must
 * never be an unauthenticated way to trigger outbound requests.
 */
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SYNC_SECRET is not configured; scheduled sync is disabled." },
      { status: 503 }
    );
  }

  const provided =
    request.headers.get("x-sync-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fx = await refreshRates();
  const results = await syncAllConnections("scheduled");
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json(
    { synced: results.length, failed: failed.length, fxUpdated: fx.ok, results },
    { status: failed.length > 0 ? 207 : 200 }
  );
}
