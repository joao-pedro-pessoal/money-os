"use server";

import { db } from "@/db/client";
import { buildPortfolioSeries, trimLeadingZeros } from "@/lib/portfolio/series";
import {
  holdings,
  holdingSnapshots,
  positionSnapshots,
  positions,
  brokerEvents,
  auditLog,
  accounts,
  playlists,
  platformBalances,
  accountConnections,
  positionMeta,
  investmentActivities,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { meaningOf, holdingCountsOnTop } from "@/lib/accounting/balanceScope";
import {
  marketValue,
  costBasis,
  unrealizedPnL,
  unrealizedPnLPercent,
  portfolioTotals,
  reinforcePosition,
  reducePosition,
} from "@/lib/portfolio";
import { isCapitalStable, isStableAsset } from "@/lib/portfolio/tags";
import { STABLE_ASSET_TYPES } from "@/lib/portfolio/tags";
import { toBase } from "@/lib/fx";
import {
  timeWeightedReturn,
  timeWeightedSeries,
  internalRateOfReturn,
  returnCoverage,
  contributionsExplainValue,
  historyLooksLikePerformance,
  type CashFlow,
  type ValuePoint,
} from "@/lib/portfolio/returns";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
// The same list the Investments page renders, so the two cannot disagree about
// what the portfolio contains.
import { getPortfolioItems } from "./dashboard";
import {
  breakdownBy,
  stableVsFloating,
  stakingSummary,
  topMovers,
  concentrationWarnings,
  horizonRiskMismatches,
  performanceBy,
  sortPerformance,
  type AnalysisHolding,
  type GroupByKey,
  type SortKey,
} from "@/lib/portfolio/analysis";

/** "" from an unselected <select> becomes NULL instead of an empty string in the DB. */
function tagValue(formData: FormData, field: string): string | null {
  const v = String(formData.get(field) ?? "").trim();
  return v === "" ? null : v;
}

/** Optional numeric field: blank stays NULL rather than becoming 0. */
function numericValue(formData: FormData, field: string): string | null {
  const v = String(formData.get(field) ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}


/**
 * Fills in what a stablecoin implies, so typing "USDC" is enough: it is priced
 * 1:1, capital-stable and instantly available. Only applied where the user
 * left the field blank — an explicit choice always wins.
 */
function applyStablecoinDefaults(input: {
  symbol: string;
  assetType: string | null;
  riskLevel: string | null;
  liquidity: string | null;
  expectedReturn: string | null;
  avgEntryPrice: string;
  currentPrice?: string;
}) {
  const stable =
    input.assetType === "stablecoin" ||
    input.assetType === "cash" ||
    (input.assetType === null && isCapitalStable(input.symbol));
  if (!stable) return input;

  return {
    ...input,
    assetType: "stablecoin",
    riskLevel: input.riskLevel ?? "low",
    liquidity: input.liquidity ?? "high",
    expectedReturn: input.expectedReturn ?? "conservative",
    avgEntryPrice: Number(input.avgEntryPrice) > 0 ? input.avgEntryPrice : "1",
    currentPrice: input.currentPrice && Number(input.currentPrice) > 0 ? input.currentPrice : "1",
  };
}

export async function listHoldingsWithPnL() {
  const rows = await db.select().from(holdings);
  const [allAccounts, allPlaylists] = await Promise.all([
    db.select().from(accounts),
    db.select().from(playlists),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const playlistName = new Map(allPlaylists.map((p) => [p.id, p.name]));

  const parsed = rows.map((h) => ({
    ...h,
    quantity: Number(h.quantity),
    avgEntryPrice: Number(h.avgEntryPrice),
    currentPrice: Number(h.currentPrice),
    apr: h.apr === null ? null : Number(h.apr),
    rewardsEarned: h.rewardsEarned === null ? 0 : Number(h.rewardsEarned),
    realizedPnl: h.realizedPnl === null ? 0 : Number(h.realizedPnl),
    playlistName: h.playlistId ? playlistName.get(h.playlistId) ?? null : null,
    // Falls back to the old free-text platform for rows created before
    // holdings were linked to accounts.
    accountName: (h.accountId ? accountName.get(h.accountId) : null) ?? h.platform ?? null,
  }));

  const withPnL = parsed.map((h) => ({
    ...h,
    marketValue: marketValue(h),
    costBasis: costBasis(h),
    unrealizedPnL: unrealizedPnL(h),
    unrealizedPnLPercent: unrealizedPnLPercent(h),
  }));

  return { holdings: withPnL, totals: portfolioTotals(parsed) };
}

export async function getHolding(id: string) {
  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  return h;
}

export async function getHoldingSnapshots(holdingId: string) {
  return db.select().from(holdingSnapshots).where(eq(holdingSnapshots.holdingId, holdingId)).orderBy(holdingSnapshots.timestamp);
}

export async function createHolding(formData: FormData) {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const accountId = tagValue(formData, "accountId");
  const quantity = String(formData.get("quantity") ?? "0");
  const avgEntryPrice = String(formData.get("avgEntryPrice") ?? "0");
  const currentPrice = String(formData.get("currentPrice") ?? formData.get("avgEntryPrice") ?? "0");
  const currency = String(formData.get("currency") ?? "EUR");
  const assetType = tagValue(formData, "assetType");
  const direction = tagValue(formData, "direction") ?? "long";
  const playlistId = tagValue(formData, "playlistId");
  const apr = numericValue(formData, "apr");
  const rewardsEarned = numericValue(formData, "rewardsEarned") ?? "0";
  const riskLevel = tagValue(formData, "riskLevel");
  const expectedReturn = tagValue(formData, "expectedReturn");
  const timeHorizon = tagValue(formData, "timeHorizon");
  const liquidity = tagValue(formData, "liquidity");

  if (!symbol) throw new Error("Symbol is required");
  if (!accountId) throw new Error("Pick the account that holds this position");

  const d = applyStablecoinDefaults({
    symbol,
    assetType,
    riskLevel,
    liquidity,
    expectedReturn,
    avgEntryPrice,
    currentPrice,
  });

  const [h] = await db
    .insert(holdings)
    .values({
      symbol,
      name,
      accountId,
      quantity,
      avgEntryPrice: d.avgEntryPrice,
      currentPrice: d.currentPrice ?? currentPrice,
      currency,
      assetType: d.assetType,
      direction,
      playlistId,
      apr,
      rewardsEarned,
      riskLevel: d.riskLevel,
      expectedReturn: d.expectedReturn,
      timeHorizon,
      liquidity: d.liquidity,
      lastPriceUpdate: new Date(),
    })
    .returning();

  const openingPrice = d.currentPrice ?? currentPrice;
  await db.insert(holdingSnapshots).values({
    holdingId: h.id,
    price: openingPrice,
    value: String(Number(quantity) * Number(openingPrice)),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: h.id,
    action: "holding_created",
    details: JSON.stringify({ symbol, accountId, quantity, avgEntryPrice, assetType }),
  });

  revalidatePath("/investments");
}

/**
 * Tags only, from a list rather than a detail page.
 *
 * The mirror of `setPositionTags` for a manual holding. A synced position could
 * be tagged inline on the Positions page while a manual one — including every
 * position rebuilt from a statement — could only be edited by opening it, which
 * is a page load per tag on a list of twelve.
 *
 * Only the tag fields are written. Quantity, price and cost are untouched:
 * those are facts about the position, and a form about labels has no business
 * near them.
 */
export async function setHoldingTags(formData: FormData) {
  const id = String(formData.get("id"));
  if (!id) throw new Error("Which position?");

  await db
    .update(holdings)
    .set({
      riskLevel: tagValue(formData, "riskLevel"),
      expectedReturn: tagValue(formData, "expectedReturn"),
      timeHorizon: tagValue(formData, "timeHorizon"),
      liquidity: tagValue(formData, "liquidity"),
      assetType: tagValue(formData, "assetType"),
      playlistId: tagValue(formData, "playlistId"),
      // The form hides the rate field for types with no income model, so an
      // absent field clears the stored rate. That is deliberate: retagging a
      // staking position as plain crypto should not leave a rate behind that
      // `yearlyYield` and `stakingSummary` would keep projecting income from.
      // A rate that no longer applies is worse than none, because it still adds
      // up. Don't "fix" this by preserving the old value when the field is gone.
      apr: numericValue(formData, "apr"),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  revalidatePath("/positions");
  revalidatePath("/investments");
  revalidatePath("/investments/analysis");
}

/** Edit static details (symbol, name, platform, quantity, avg entry) without touching current price. */
export async function updateHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const accountId = tagValue(formData, "accountId");
  const quantity = String(formData.get("quantity") ?? "0");
  const avgEntryPrice = String(formData.get("avgEntryPrice") ?? "0");
  const currency = String(formData.get("currency") ?? "EUR");
  const assetType = tagValue(formData, "assetType");
  const direction = tagValue(formData, "direction") ?? "long";
  const playlistId = tagValue(formData, "playlistId");
  const apr = numericValue(formData, "apr");
  const riskLevel = tagValue(formData, "riskLevel");
  const expectedReturn = tagValue(formData, "expectedReturn");
  const timeHorizon = tagValue(formData, "timeHorizon");
  const liquidity = tagValue(formData, "liquidity");

  if (!symbol) throw new Error("Symbol is required");
  if (!accountId) throw new Error("Pick the account that holds this position");

  const d = applyStablecoinDefaults({
    symbol,
    assetType,
    riskLevel,
    liquidity,
    expectedReturn,
    avgEntryPrice,
  });

  await db
    .update(holdings)
    .set({
      symbol,
      name,
      accountId,
      quantity,
      avgEntryPrice: d.avgEntryPrice,
      currency,
      assetType: d.assetType,
      direction,
      playlistId,
      apr,
      /**
       * Only when the form sent it.
       *
       * Rewards accumulate — recorded as they arrive, never recomputed.
       * Defaulting a missing field to "0" meant any form that didn't carry it
       * would erase months of staking income on save, with no error and no way
       * to get the figure back. The edit page does carry it in a hidden input,
       * so this never fired; it was a trap set for the second form.
       */
      ...(formData.has("rewardsEarned")
        ? { rewardsEarned: numericValue(formData, "rewardsEarned") ?? "0" }
        : {}),
      riskLevel: d.riskLevel,
      expectedReturn: d.expectedReturn,
      timeHorizon,
      liquidity: d.liquidity,
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
}

/** Updates the current price, recording a snapshot so the value-over-time chart has a point. */
export async function updateHoldingPrice(formData: FormData) {
  const id = String(formData.get("id"));
  const currentPrice = String(formData.get("currentPrice") ?? "0");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  await db
    .update(holdings)
    .set({ currentPrice, lastPriceUpdate: new Date(), updatedAt: new Date() })
    .where(eq(holdings.id, id));

  await db.insert(holdingSnapshots).values({
    holdingId: id,
    price: currentPrice,
    value: String(Number(h.quantity) * Number(currentPrice)),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "price_updated",
    details: JSON.stringify({ oldPrice: h.currentPrice, newPrice: currentPrice }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
}

export async function deleteHolding(formData: FormData) {
  const id = String(formData.get("id"));
  await db.insert(auditLog).values({ entityType: "holding", entityId: id, action: "holding_deleted" });
  await db.delete(holdings).where(eq(holdings.id, id));
  revalidatePath("/investments");
  redirect("/investments");
}

/**
 * Portfolio value over time, same carry-forward approach as
 * getNetWorthOverTime in analytics.ts, but scoped to holdings.
 */
/**
 * Portfolio value over time, from every source that has a history.
 *
 * This used to read `holdingSnapshots` alone, so an account with nothing typed
 * in by hand produced an empty array and the chart said "not enough history"
 * while the portfolio held real money. Open trades are snapshotted on every
 * sync, and those count too.
 *
 * Each series is carried forward independently before being summed: they're
 * written at different moments, and a day that only touched one of them must
 * not zero the others.
 */
export async function getPortfolioValueOverTime(onlyWhatAddsOnTop = false) {
  const [allHoldings, holdingSnaps, positionSnaps, rates, base] = await Promise.all([
    db.select().from(holdings),
    db.select().from(holdingSnapshots),
    db.select().from(positionSnapshots),
    getRates(),
    getBaseCurrency(),
  ]);

  /**
   * `onlyWhatAddsOnTop` is for Net Worth, and it is not a display preference.
   *
   * This series answers "what is my portfolio worth", and for that every
   * holding and every open position belongs in it. Net Worth asks a different
   * question — "what do I have in total" — and there a position inside a
   * broker's balance has already been counted by that balance.
   *
   * `computeNetWorth` has enforced that for the current figure since the fourth
   * time this bug appeared. The historical series never did: it added the
   * positions on top of balances that contained them, so the line ran at
   * roughly three times the truth and the percentage change was nonsense.
   */
  const meaningByAccount = onlyWhatAddsOnTop
    ? new Map(
        (await db.select().from(accounts)).map((a) => [a.id, meaningOf(a.balanceMeaning)])
      )
    : new Map<string, ReturnType<typeof meaningOf>>();

  // What each platform's figures are denominated in. Assuming USD scaled every
  // euro-denominated account by the EUR/USD rate.
  const conns = await db.select().from(accountConnections);
  const currencyOfConnection = new Map(conns.map((c) => [c.id, c.reportingCurrency ?? "USD"]));

  const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

  // Manual holdings, in their own currency.
  const manual = new Map<string, { date: string; value: number }[]>();
  for (const h of allHoldings) {
    // A holding inside an account whose balance already reports it is detail,
    // not an addition. Same rule the live figure uses, same function.
    if (onlyWhatAddsOnTop && !holdingCountsOnTop(h.accountId, meaningByAccount)) continue;
    manual.set(
      h.id,
      holdingSnaps
        .filter((s) => s.holdingId === h.id)
        .map((s) => ({
          date: day(s.timestamp),
          value: toBase(Number(s.value), h.currency, rates, base) ?? 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  // Open trades, reported in USD by every connector we have.
  const synced = new Map<string, { date: string; value: number }[]>();
  for (const s of positionSnaps) {
    /**
     * Every connector in this app reports an account total that already
     * contains its open positions — that is what `balancesAreSeparatePool:
     * false` means, and it is why `computeNetWorth` excludes
     * `openPositionValue` from the total rather than adding it.
     *
     * So for a Net Worth series there is nothing here to add. Skipping the lot
     * is not a shortcut: adding any of it would be counting the same euro
     * twice, exactly as the live figure refuses to.
     */
    if (onlyWhatAddsOnTop) break;
    const key = `${s.connectionId}:${s.coin}`;
    if (!synced.has(key)) synced.set(key, []);
    synced.get(key)!.push({
      date: day(s.timestamp),
      // The platform's own currency; assuming USD mis-scaled every euro account.
      value:
        toBase(
          s.positionValue === null ? 0 : Number(s.positionValue),
          currencyOfConnection.get(s.connectionId) ?? "USD",
          rates,
          base
        ) ?? 0,
    });
  }
  for (const list of synced.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const allDates = [
    ...new Set([
      ...holdingSnaps.map((s) => day(s.timestamp)),
      // Excluded alongside the positions themselves: a date carrying only a
      // position snapshot would otherwise appear as a point worth nothing.
      ...(onlyWhatAddsOnTop ? [] : positionSnaps.map((s) => day(s.timestamp))),
    ]),
  ].sort();

  if (allDates.length === 0) return [];

  /**
   * Assembling the total is not a matter of adding up last-known values.
   *
   * A closed position keeps its final snapshot forever, and carried forward
   * with no stopping rule it went on contributing to every later date — the
   * line climbed while the portfolio stood still. buildPortfolioSeries drops a
   * position once a sync of its own connection happened without it.
   */
  const series = buildPortfolioSeries({
    dates: allDates,
    manual: [...manual.values()],
    synced: [...synced.entries()].map(([key, points]) => ({
      key,
      connectionId: key.split(":")[0],
      points,
    })),
  });

  // The days before anything was held are true but not worth drawing; they
  // squash every later movement into the right-hand edge.
  return trimLeadingZeros(series);
}

/** Accounts available to hold positions (active only) — used by the forms. */
export async function listAccountsForHoldings() {
  const rows = await db.select().from(accounts).where(eq(accounts.active, true));
  return rows.map((a) => ({ id: a.id, name: a.name, institution: a.institution, currency: a.currency }));
}

/** Records rewards received on a staked position, adding to the running total. */
export async function addRewards(formData: FormData) {
  const id = String(formData.get("id"));
  const amount = Number(formData.get("amount") ?? "0");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  const newTotal = Math.round((Number(h.rewardsEarned ?? 0) + amount + Number.EPSILON) * 100) / 100;
  await db
    .update(holdings)
    .set({ rewardsEarned: String(newTotal), updatedAt: new Date() })
    .where(eq(holdings.id, id));

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "rewards_added",
    details: JSON.stringify({ amount, newTotal }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments/analysis");
}

/**
 * Everything the analysis page needs, over the whole portfolio.
 *
 * This used to read the `holdings` table and, optionally, the spot balances
 * that were flagged `countsInPortfolio`. Two things followed from that, and
 * together they meant the page analysed 456 € of a 789 € portfolio while
 * presenting its percentages as the whole picture:
 *
 * - The `positions` table was never read at all, so every synced position —
 *   four holdings at IBKR, six at Trading 212 — was missing. The same defect
 *   the Playlists page had: one screen reading a subset while another reads
 *   everything, and neither saying which.
 * - `countsInPortfolio: false` was treated as "do not show". It means "do not
 *   *add* this to Net Worth, the account balance already carries it". Every
 *   balance on this account is flagged that way, so the "Spot & stablecoins"
 *   toggle added nothing whichever way it was set. Showing and adding are
 *   different questions.
 *
 * It now builds on `getPortfolioItems`, the same source the Investments page
 * uses, so the two cannot drift apart again.
 */
export async function getPortfolioAnalysis(includeStable = true) {
  const { items } = await getPortfolioItems();

  /**
   * A portfolio item carries value, cost and P&L directly; the analysis
   * functions want a holding with a quantity and two prices. One unit priced at
   * the value, entered at the value minus the profit, reproduces all three
   * exactly — `marketValue` gives the value, `costBasis` the cost, and
   * `unrealizedPnL` the P&L, with nothing invented.
   *
   * The old mapping used quantity = value with both prices at 1, which forced
   * cost to equal value and P&L to zero by construction. That is how a synced
   * balance came to assert it was exactly break-even.
   */
  const enriched: AnalysisHolding[] = items
    .filter((i) => includeStable || !isStableAsset(i.symbol, i.assetType))
    .map((i) => ({
      id: i.id,
      symbol: i.symbol,
      quantity: 1,
      currentPrice: i.value,
      avgEntryPrice: round2(i.value - i.pnl),
      accountId: null,
      accountName: i.accountName,
      assetType: i.assetType,
      riskLevel: i.riskLevel,
      expectedReturn: null,
      timeHorizon: i.timeHorizon,
      liquidity: null,
      apr: i.apr,
      rewardsEarned: 0,
      // The sign already lives in `value` and `pnl`; re-applying the side here
      // would negate a P&L that is already correct.
      direction: "long",
      playlistId: null,
      playlistName: i.playlistName,
      realizedPnl: 0,
    }));

  const adjustedTotals = portfolioTotals(enriched);

  return {
    totals: adjustedTotals,
    holdings: enriched,
    byAccount: breakdownBy(enriched, (h) => h.accountName, "No account"),
    byAssetType: breakdownBy(enriched, (h) => h.assetType),
    byRisk: breakdownBy(enriched, (h) => h.riskLevel),
    byTimeHorizon: breakdownBy(enriched, (h) => h.timeHorizon),
    byLiquidity: breakdownBy(enriched, (h) => h.liquidity),
    split: stableVsFloating(enriched),
    staking: stakingSummary(enriched),
    movers: topMovers(enriched),
    concentration: concentrationWarnings(enriched),
    mismatches: horizonRiskMismatches(enriched),
    realizedTotal:
      Math.round((enriched.reduce((s, h) => s + (h.realizedPnl ?? 0), 0) + Number.EPSILON) * 100) / 100,
  };
}

/**
 * Performance grouped by any dimension, sorted by any column — this is what
 * answers "which playlist / category is doing best?".
 */
export async function getGroupedPerformance(
  groupBy: GroupByKey,
  sortKey: SortKey,
  direction: "asc" | "desc",
  includeStable = true
) {
  const { holdings: enriched } = await getPortfolioAnalysis(includeStable);
  return sortPerformance(performanceBy(enriched, groupBy), sortKey, direction);
}

/**
 * Total market value of everything in the portfolio, converted to the base
 * currency, plus the market-exposed portion.
 *
 * Conversion matters here: holdings carry their own currency and synced spot
 * balances are valued in USD. Summing them raw and adding the result to
 * already-converted cash would report dollars as euros.
 *
 * Includes synced spot balances (USDC and friends). Those are NOT in the
 * connected account's balance — sync writes only perps equity there — so
 * counting them here adds them exactly once.
 */
/**
 * Money the app knows is invested, but not what it is invested in.
 *
 * An account can declare that part of its balance is investments — that is how
 * Trade Republic is modelled, since it publishes no API. Net Worth counts that
 * money correctly. The Investments page cannot show it, because that page lists
 * *instruments*, and a declared number is not an instrument.
 *
 * The gap is real and worth naming. Left unsaid it reads as a bug: the
 * dashboard says €704 invested and the investments table adds up to €254, with
 * nothing on screen to explain the difference.
 */
export async function getUnitemisedInvestments() {
  const [accountRows, holdingRows, positionRows, base, rates] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)),
    db.select().from(holdings),
    // Live positions, not snapshots: snapshots carry a connection but no
    // account, and the question here is which account has instruments now.
    db.select().from(positions),
    getBaseCurrency(),
    getRates(),
  ]);

  // An imported statement counts as knowing what it's invested in — that is
  // the whole point of importing one.
  const statementAccounts = await db
    .selectDistinct({ accountId: brokerEvents.accountId })
    .from(brokerEvents);

  const hasInstruments = new Set([
    ...holdingRows.map((h) => h.accountId).filter((id): id is string => id !== null),
    ...positionRows.map((p) => p.accountId),
    ...statementAccounts.map((s) => s.accountId),
  ]);

  const items = accountRows
    .filter((a) => meaningOf(a.balanceMeaning) === "bank_and_broker")
    .map((a) => {
      const declared = Math.min(Number(a.investedValue ?? 0), Number(a.balance));
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        currency: a.currency,
        amount: declared,
        inBase: toBase(declared, a.currency, rates, base) ?? declared,
        /** Some instruments are already recorded, so this is a partial gap. */
        itemised: hasInstruments.has(a.id),
      };
    })
    // Once the instruments are known, there is nothing left to explain here —
    // the positions appear in the table like any others.
    .filter((a) => a.amount > 0 && !a.itemised);

  return {
    items,
    total: Math.round(items.reduce((s, a) => s + a.inBase, 0) * 100) / 100,
    baseCurrency: base,
  };
}

export async function getPortfolioContribution() {
  const { holdings: rows } = await listHoldingsWithPnL();
  const [rates, base] = await Promise.all([getRates(), getBaseCurrency()]);

  let stable = 0;
  let floating = 0;
  const unconverted: { amount: number; currency: string }[] = [];

  const add = (amount: number, currency: string, isStable: boolean) => {
    if (amount === 0) return;
    const converted = toBase(amount, currency, rates, base);
    if (converted === null) {
      unconverted.push({ amount, currency });
      return;
    }
    if (isStable) stable += converted;
    else floating += converted;
  };

  /**
   * A holding only counts on top of the balances if its account says its
   * balance is idle cash. An account whose balance is the broker's total
   * already contains these positions — adding them again is the sixth variant
   * of the double-count bug, and the only one that could be triggered purely
   * by typing a number into a form.
   */
  const accountRows = await db.select().from(accounts);
  const meaningByAccount = new Map(accountRows.map((a) => [a.id, meaningOf(a.balanceMeaning)]));

  for (const h of rows) {
    if (!holdingCountsOnTop(h.accountId, meaningByAccount)) continue;
    // Cash and stablecoins are capital-stable; everything else can move.
    const isStable = h.assetType !== null && STABLE_ASSET_TYPES.includes(h.assetType);
    add(marketValue(h), h.currency, isStable);
  }

  // Synced spot balances are valued in USD by the connector. Only those that
  // are a pool of their own count here — a Bybit unified account's coin list is
  // a breakdown of its equity, which is already counted as cash.
  const balances = await db.select().from(platformBalances);
  const syncedConns = await db.select().from(accountConnections);
  const currencyOfConnection = new Map(
    syncedConns.map((c) => [c.id, c.reportingCurrency ?? "USD"])
  );
  // Tags set on the Positions page, so a coin the symbol list doesn't know can
  // still be classified correctly by the person who owns it.
  const metaRows = await db.select().from(positionMeta);
  const assetTypeOf = new Map(metaRows.map((m) => [`${m.connectionId}:${m.coin}`, m.assetType]));

  const beforeSynced = stable + floating;
  for (const b of balances) {
    if (b.usdValue === null || !b.countsInPortfolio) continue;
    add(
      Number(b.usdValue),
      currencyOfConnection.get(b.connectionId) ?? "USD",
      isStableAsset(b.coin, assetTypeOf.get(`${b.connectionId}:${b.coin}`))
    );
  }
  const syncedValue = round2(stable + floating - beforeSynced);

  return {
    portfolioValue: round2(stable + floating),
    floating: round2(floating),
    stable: round2(stable),
    syncedValue,
    baseCurrency: base,
    unconverted,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Buying more of a position. The average entry price becomes the weighted
 * average of the old and new lots (see reinforcePosition), and a snapshot is
 * recorded at the new price so the value chart stays continuous.
 */
export async function reinforceHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const addQuantity = Number(formData.get("quantity") ?? "0");
  const price = Number(formData.get("price") ?? "0");

  if (addQuantity <= 0) throw new Error("Quantity must be greater than zero");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  const next = reinforcePosition(
    { quantity: Number(h.quantity), avgEntryPrice: Number(h.avgEntryPrice) },
    { quantity: addQuantity, price }
  );

  await db
    .update(holdings)
    .set({
      quantity: String(next.quantity),
      avgEntryPrice: String(next.avgEntryPrice),
      currentPrice: String(price),
      lastPriceUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  await db.insert(holdingSnapshots).values({
    holdingId: id,
    price: String(price),
    value: String(next.quantity * price),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "position_reinforced",
    details: JSON.stringify({ addQuantity, price, newQuantity: next.quantity, newAvg: next.avgEntryPrice }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments/analysis");
}

/**
 * Selling part (or all) of a position. The average entry price is left alone —
 * only the quantity drops and the profit on the units sold moves into
 * realizedPnl, so realised money is never mixed with paper gains.
 */
export async function sellHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const sellQuantity = Number(formData.get("quantity") ?? "0");
  const price = Number(formData.get("price") ?? "0");

  if (sellQuantity <= 0) throw new Error("Quantity must be greater than zero");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  const next = reducePosition(
    { quantity: Number(h.quantity), avgEntryPrice: Number(h.avgEntryPrice), direction: h.direction },
    { quantity: sellQuantity, price }
  );

  const newRealized =
    Math.round((Number(h.realizedPnl ?? 0) + next.realized + Number.EPSILON) * 100) / 100;

  await db
    .update(holdings)
    .set({
      quantity: String(next.quantity),
      currentPrice: String(price),
      realizedPnl: String(newRealized),
      lastPriceUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  await db.insert(holdingSnapshots).values({
    holdingId: id,
    price: String(price),
    value: String(next.quantity * price),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "position_sold",
    details: JSON.stringify({
      sellQuantity,
      price,
      realized: next.realized,
      remainingQuantity: next.quantity,
    }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments/analysis");
}

/**
 * How the investing has actually gone, by both measures that mean anything.
 *
 * The app has only ever shown profit against cost, which stops being a return
 * the moment money moves in or out: deposit 500 € and the portfolio is bigger
 * without a single thing having performed.
 *
 * Two figures, because they answer different questions and neither substitutes
 * for the other. Time-weighted removes deposits and withdrawals and answers
 * "were the choices good"; money-weighted keeps them and answers "how did my
 * money do". A fund quotes the first because it cannot control when investors
 * add money; you are not a fund.
 *
 * Both come back null when the data cannot support them, and the coverage is
 * returned alongside so the page can say which window it measured. On this
 * account the external flows run January to July and the value history starts
 * in August — so the money-weighted figure spans everything and the
 * time-weighted one cannot, and the difference has to be visible rather than
 * quietly resolved in the arithmetic.
 */
export async function getPortfolioReturns() {
  const [series, activityRows, base] = await Promise.all([
    getPortfolioValueOverTime(),
    db.select().from(investmentActivities),
    getBaseCurrency(),
  ]);

  const rates = await getRates();

  const values: ValuePoint[] = series.map((p) => ({
    date: p.date,
    value: p.portfolioValue,
  }));

  /**
   * Only money crossing the boundary counts as a flow.
   *
   * A buy moves money from cash into a holding and changes nothing about what
   * you put in; counting it would make every trade look like a deposit and
   * destroy both figures. Deposits and withdrawals are the only rows that are
   * genuinely money arriving from, or leaving for, outside.
   */
  const external: CashFlow[] = activityRows
    .filter((a) => a.type === "DEPOSIT" || a.type === "WITHDRAWAL")
    .map((a) => {
      const amount = toBase(Number(a.amount), a.currency, rates, base);
      return amount === null
        ? null
        : {
            date: new Date(a.date).toISOString().slice(0, 10),
            // Stored signed from the account's view — a deposit is positive
            // there. The return maths wants the investor's view, where money
            // leaving your pocket is negative, so it flips.
            amount: -amount,
          };
    })
    .filter((f): f is CashFlow => f !== null);

  const currentValue = values[values.length - 1]?.value ?? 0;

  /**
   * The terminal value closes the series: what you would have if you sold
   * today. Without it every deposit looks like money that never came back.
   */
  const irrFlows: CashFlow[] =
    currentValue > 0
      ? [...external, { date: new Date().toISOString().slice(0, 10), amount: currentValue }]
      : external;

  const netContributed =
    Math.round((external.reduce((s, f) => s - f.amount, 0) + Number.EPSILON) * 100) / 100;

  /**
   * Both figures are withheld when their inputs cannot support them, and the
   * reason is returned so the page can say which.
   *
   * This is not defensive coding for its own sake. The first run against real
   * data produced a time-weighted return of **+8091%** — the value series
   * begins the day the accounts were connected, so the app being filled in read
   * as a portfolio multiplying — and a money-weighted return computed from a
   * net contribution of −46 € against a portfolio of 730 €, which is
   * arithmetically impossible and means the deposits of three platforms are
   * simply not recorded anywhere.
   *
   * Both numbers were wrong. Both looked like numbers.
   */
  const historyUsable = historyLooksLikePerformance(values);
  const contributionsUsable = contributionsExplainValue({ netContributed, currentValue });

  const twr = historyUsable ? timeWeightedReturn(values, external) : null;

  return {
    baseCurrency: base,
    currentValue,
    externalFlows: external.length,
    /** Net of deposits against withdrawals — what you have actually put in. */
    netContributed,
    timeWeighted: twr,
    /**
     * The same measurement as a line, for drawing against a benchmark.
     *
     * Built here and not in `actions/benchmark.ts` because `values` and
     * `external` are assembled here: rebuilding them there would be a second
     * definition of what a flow is and which value series counts, and the two
     * would drift. Empty whenever the figure above is withheld, so a chart can
     * never show a return the app has declined to state.
     */
    timeWeightedCurve: historyUsable ? timeWeightedSeries(values, external) : [],
    moneyWeighted: contributionsUsable ? internalRateOfReturn(irrFlows) : null,
    coverage: returnCoverage(values, external),
    /**
     * Why a figure is missing, in words the page can show. Null when it is
     * there.
     */
    withheld: {
      timeWeighted: historyUsable
        ? null
        : "The value history starts when the accounts were first connected, so its early growth is data arriving rather than the portfolio performing. This becomes measurable once there is a stretch of history that begins with the portfolio already whole.",
      moneyWeighted: contributionsUsable
        ? null
        : "Deposits and withdrawals are only recorded for platforms that report them, and they do not account for what is held. A money-weighted return computed from an incomplete record of money going in would be a confident number answering a different question.",
    },
  };
}
