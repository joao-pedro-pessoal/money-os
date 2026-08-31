"use server";

import { db } from "@/db/client";
import {
  accounts,
  holdings,
  categories,
  transactions,
  platformBalances,
  accountConnections,
  positions,
  positionMeta,
  playlists,
  brokerEvents,
} from "@/db/schema";
import { reconstructHoldings } from "@/lib/portfolio/reconstruct";
import type { BrokerEvent } from "@/lib/csv/broker";
import { and, eq, gte, lt } from "drizzle-orm";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { toBase, isCurrencyCode } from "@/lib/fx";
import { marketValue, unrealizedPnL, isUnpriced } from "@/lib/portfolio";
import { STABLE_ASSET_TYPES, isStableAsset, classifyCoin } from "@/lib/portfolio/tags";
import type { PositionItem } from "@/lib/portfolio/positionView";
import { capitalAtRisk, collateralOverlap } from "@/lib/connectors/margin";
import { meaningOf, holdingCountsOnTop } from "@/lib/accounting/balanceScope";
import { compose, type AccountPart } from "@/lib/accounting/composition";
import { monthFlows, fixedRunway, needsClassifying } from "@/lib/accounting/fixedVariable";

/**
 * What each account is really made of, in the base currency.
 *
 * The dashboard shows one figure per account, but a figure alone can't say
 * whether it's guaranteed — €5 000 at a bank and €5 000 of ETFs are the same
 * number and completely different money. So the floating part comes back too,
 * to be shown in parentheses.
 */
export async function getAccountComposition() {
  const [accountRows, holdingRows, balanceRows, connectionRows, metaRows, rates, base] =
    await Promise.all([
      db.select().from(accounts).where(eq(accounts.active, true)),
      db.select().from(holdings),
      db.select().from(platformBalances),
      db.select().from(accountConnections),
      db.select().from(positionMeta),
      getRates(),
      getBaseCurrency(),
    ]);

  /** Tags set on the Positions page beat anything the ticker implies. */
  const assetTypeOf = new Map(metaRows.map((m) => [`${m.connectionId}:${m.coin}`, m.assetType]));

  const meaningByAccount = new Map(accountRows.map((a) => [a.id, meaningOf(a.balanceMeaning)]));
  const connectionAccount = new Map(connectionRows.map((c) => [c.id, c.accountId]));
  /**
   * What each platform's numbers are denominated in.
   *
   * The column is called `usdValue` and it is not always dollars — Trading 212
   * reports euros. Reading it as USD scaled a €144.84 balance to about €125 on
   * the dashboard, and the row looked entirely plausible while being wrong by
   * the whole exchange rate. Fixed in the net worth path already; this was the
   * same mistake, still standing in the per-account composition.
   */
  const currencyOfConnection = new Map(
    connectionRows.map((c) => [c.id, c.reportingCurrency ?? "USD"])
  );

  return accountRows.map((a) => {
    const parts: AccountPart[] = [];
    let pnl = 0;
    /**
     * Market-exposed things whose gain or loss cannot be worked out.
     *
     * Counted rather than silently added as zero. Two sources, and both used to
     * disappear into the total: a holding with no price yet, and a synced
     * exchange balance, which has a value but no record of what it cost.
     */
    let pnlUnmeasured = 0;

    // The balance itself. For an account whose balance already contains its
    // positions, the split can't be known from a single number, so it is
    // reported as stable — the positions below are not added again either way.
    const balanceInBase = toBase(Number(a.balance), a.currency, rates, base);
    if (balanceInBase !== null) parts.push({ value: balanceInBase, floating: false });

    for (const h of holdingRows) {
      if (h.accountId !== a.id) continue;
      if (!holdingCountsOnTop(h.accountId, meaningByAccount)) continue;

      const entry = Number(h.avgEntryPrice);
      const shaped = {
        quantity: Number(h.quantity),
        avgEntryPrice: entry,
        currentPrice: h.currentPrice === null ? entry : Number(h.currentPrice),
        direction: h.direction,
      };
      const value = toBase(marketValue(shaped), h.currency, rates, base);
      if (value === null) continue;

      const stable = h.assetType !== null && STABLE_ASSET_TYPES.includes(h.assetType);
      parts.push({ value, floating: !stable });

      if (!stable) {
        /**
         * An unpriced holding has no gain to report.
         *
         * `shaped.currentPrice` falls back to the entry price a few lines up,
         * which is what the position itself stores when nothing has priced it
         * — so `unrealizedPnL` returns exactly 0 for it. That zero is not a
         * measurement of a flat position, it is the absence of one, and it is
         * how twelve rows once read `+0,00 €` on a portfolio that was up.
         */
        const converted = isUnpriced({
          avgEntryPrice: entry,
          currentPrice: shaped.currentPrice,
          quoteSymbol: h.quoteSymbol,
          lastPriceUpdate: h.lastPriceUpdate,
        })
          ? null
          : toBase(unrealizedPnL(shaped), h.currency, rates, base);

        if (converted === null) pnlUnmeasured += 1;
        else pnl += converted;
      }
    }

    // Synced spot balances that are a pool of their own.
    for (const b of balanceRows) {
      if (connectionAccount.get(b.connectionId) !== a.id) continue;
      if (b.usdValue === null || !b.countsInPortfolio) continue;
      const value = toBase(
        Number(b.usdValue),
        currencyOfConnection.get(b.connectionId) ?? "USD",
        rates,
        base
      );
      if (value === null) continue;
      const floating = !isStableAsset(b.coin, assetTypeOf.get(`${b.connectionId}:${b.coin}`));
      parts.push({ value, floating });

      /**
       * A synced balance knows what it is worth and not what it cost.
       *
       * The exchange reports a quantity and a mark price; nothing in that says
       * what was paid. So these carry value into `floating` and can carry no
       * gain at all — and before this they simply were not counted either way,
       * which made the P&L look complete while omitting them.
       */
      if (floating) pnlUnmeasured += 1;
    }

    return {
      id: a.id,
      name: a.name,
      institution: a.institution,
      currency: a.currency,
      accountType: a.accountType,
      composition: compose(parts, pnl, pnlUnmeasured),
    };
  });
}

