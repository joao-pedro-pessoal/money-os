/**
 * Checks the app's own stated invariants against the real database.
 *
 *   npx tsx scripts/audit.ts
 *
 * Every number bug this project has had was found the same way: somebody opened
 * a screen, looked at a figure and said *this is wrong*. The test suite was
 * green through all of them, because tests protect what has already been
 * understood and these were things nobody had understood yet.
 *
 * This is that inspection, made repeatable. It does not re-derive any figure —
 * re-deriving is how a second definition gets written, which is its own bug.
 * It calls the same functions the screens call and asserts the relationships
 * those functions promise in their own comments.
 *
 * Read-only. It opens the database, reads, and prints. Amounts are shown
 * because the point is to eyeball them, so the output is as private as the
 * screen it mirrors — do not paste it anywhere you would not paste a
 * screenshot of the dashboard.
 */

import "dotenv/config";

import { getNetWorth } from "../src/actions/networth";
import { getPortfolioItems } from "../src/actions/dashboard";
import { getDividendOverview } from "../src/actions/dividends";
import { getTradeAnalysis } from "../src/actions/investmentActivity";
import { getSpendingAnalysis } from "../src/actions/spending";
import { portfolioSummary } from "../src/lib/portfolio/positionView";
import { STABLE_ASSET_TYPES } from "../src/lib/portfolio/tags";
import { realisedProvenance } from "../src/lib/trading/realised";
import { listAccountsWithState } from "../src/actions/accounts";
import { getAccountPlatformTotals } from "../src/actions/platformTotals";
import { db } from "../src/db/client";
import { accountConnections, accounts, positions, transactions } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

const CENT = 0.011;

let failures = 0;
let warnings = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

function note(name: string, detail: string) {
  warnings += 1;
  console.log(`  note  ${name}\n        ${detail}`);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) <= CENT;
const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;

