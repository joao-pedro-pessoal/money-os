import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { investmentsFor } from "@/actions/releaseEdition";
import { asUser, db } from "@/db/client";
import { users } from "@/db/schema";
import { syncAllConnections } from "@/actions/connections";
import { refreshRates } from "@/actions/fx";
import { refreshQuotedPrices } from "@/actions/quotes";
import { REPRICE_AFTER_MINUTES } from "@/lib/quotes/staleness";

export const dynamic = "force-dynamic";

/**
 * Schedulable sync endpoint.
 *
 * Protected by a shared secret rather than the session cookie, so a scheduler
 * can call it without a browser: POST from the home copy's script (SYNC_SECRET),
 * GET from the host's cron, which sends `Authorization: Bearer $CRON_SECRET`. With
 * neither set the route refuses to run at all — it must never be an
 * unauthenticated way to trigger outbound requests.
 *
 * GET takes the bearer only, so a link or a secret left in an address cannot
 * start it.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  return sync([request.headers.get("x-sync-secret"), bearerOf(request), url.searchParams.get("secret")]);
}

export async function GET(request: Request) {
  return sync([bearerOf(request)]);
}

function bearerOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Compared as digests, so neither the length nor the first wrong character shows in the timing. */
const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

async function sync(provided: (string | null)[]) {
  const secrets = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) {
    return NextResponse.json(
      { error: "SYNC_SECRET is not configured; scheduled sync is disabled." },
      { status: 503 }
    );
  }
  if (!provided.some((given) => given !== null && secrets.some((secret) => sameSecret(given, secret)))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /**
   * Once per account, as that account: rates, prices and connections are all
   * each person's own rows, and a scheduler has no session to say whose. One
   * account at a time, so a slow platform delays the rest rather than piling
   * every account's requests onto it at once.
   */
  const accounts = await db.select({ id: users.id }).from(users);
  const totals = { fxUpdated: 0, pricesAttempted: 0, pricesUpdated: 0 };
  const results: Awaited<ReturnType<typeof syncAllConnections>> = [];
  for (const { id } of accounts) {
    await asUser(id, async () => {
      const fx = await refreshRates();
      if (fx.ok) totals.fxUpdated++;
      // Rates are everyone's; what follows is investments, which this edition may not give this person.
      if (!investmentsFor(id)) return;

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
      results.push(...(await syncAllConnections("scheduled")));
      totals.pricesAttempted += prices.attempted;
      totals.pricesUpdated += prices.updated;
    });
  }
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json(
    {
      synced: results.length,
      failed: failed.length,
      accounts: accounts.length,
      /** Accounts whose rates were refreshed. */
      fxUpdated: totals.fxUpdated,
      /** What it did, not only that it ran — a stuck price is invisible otherwise. */
      pricesAttempted: totals.pricesAttempted,
      pricesUpdated: totals.pricesUpdated,
      results,
    },
    { status: failed.length > 0 ? 207 : 200 }
  );
}