/**
 * Everything you hold, in one shape.
 *
 * Manual holdings, synced positions and synced coin balances all become the
 * same kind of row, so one table can group them by asset type or playlist and
 * one chart can measure whatever that table is showing. Before this, the
 * allocation chart counted manual holdings only — an account that was entirely
 * synced showed "No data yet" while holding real money.
 */
export async function getPortfolioItems() {
  const [holdingRows, positionRows, balanceRows, metaRows, connRows, accountRows, playlistRows, rates, base] =
    await Promise.all([
      db.select().from(holdings),
      db.select().from(positions),
      db.select().from(platformBalances),
      db.select().from(positionMeta),
      db.select().from(accountConnections),
      db.select().from(accounts),
      db.select().from(playlists),
      getRates(),
      getBaseCurrency(),
    ]);

  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const playlistName = new Map(playlistRows.map((p) => [p.id, p.name]));
  const connOf = new Map(connRows.map((c) => [c.id, c]));
  const metaFor = new Map(metaRows.map((m) => [`${m.connectionId}:${m.coin}`, m]));
  const meaningByAccount = new Map(accountRows.map((a) => [a.id, meaningOf(a.balanceMeaning)]));

  const items: PositionItem[] = [];

  /**
   * Manual holdings, including the ones already inside their account's balance.
   *
   * These used to be skipped entirely when the account said its balance already
   * contained them — so recording an ETF on a Trade Republic account made it
   * vanish: not in the table, not anywhere, with nothing to say why. The rule
   * being enforced is "never added to Net Worth twice", and hiding the row is a
   * much heavier remedy than the problem needs.
   *
   * They are listed and flagged `insideBalance` instead, exactly like an
   * exchange's open positions: visible as part of what you hold, never added on
   * top of the balance that already contains them.
   */
  for (const h of holdingRows) {
    const countsOnTop = holdingCountsOnTop(h.accountId, meaningByAccount);
    const entry = Number(h.avgEntryPrice);
    const shaped = {
      quantity: Number(h.quantity),
      avgEntryPrice: entry,
      currentPrice: h.currentPrice === null ? entry : Number(h.currentPrice),
      direction: h.direction,
    };
    const value = toBase(marketValue(shaped), h.currency, rates, base);
    if (value === null) continue;

    items.push({
      id: `h:${h.id}`,
      symbol: h.symbol,
      side: h.direction === "short" ? "short" : "long",
      accountName: (h.accountId ? accountName.get(h.accountId) : null) ?? h.platform ?? "—",
      platform: h.platform ?? "manual",
      assetType: h.assetType,
      playlistName: h.playlistId ? playlistName.get(h.playlistId) ?? null : null,
      riskLevel: h.riskLevel,
      timeHorizon: h.timeHorizon,
      value,
      notional: value,
      leverage: null,
      pnl: toBase(unrealizedPnL(shaped), h.currency, rates, base) ?? 0,
      source: "manual",
      /**
       * Sitting at its purchase price because nobody has priced it.
       *
       * Without this the table reported "+0.00" for a position adopted from a
       * statement — a measurement saying the market hadn't moved, when in fact
       * nothing had been measured. The two are different claims and only one of
       * them is true.
       */
      atCost: isUnpriced({
        avgEntryPrice: entry,
        currentPrice: shaped.currentPrice,
        quoteSymbol: h.quoteSymbol,
        lastPriceUpdate: h.lastPriceUpdate,
      }),
      insideBalance: !countsOnTop,
      apr: h.apr === null ? null : Number(h.apr),
    });
  }

  // Open trades from a connection. Their value already sits inside the
  // account's equity, so this is a view of what you hold, not a second total.
  for (const p of positionRows) {
    const conn = connOf.get(p.connectionId);
    const meta = metaFor.get(`${p.connectionId}:${p.coin}`);

    const risk = capitalAtRisk({
      positionValue: p.positionValue === null ? null : Number(p.positionValue),
      marginUsed: p.marginUsed === null ? null : Number(p.marginUsed),
      leverage: p.leverage === null ? null : Number(p.leverage),
    });

    const reported = conn?.reportingCurrency ?? "USD";
    const value = toBase(risk.atRisk, reported, rates, base);
    const notional = toBase(risk.notional, reported, rates, base);
    if (value === null || notional === null) continue;

    items.push({
      id: `p:${p.id}`,
      symbol: p.coin,
      side: p.side === "short" ? "short" : "long",
      accountName: accountName.get(p.accountId) ?? "—",
      platform: conn?.platform ?? "—",
      assetType: meta?.assetType ?? null,
      playlistName: meta?.playlistId ? playlistName.get(meta.playlistId) ?? null : null,
      riskLevel: meta?.riskLevel ?? null,
      timeHorizon: meta?.timeHorizon ?? null,
      value,
      notional,
      leverage: risk.leverage,
      pnl: toBase(p.unrealizedPnl === null ? 0 : Number(p.unrealizedPnl), reported, rates, base) ?? 0,
      source: "synced",
      // An open trade's value is already inside the account's equity.
      insideBalance: true,
      apr: meta?.apr === null || meta?.apr === undefined ? null : Number(meta.apr),
    });
  }

  /**
   * Coin and currency balances.
   *
   * `countsInPortfolio` is false when the balance is a *breakdown* of the
   * account's equity rather than money beside it — IBKR reports your EUR cash
   * that way, because `netliquidationvalue` already contains it.
   *
   * Those rows used to be skipped entirely, so the euros sitting at IBKR were
   * counted in Net Worth (through the account balance) but were invisible as an
   * asset. They belong in the picture; they just must not be added on top.
   */
  /**
   * Collateral is counted once, not twice.
   *
   * On a unified account the money behind an open trade never leaves the spot
   * balance, so the balance and the position's capital at risk described the
   * same euros. `collateralOverlap` says how much, per connection, and it is
   * taken off the balances rather than off the positions: that way each row
   * still shows a number that means something — the balance shows what is free,
   * the position shows what it ties up — and together they add to the pot.
   *
   * Taken from the largest balance first, and never below zero, so a rounding
   * difference between what the venue calls margin and what the balances are
   * worth cannot turn into a negative holding.
   */
  const overlapLeft = new Map<string, number>();
  for (const conn of connRows) {
    const positionsHere = positionRows.filter((p) => p.connectionId === conn.id).length;
    const balancesSeparate = balanceRows.some(
      (b) => b.connectionId === conn.id && b.countsInPortfolio
    );
    const overlap = collateralOverlap({
      balancesAreSeparatePool: balancesSeparate,
      marginUsed: conn.lastMarginUsed === null ? null : Number(conn.lastMarginUsed),
      openPositions: positionsHere,
    });
    if (overlap > 0) {
      const inBase = toBase(overlap, conn.reportingCurrency ?? "USD", rates, base);
      if (inBase !== null) overlapLeft.set(conn.id, inBase);
    }
  }

  const balancesLargestFirst = [...balanceRows].sort(
    (a, b) => Number(b.usdValue ?? 0) - Number(a.usdValue ?? 0)
  );

  for (const b of balancesLargestFirst) {
    if (b.usdValue === null) continue;
    const conn = connOf.get(b.connectionId);
    /**
     * A cash balance is denominated in itself, not in the platform's currency.
     *
     * The platform's reporting currency is right for a token — an amount of BTC
     * is worth so many dollars because IBKR reports in dollars. It is wrong for
     * cash: 1.75 EUR held at a dollar-reporting broker is 1.75 euros, and
     * converting it turned them into 1,50 €. `listBalances` was fixed for this
     * and this path was not, so the Positions page and the Investments page
     * disagreed about the same balance by the exchange rate.
     */
    const platformCurrency = conn?.reportingCurrency ?? "USD";
    const denominated = isCurrencyCode(b.coin) ? b.coin.toUpperCase() : platformCurrency;
    const gross = toBase(Number(b.usdValue), denominated, rates, base);
    if (gross === null || gross === 0) continue;

    // Whatever of this balance is already reported as an open position's margin.
    const owed = overlapLeft.get(b.connectionId) ?? 0;
    const taken = Math.min(owed, gross);
    if (taken > 0) overlapLeft.set(b.connectionId, Math.round((owed - taken) * 100) / 100);
    const value = Math.round((gross - taken + Number.EPSILON) * 100) / 100;
    if (value === 0) continue;

    items.push({
      id: `b:${b.id}`,
      symbol: b.coin,
      side: null,
      accountName: conn ? accountName.get(conn.accountId) ?? "—" : "—",
      platform: conn?.platform ?? "—",
      /**
       * The tag you set wins; the ticker is only the fallback.
       *
       * Fiat is cash and a token that tracks it is a stablecoin — but the
       * symbol list can only recognise what someone thought to add, and this
       * ignored the tag entirely. Marking a balance as a stablecoin on the
       * Positions page changed nothing, and the money went on being reported
       * as market-exposed.
       */
      assetType:
        metaFor.get(`${b.connectionId}:${b.coin}`)?.assetType ?? classifyCoin(b.coin),
      playlistName: null,
      riskLevel: null,
      timeHorizon: null,
      value,
      notional: value,
      leverage: null,
      /**
       * A real P&L where the venue states what the holding cost.
       *
       * This was hard-coded to 0, so a HYPE balance up about 3 € rendered
       * "+0,00 €" — a claim that the holding is exactly flat, which is a
       * measurement nobody's holding has ever produced. Hyperliquid reports
       * `entryNtl` and it was being discarded at every step.
       */
      pnl: (() => {
        if (b.costBasis === null) return 0;
        const cost = toBase(Number(b.costBasis), denominated, rates, base);
        return cost === null ? 0 : Math.round((value - cost + Number.EPSILON) * 100) / 100;
      })(),
      /**
       * True when nobody said what this cost, so the P&L above is not a
       * measurement and must not be shown as one. The screen prints a dash.
       */
      costUnknown: b.costBasis === null,
      source: "balance",
      insideBalance: !b.countsInPortfolio,
      // A stablecoin or currency balance can be earning; the platform doesn't
      // say, so the rate is whatever you told us on the Positions page.
      apr: (() => {
        const m = metaFor.get(`${b.connectionId}:${b.coin}`);
        return m?.apr === null || m?.apr === undefined ? null : Number(m.apr);
      })(),
    });
  }

  /**
   * Positions rebuilt from imported broker statements.
   *
   * For Trade Republic this is the only way its ETFs can ever appear here: no
   * API exists, so the transaction export is the sole record of what is held.
   * Quantity is exact — buys minus sells — and the value shown is what it cost,
   * because the file carries prices paid and not prices today.
   *
   * `insideBalance` follows the account's own declaration, which is what stops
   * this becoming the ninth double count: an account whose balance already
   * contains its investments gets these rows as detail, not as an addition.
   */
  const statementRows = await db.select().from(brokerEvents);
  if (statementRows.length > 0) {
    const byAccount = new Map<string, typeof statementRows>();
    for (const r of statementRows) {
      if (!byAccount.has(r.accountId)) byAccount.set(r.accountId, []);
      byAccount.get(r.accountId)!.push(r);
    }

    for (const [accountId, rows] of byAccount) {
      const account = accountRows.find((a) => a.id === accountId);
      if (!account) continue;

      /**
       * Skipped when a connector already reports this account's positions.
       *
       * Trading 212 both syncs and exports, and replaying its statement beside
       * its live positions would list every share twice. The live sync wins
       * because it is current; the statement stays available as a cross-check
       * on the analysis page.
       */
      const syncedHere = positionRows.some((p) => p.accountId === accountId);
      if (syncedHere) continue;

      /**
       * Instruments already adopted into real positions.
       *
       * Once "Create positions" has run, the same ETF exists twice: as a row in
       * `holdings` and as this live replay of the file. Both were listed, so
       * the table showed every Trade Republic instrument twice — once priced
       * and once at cost — and the totals counted each of them twice over.
       *
       * The adopted row wins because it is the one that can carry a price and a
       * tag. Matched on the ISIN, which adoption stores in `name`.
       */
      const adoptedIsins = new Set(
        holdingRows
          .filter((h) => h.accountId === accountId && h.name)
          .map((h) => h.name!.trim().toUpperCase())
      );

      const reconstruction = reconstructHoldings(
        rows.map((r) => ({
          date: r.date,
          kind: r.kind as BrokerEvent["kind"],
          symbol: r.symbol,
          isin: r.isin,
          quantity: r.quantity === null ? null : Number(r.quantity),
          price: r.price === null ? null : Number(r.price),
          amount: Number(r.amount),
          fees: r.fees === null ? null : Number(r.fees),
          currency: r.currency,
          description: r.description,
          externalId: r.externalId,
          line: 0,
        }))
      );

      for (const h of reconstruction.holdings) {
        if (h.quantity <= 0) continue;
        if (h.isin && adoptedIsins.has(h.isin.toUpperCase())) continue;
        const value = toBase(h.costBasis, rows[0]?.currency ?? account.currency, rates, base);
        if (value === null || value === 0) continue;

        items.push({
          id: `s:${accountId}:${h.key}`,
          symbol: h.symbol ?? h.key,
          side: "long",
          accountName: accountName.get(accountId) ?? "—",
          platform: account.institution,
          assetType: null,
          playlistName: null,
          riskLevel: null,
          timeHorizon: null,
          value,
          notional: value,
          leverage: null,
          // No market price, so no unrealised profit. Zero is the honest
          // answer; a guess would be a number people would act on.
          pnl: 0,
          source: "statement",
          atCost: true,
          insideBalance: !holdingCountsOnTop(accountId, meaningByAccount),
          // A statement says nothing about yield; tag it on the Positions page.
          apr: null,
        });
      }
    }
  }

  return { items, baseCurrency: base };
}