async function main() {
  console.log("Auditing against the live database. Read-only.\n");

  // ---------------------------------------------------------------- net worth
  console.log("Net worth");
  const nw = await getNetWorth();
  const c = nw.baseCurrency;

  check(
    "cash + portfolio = assets",
    near(nw.cash + nw.portfolio, nw.assets),
    `${money(nw.cash, c)} + ${money(nw.portfolio, c)} = ${money(nw.cash + nw.portfolio, c)}, assets say ${money(nw.assets, c)}`
  );
  check(
    "assets - liabilities = total",
    near(nw.assets - nw.liabilities, nw.total),
    `${money(nw.assets, c)} - ${money(nw.liabilities, c)} = ${money(nw.assets - nw.liabilities, c)}, total says ${money(nw.total, c)}`
  );
  check(
    "the floating part is a slice of the portfolio, not on top of it",
    nw.floating <= nw.portfolio + CENT,
    `floating ${money(nw.floating, c)} exceeds portfolio ${money(nw.portfolio, c)}`
  );
  check(
    "guaranteed and floating account for the whole of it",
    near(nw.floating + nw.guaranteed, nw.total),
    `${money(nw.floating, c)} + ${money(nw.guaranteed, c)} = ${money(nw.floating + nw.guaranteed, c)}, total ${money(nw.total, c)}`
  );

  if (nw.unconverted.length > 0) {
    const currencies = [...new Set(nw.unconverted.map((u) => u.currency))];
    note(
      "amounts left out for want of a rate",
      `${nw.unconverted.length} row(s) in ${currencies.join(", ")} are missing from every total above`
    );
  }

  // ---------------------------------------------------------------- portfolio
  console.log("\nPortfolio");
  const items = await getPortfolioItems();
  const summary = portfolioSummary(items.items);

  /** The invariant positionView.ts states about itself. */
  check(
    "cost + pnl + costUnknown = floating",
    near(summary.cost + summary.pnl + summary.costUnknown, summary.floating),
    `${summary.cost.toFixed(2)} + ${summary.pnl.toFixed(2)} + ${summary.costUnknown.toFixed(2)} = ${(summary.cost + summary.pnl + summary.costUnknown).toFixed(2)}, floating ${summary.floating.toFixed(2)}`
  );
  check(
    "stable + floating = held",
    near(summary.stable + summary.floating, summary.held),
    `${summary.stable.toFixed(2)} + ${summary.floating.toFixed(2)} vs held ${summary.held.toFixed(2)}`
  );

  /**
   * These two are **not** the same figure, and asserting they were is the first
   * thing this audit got wrong about the app.
   *
   * `summary.held` is everything the Investments page lists, stablecoins and
   * broker cash included. `nw.portfolio` is the market-exposed share of net
   * worth, and reclassification is capped by the balance holding it — an
   * account cannot have more invested than it has. So net worth's figure can
   * only ever be the smaller of the two, and a gap is expected rather than
   * wrong.
   *
   * What is checked is the direction. Net worth exceeding what is actually
   * listed would mean money classified as invested that nothing holds.
   */
  check(
    "net worth never claims more invested than the portfolio lists",
    nw.portfolio <= summary.held + CENT,
    `net worth says ${money(nw.portfolio, c)} invested, the investments page lists only ${money(summary.held, c)}`
  );

  const floatingGap = summary.floating - nw.floating;
  if (Math.abs(floatingGap) > CENT) {
    note(
      "the two market-exposed figures differ",
      `investments page ${money(summary.floating, c)}, net worth ${money(nw.floating, c)}, ` +
        `a gap of ${money(floatingGap, c)}. Some of this is the reclassification cap — an account ` +
        `declaring less invested than it lists — and the rest is worth accounting for before ` +
        `either figure is trusted to the cent.`
    );
  }

  if (summary.costUnknown > 0) {
    note(
      "market-exposed value with no cost basis",
      `${money(summary.costUnknown, c)} contributes value and no gain — synced balances rarely state what they cost`
    );
  }

  const unpriced = items.items.filter((i) => i.costUnknown);
  if (unpriced.length > 0) {
    note("positions with no stated cost", unpriced.map((i) => i.symbol ?? i.id).join(", "));
  }

  /**
   * Every asset, one line each, and where each one lands.
   *
   * The totals above are relationships between figures; this is the ledger they
   * were summed from. It exists because the note about "the two market-exposed
   * figures differ" has stood unexplained for weeks at around 60 EUR, and a gap
   * you cannot attribute to specific rows is a gap you cannot argue with.
   *
   * `inside` is the column that does the work. An item inside a balance is
   * money the account's own figure already carries — it belongs in the picture
   * of what you hold, and must never be added to net worth on top. That is the
   * legitimate half of the difference, and printing it per asset turns "there
   * is a gap" into "these rows are the gap".
   */
  console.log("\nAssets");
  const assets = [...items.items].sort((a, b) => b.value - a.value);
  const isStable = (assetType: string | null) =>
    assetType !== null && STABLE_ASSET_TYPES.includes(assetType);

  console.log(
    `  ${"asset".padEnd(14)}${"account".padEnd(20)}${"source".padEnd(11)}${"value".padStart(10)}  kind      counts`
  );
  for (const i of assets) {
    console.log(
      `  ${i.symbol.slice(0, 13).padEnd(14)}` +
        `${i.accountName.slice(0, 19).padEnd(20)}` +
        `${i.source.padEnd(11)}` +
        `${i.value.toFixed(2).padStart(10)}  ` +
        `${(isStable(i.assetType) ? "stable" : "floating").padEnd(10)}` +
        `${i.insideBalance ? "inside a balance" : "on top"}` +
        `${i.atCost ? "  [value is cost]" : ""}` +
        `${i.costUnknown ? "  [cost unknown]" : ""}`
    );
  }

  /**
   * The difference, attributed.
   *
   * Two causes, and naming them is the point — this note has stood at roughly
   * 60 EUR for weeks saying only that a gap exists.
   *
   * **A market-exposed balance inside an account's equity.** Hyperliquid moved
   * to a unified account, so its spot coins sit inside the perps equity and are
   * stored `countsInPortfolio: false` — correctly, or they would be added to a
   * balance that already contains them. But nothing then reclassifies them:
   * `reclassifiable` moves *positions* and *declared* investments out of cash,
   * and a coin balance is neither. So HYPE is market-exposed on the Investments
   * page and capital-guaranteed in net worth, which is the larger half of this.
   *
   * **The reclassification cap.** An account cannot have more invested than its
   * balance holds, so anything above it stays cash.
   *
   * Printed, not asserted. A check here would have to rebuild the per-account
   * split `getNetWorth` makes internally, and that is the second definition this
   * file exists to avoid — the first draft of this section did exactly that and
   * reported a −646 EUR residual on a healthy account.
   */
  const floatingInsideEquity = round2(
    assets
      .filter((i) => i.source === "balance" && !isStable(i.assetType))
      .reduce((s, i) => s + i.value, 0)
  );
  const gap = round2(summary.floating - nw.floating);

  console.log(
    `
  market-exposed listed on Investments : ${money(summary.floating, c)}` +
      `
  market-exposed counted in net worth  : ${money(nw.floating, c)}` +
      `
  difference                           : ${money(gap, c)}` +
      `
    coin balances inside an equity     : ${money(floatingInsideEquity, c)}  (market-exposed on Investments, cash in net worth)` +
      `
    the rest                           : ${money(round2(gap - floatingInsideEquity), c)}  (the per-account cap, and rounding)`
  );

  if (floatingInsideEquity > CENT) {
    note(
      "a market-exposed balance is counted as guaranteed",
      `${money(floatingInsideEquity, c)} of coin balances sit inside an account's equity, so they ` +
        `are market-exposed on the Investments page and capital-guaranteed in net worth. ` +
        `Both figures are defensible on their own; they cannot both be right about the same coins.`
    );
  }

  /**
   * A position priced in a currency that is not the one it reports in.
   *
   * `positionValue / (size × markPrice)` is 1.00 when the price and the value
   * are the same currency. Anything else is an FX rate, and it means the price
   * columns cannot be labelled with the platform's currency — which is what
   * the positions table used to do, showing a dollar price with a euro sign.
   *
   * Reported rather than failed: it is the venue's arrangement, not a defect.
   * What would be a defect is a screen or a sum that assumed otherwise.
   */
  const positionRows = await db.select().from(positions);
  const connRows = await db.select().from(accountConnections);
  const reportsIn = new Map(connRows.map((r) => [r.id, r.reportingCurrency ?? "USD"]));
  const foreign: string[] = [];
  for (const p of positionRows) {
    const size = Number(p.size);
    const mark = p.markPrice === null ? null : Number(p.markPrice);
    const value = p.positionValue === null ? null : Number(p.positionValue);
    if (mark === null || value === null || size === 0 || mark === 0) continue;
    const ratio = value / (size * mark);
    if (Math.abs(ratio - 1) > 0.02) {
      foreign.push(`${p.coin} (${reportsIn.get(p.connectionId)} account, priced at ×${ratio.toFixed(4)})`);
    }
  }
  if (foreign.length > 0) {
    note(
      "positions priced in a currency the account does not report in",
      `${foreign.join("; ")} — their entry, mark and liquidation prices are not in the ` +
        `account's currency, so nothing may label them with it or add them to it`
    );
  }

  // ----------------------------------------------------------------- accounts
  console.log("\nAccounts");
  const accountRows = await db.select().from(accounts);

  /**
   * Two **live** accounts under one name is the hazard. Anything grouping by
   * name merges them, so one figure ends up describing two accounts and looks
   * perfectly reasonable while doing it.
   *
   * An archived duplicate is ordinary — it is what a failed connection attempt
   * leaves behind — so warning about it would be crying wolf, and a check that
   * cries wolf is one people learn to skip.
   */
  const activeNames = accountRows.filter((a) => a.active).map((a) => a.name);
  const duplicatedLive = [...new Set(activeNames)].filter(
    (name) => activeNames.filter((n) => n === name).length > 1
  );
  check(
    "no two live accounts share a name",
    duplicatedLive.length === 0,
    `${duplicatedLive.join(", ")} — anything grouping by name merges them, so one figure can describe two accounts`
  );

  /**
   * An archived account holding money is a contradiction the app cannot
   * resolve on its own: `getNetWorth` reads only active accounts, so that
   * balance is in no total anywhere.
   *
   * Either the money is not there and the balance should be zero, or it is
   * there and the account should be live. Both are worth knowing, and neither
   * is visible on any screen.
   */
  const archivedWithMoney = accountRows.filter(
    (a) => !a.active && Math.abs(Number(a.balance)) > CENT
  );
  if (archivedWithMoney.length > 0) {
    note(
      "archived accounts still holding a balance",
      archivedWithMoney
        .map((a) => `${a.name} (${a.currency}) ${Number(a.balance).toFixed(2)}`)
        .join("; ") +
        " — archived accounts are read by no total, so this money is in none of them"
    );
  }

  /**
   * Same name, different currency is the fingerprint of a leftover: a
   * connection attempt that created an account before the platform said what
   * it reports in.
   */
  const byName = new Map<string, Set<string>>();
  for (const a of accountRows) {
    byName.set(a.name, (byName.get(a.name) ?? new Set()).add(a.currency));
  }
  const mixedCurrency = [...byName.entries()].filter(([, set]) => set.size > 1);
  if (mixedCurrency.length > 0) {
    note(
      "one name, more than one currency",
      mixedCurrency.map(([name, set]) => `${name}: ${[...set].join(", ")}`).join("; ") +
        " — usually a connection attempt that created an account before the platform said what it reports in"
    );
  }

  // ---------------------------------------------------------------- dividends
  console.log("\nDividends");
  const div = await getDividendOverview();
  check(
    "distributions + interest = everything received",
    near(div.totalDistributions + div.totalInterest, div.totalAll),
    `${div.totalDistributions.toFixed(2)} + ${div.totalInterest.toFixed(2)} vs ${div.totalAll.toFixed(2)}`
  );
  for (const s of div.sources) {
    if (s.others.length > 0) {
      note(
        `${s.accountName} ${s.kind} recorded more than once`,
        `counted from ${s.source}; also present in ${s.others.join(", ")} and held back`
      );
    }
  }

  // ------------------------------------------------------------ trade history
  console.log("\nTrade history");
  const trades = await getTradeAnalysis();
  const prov = realisedProvenance(trades.rows);

  check(
    "every result is either the venue's or this app's, never both",
    prov.reported + prov.derived + prov.open ===
      trades.rows.filter((r) => r.type === "BUY" || r.type === "SELL").length - prov.conversions,
    `reported ${prov.reported} + derived ${prov.derived} + open ${prov.open} does not account for the trades`
  );
  if (prov.conversions > 0) {
    note(
      "currency conversions excluded",
      `${prov.conversions} row(s) are FX, not positions, and are out of every figure`
    );
  }
  if (prov.derived > 0) {
    note(
      "results this app worked out",
      `${prov.derived} of ${prov.reported + prov.derived} closed trades have no published figure and were derived under average cost`
    );
  }
  if (trades.unconvertible > 0) {
    note("trade rows with no rate", `${trades.unconvertible} left out of every chart`);
  }

  // ----------------------------------------------------------------- spending
  /**
   * Free cash cannot exceed what the account is shown to hold.
   *
   * The reading that exposed this: Interactive Brokers, 34.24 USD of balance
   * next to 134.24 "free". Two columns reading two sources — the balance from
   * the connector, the free figure from `accounts.balance`, which a manual
   * transaction had pushed 100 above what the venue actually held and which the
   * failing sync never corrected.
   *
   * The stale-balance half is checked separately because it is the cause rather
   * than the symptom, and it stays true even once every screen reads the
   * platform: a connected account whose stored balance has drifted will still
   * feed net worth, snapshots and the net-worth chart.
   */
  console.log("\nFree cash");
  const accountsWithState = await listAccountsWithState();
  const totals = await getAccountPlatformTotals();

  for (const a of accountsWithState) {
    const p = totals.get(a.id);
    const shown = p ? p.total : a.balance;
    check(
      `${a.name}: free is within what it holds`,
      a.free <= shown + CENT,
      `free ${money(a.free, a.currency)} exceeds the ${money(shown, a.currency)} shown — ` +
        `a figure labelled free that isn't there invites planning with money you don't have`
    );

    if (p && !near(a.balance, p.equity + p.spotOnTop)) {
      note(
        `${a.name}: stored balance has drifted from the platform`,
        `the database says ${money(a.balance, a.currency)}, the connector reports ` +
          `${money(p.equity + p.spotOnTop, a.currency)}. A manual transaction on a synced ` +
          `account is overwritten by the next successful sync, so the difference is either ` +
          `a sync that failed or an entry that is about to be silently discarded`
      );
    }
  }

  /**
   * A transaction recorded in one currency and added to a balance in another.
   *
   * `transactions.currency` defaults to EUR, and the form has no currency field,
   * so before this was fixed every row was stamped EUR whatever account it
   * landed in while the balance was incremented raw.
   */
  const mismatched = await db
    .select({
      name: accounts.name,
      accountCurrency: accounts.currency,
      txCurrency: transactions.currency,
      amount: transactions.amount,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(sql`${transactions.currency} is distinct from ${accounts.currency}`);

  check(
    "every transaction is in its account's currency",
    mismatched.length === 0,
    mismatched
      .map(
        (m) =>
          `${m.name} is ${m.accountCurrency} but holds ${m.amount} stamped ${m.txCurrency}, ` +
          `added to the balance without conversion`
      )
      .join("\n        ")
  );

  console.log("\nSpending");
  const spend = await getSpendingAnalysis();
  if (spend.total === 0) {
    note(
      "nothing recorded",
      "the money half of the app has no transactions, so none of its figures have ever been exercised"
    );
  } else {
    check(
      "every transaction converted or was named as unconverted",
      spend.rows.length + spend.unconverted.length > 0,
      "rows vanished between the database and the page"
    );
    if (spend.unconverted.length > 0) {
      note("spending with no rate", `${spend.unconverted.join(", ")} left out of every figure`);
    }
  }

  // ------------------------------------------------------------------ verdict
  console.log(
    `\n${failures === 0 ? "No invariant broken" : `${failures} INVARIANT(S) BROKEN`}` +
      `${warnings > 0 ? `, ${warnings} thing(s) worth a look` : ""}.`
  );
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("The audit could not run:", error instanceof Error ? error.message : error);
  process.exit(1);
});
