"use server";

import { db } from "@/db/client";
import { subscriptions, watchlistItems, accounts, bucketAllocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listBudgets } from "./budgets";
import { listConnections } from "./connections";
import { getPortfolioItems } from "./dashboard";
import { getBaseCurrency } from "./settings";
import { reconciliationState } from "@/lib/accounting";
import { nextCharge, daysUntil, isCadence } from "@/lib/accounting/subscriptions";
import {
  budgetAlerts,
  subscriptionAlerts,
  accountAlerts,
  connectionAlerts,
  watchlistAlerts,
  portfolioAlerts,
  sortAlerts,
  type Alert,
} from "@/lib/alerts/rules";

/**
 * Everything worth telling you about, gathered from what the app already knows.
 *
 * It reads through the same actions the pages read — `listBudgets`,
 * `listConnections`, `getPortfolioItems` — rather than querying its own way.
 * An alert that disagreed with the page it points at would be worse than no
 * alert, and the only way to guarantee it cannot is to read the same source.
 *
 * Every rule lives in `src/lib/alerts/rules.ts` and is tested there. This
 * function does no deciding; it only fetches and shapes.
 */
export async function getAlerts(): Promise<{ alerts: Alert[]; currency: string }> {
  const today = new Date();

  const [budgets, connections, portfolio, base, subs, watch, accountRows, allocations] =
    await Promise.all([
      listBudgets(),
      listConnections(),
      getPortfolioItems(),
      getBaseCurrency(),
      db.select().from(subscriptions).where(eq(subscriptions.active, true)),
      db.select().from(watchlistItems),
      db.select().from(accounts).where(eq(accounts.active, true)),
      db.select().from(bucketAllocations),
    ]);

  const alerts: Alert[] = [];

  alerts.push(
    ...budgetAlerts(
      budgets.items.map((b) => ({
        id: b.id,
        category: b.name,
        currency: budgets.baseCurrency,
        spent: b.spent,
        available: b.available,
        progress: b.progress,
      }))
    )
  );

  alerts.push(
    ...subscriptionAlerts(
      subs.map((s) => {
        const cadence = isCadence(s.cadence) ? s.cadence : "monthly";
        // The stored date if the app has one, otherwise worked out from the
        // cadence. `nextCharge` returns null when there is no anchor, and a
        // subscription with no date deliberately produces no alert.
        const next = s.nextChargeAt ?? nextCharge(s.createdAt ?? null, cadence, today);
        return {
          id: s.id,
          name: s.name,
          amount: Number(s.amount),
          currency: s.currency,
          daysUntil: daysUntil(next, today),
        };
      })
    )
  );

  alerts.push(
    ...accountAlerts(
      accountRows.map((a) => {
        const state = reconciliationState(
          {
            id: a.id,
            balance: Number(a.balance),
            investedValue: a.investedValue === null ? null : Number(a.investedValue),
          },
          allocations.map((x) => ({
            accountId: x.accountId,
            amount: Number(x.amount),
          })),
          a.lastManualUpdate ?? a.createdAt,
          today
        );

        /**
         * Only manual accounts can be stale in the sense that matters: a synced
         * one is answered for by its connection, and the connection rules cover
         * that. Saying both would be two alerts about one silence.
         */
        const synced = a.lastManualUpdate === null;
        const days = synced
          ? null
          : Math.floor((today.getTime() - (a.lastManualUpdate as Date).getTime()) / 86_400_000);

        return {
          id: a.id,
          name: a.name,
          daysSinceUpdate: days,
          overAllocated: state === "OVERALLOCATED",
        };
      })
    )
  );

  alerts.push(
    ...connectionAlerts(
      connections.map((c) => ({
        id: c.id,
        platform: c.platform,
        freshness: c.freshness,
        lastError: c.lastSyncError ?? null,
      }))
    )
  );

  alerts.push(
    ...watchlistAlerts(
      watch.map((w) => ({
        id: w.id,
        symbol: w.symbol,
        currentPrice: w.currentPrice === null ? null : Number(w.currentPrice),
        targetPrice: w.targetPrice === null ? null : Number(w.targetPrice),
      }))
    )
  );

  /**
   * `atCost` is the app's own flag for a holding whose value is what it cost
   * because nothing priced it — the same rows the Investments table labels.
   * Untagged value is what has no asset type, so it counts in the total and in
   * no risk breakdown.
   */
  alerts.push(
    ...portfolioAlerts({
      unpricedCount: portfolio.items.filter((i) => i.atCost).length,
      untaggedValue:
        Math.round(
          (portfolio.items
            .filter((i) => i.assetType === null)
            .reduce((s, i) => s + i.value, 0) +
            Number.EPSILON) * 100
        ) / 100,
      currency: base,
    })
  );

  return { alerts: sortAlerts(alerts), currency: base };
}