/**
 * This month split into what's already decided and what isn't.
 *
 * A single "expenses" figure can't answer the question that matters when money
 * is tight: how much of this month is settled before I do anything?
 */
export async function getMonthShape() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [txRows, categoryRows, base] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, start), lt(transactions.date, end))),
    db.select().from(categories),
    getBaseCurrency(),
  ]);

  /**
   * Converted before anything is added up.
   *
   * A transaction carries its own currency, and summing a dollar expense with a
   * euro one produced a figure in no currency at all — displayed with the base
   * currency's symbol, which is what made it invisible.
   *
   * A row with no available rate is dropped rather than counted raw: leaving it
   * out understates the month, counting it unconverted misstates it by the
   * exchange rate, and only one of those two is honest about what it doesn't
   * know.
   */
  const rates = await getRates();
  const rows = txRows
    .map((t) => ({
      amount: toBase(Number(t.amount), t.currency, rates, base),
      categoryId: t.categoryId,
      type: t.type as "income" | "expense" | "transfer" | "investment_contribution",
    }))
    .filter((r): r is { amount: number; categoryId: string | null; type: typeof r.type } =>
      r.amount !== null
    );

  const flows = monthFlows(
    rows,
    categoryRows.map((c) => ({ id: c.id, fixed: c.fixed }))
  );

  // Only categories that have never been marked fixed are worth nagging about;
  // "variable" is a real answer, not an absent one. `fixed` defaults to false,
  // so this asks about expense categories carrying money that are still false.
  const unclassified = needsClassifying(
    rows.filter((r) => r.type === "expense"),
    categoryRows
      .filter((c) => c.kind === "expense")
      .map((c) => ({ id: c.id, name: c.name, fixed: c.fixed, touched: c.fixed }))
  );

  return { flows, unclassified, baseCurrency: base };
}

/** Months of fixed costs the free cash covers. */
export async function getFixedRunway(availableCash: number) {
  const { flows } = await getMonthShape();
  return {
    months: fixedRunway(availableCash, flows.expenses.fixed),
    monthlyFixed: flows.expenses.fixed,
  };
}
