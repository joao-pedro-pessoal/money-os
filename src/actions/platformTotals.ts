/**
 * What each connected account actually holds on its platform.
 *
 * The stored `balance` is perps equity only — spot lives in Portfolio Value —
 * so an account whose money is all in USDC reads as 0, which looks broken even
 * though Net Worth is right. This gives the display layer the real figure
 * without changing what anything counts.
 *
 * Lives apart from `connections.ts` so that `accounts.ts` can read it. Free
 * cash on a connected account is the platform's answer, not the stored
 * balance's, and `connections.ts` already imports `accounts.ts` — putting this
 * where the sync lives would have made that a cycle.
 */

import { db } from "@/db/client";
import { accountConnections, platformBalances, positions } from "@/db/schema";
import { isCurrencyCode, toBase } from "@/lib/fx";
import { getRates } from "@/actions/fx";
import { marginView } from "@/lib/connectors/margin";

export async function getAccountPlatformTotals() {
  const [conns, balances, pos, rates] = await Promise.all([
    db.select().from(accountConnections),
    db.select().from(platformBalances),
    db.select().from(positions),
    getRates(),
  ]);

  const byAccount = new Map<
    string,
    {
      equity: number;
      spot: number;
      /** The part of `spot` that is money beside the equity, not inside it. */
      spotOnTop: number;
      total: number;
      unrealizedPnl: number;
      positions: number;
      /** Free to trade with: equity minus what's backing open positions. */
      available: number;
      marginUsed: number;
    }
  >();

  for (const c of conns) {
    const mineBalances = balances.filter((b) => b.connectionId === c.id);

    /**
     * Coin balances split by whether they are money *beside* the account's
     * value or a breakdown *of* it. The connector states which — see
     * `balancesAreSeparatePool`, stored per balance as `countsInPortfolio`.
     *
     * The total used to add every balance to the equity unconditionally, which
     * double counted every platform that reports its cash as part of its own
     * total: Trading 212's free cash (0.13 counted twice), IBKR's EUR (1.75),
     * and — since Hyperliquid moved to a unified account — its entire USDC
     * balance, which is why that account read 109.91 against the venue's 92.49.
     */
    /**
     * Converted before adding, because a cash row is in its own currency.
     *
     * The stored value for a EUR balance is an amount of euros, and this total
     * is denominated in the platform's reporting currency. Adding them raw made
     * IBKR's 1.75 EUR into 1.75 USD — the same mistake, in miniature, as the
     * five currency-mixing sums fixed earlier: small here only because the
     * balance is small.
     */
    const platformCurrency = c.reportingCurrency ?? "USD";
    const valueIn = (b: (typeof mineBalances)[number]): number => {
      if (b.usdValue === null) return 0;
      const from = isCurrencyCode(b.coin) ? b.coin.toUpperCase() : platformCurrency;
      return toBase(Number(b.usdValue), from, rates, platformCurrency) ?? 0;
    };

    const spotOnTop = mineBalances
      .filter((b) => b.countsInPortfolio)
      .reduce((sum: number, b) => sum + valueIn(b), 0);
    const spotInside = mineBalances
      .filter((b) => !b.countsInPortfolio)
      .reduce((sum: number, b) => sum + valueIn(b), 0);

    // Shown as the cash part of the account, wherever it lives.
    const spot = spotOnTop + spotInside;

    const mine = pos.filter((p) => p.connectionId === c.id);
    const unrealizedPnl = mine.reduce(
      (s, p) => s + (p.unrealizedPnl === null ? 0 : Number(p.unrealizedPnl)),
      0
    );

    const equity = Number(c.lastEquity ?? 0);
    const existing = byAccount.get(c.accountId);

    // Equity is not availability. Open positions lock part of it as margin, so
    // "free" here means what could actually back a new trade — the spot pool
    // is separate money and adds on top.
    const view = marginView({
      equity,
      marginUsed: c.lastMarginUsed === null ? null : Number(c.lastMarginUsed),
      withdrawable: c.lastWithdrawable === null ? null : Number(c.lastWithdrawable),
    });

    byAccount.set(c.accountId, {
      equity: round2((existing?.equity ?? 0) + equity),
      spot: round2((existing?.spot ?? 0) + spot),
      spotOnTop: round2((existing?.spotOnTop ?? 0) + spotOnTop),
      // Only money that sits outside the account's own value is added to it.
      total: round2((existing?.total ?? 0) + equity + spotOnTop),
      unrealizedPnl: round2((existing?.unrealizedPnl ?? 0) + unrealizedPnl),
      positions: (existing?.positions ?? 0) + mine.length,
      // Same rule for availability: cash already inside the equity is inside
      // the platform's own withdrawable figure too, so adding it double counts.
      available: round2((existing?.available ?? 0) + view.available + spotOnTop),
      marginUsed: round2((existing?.marginUsed ?? 0) + view.marginUsed),
    });
  }

  return byAccount;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
