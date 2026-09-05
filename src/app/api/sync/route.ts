import { NextResponse } from "next/server";
import { syncAllConnections } from "@/actions/connections";
import { refreshRates } from "@/actions/fx";
import { refreshQuotedPrices } from "@/actions/quotes";
import { REPRICE_AFTER_MINUTES } from "@/lib/quotes/staleness";

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

  /**
   * Prices, which this route did not refresh at all.
   *
   * It updated exchange rates and connected platforms and stopped there, so a
   * holding typed in by hand was priced only when somebody opened the app and
   * pressed a button. On a real account that left every quoted price fifteen
   * days old — past `MAX_PRICE_AGE_DAYS`, which is the app's own threshold for
   * a price it still believes.
   *
   * Only the ones actually due: the schedule decides how often to look, and
   * `needsRepricing` decides what is worth asking for.
   */
  const prices = await refreshQuotedPrices({ olderThanMinutes: REPRICE_AFTER_MINUTES });
  const results = await syncAllConnections("scheduled");
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json(
    {
      synced: results.length,
      failed: failed.length,
      fxUpdated: fx.ok,
      /** What it did, not only that it ran — a stuck price is invisible otherwise. */
      pricesAttempted: prices.attempted,
      pricesUpdated: prices.updated,
      results,
    },
    { status: failed.length > 0 ? 207 : 200 }
  );
}
