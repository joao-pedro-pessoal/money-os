"use server";

import { db } from "@/db/client";
import { brokerEvents, accounts, positions, holdings, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  parseBrokerCsv,
  inspectBrokerCsv,
  naturalKey,
  matchTicker,
  summariseCashFlows,
  growthBreakdown,
  checkOpeningBalance,
  cumulativeHistory,
  type BrokerEvent,
} from "@/lib/csv/broker";
import { reconstructHoldings, gainAgainstCost } from "@/lib/portfolio/reconstruct";

/**
 * Reads a statement and says what it would do, writing nothing.
 *
 * A preview rather than a straight import, for the same reason the bank
 * importer has one: a broker export is the sort of file you only look at once,
 * and finding out afterwards that half of it was rejected is too late.
 */
export async function previewBrokerStatement(text: string, accountId: string) {
  // The file is inspected before it is parsed, so an export the app has never
  // seen reports which columns it couldn't recognise instead of failing with a
  // single unhelpful sentence. Nothing here writes; the file has to be safe to
  // point at a database that won't change.
  const inspection = inspectBrokerCsv(text);
  if (!inspection.readable) {
    return { ok: false as const, inspection };
  }

  const { events, rejected } = parseBrokerCsv(text);

  const known = await db.select().from(positions);
  const tickers = [...new Set(known.map((p) => p.coin))];

  const existing = await db
    .select({ naturalKey: brokerEvents.naturalKey })
    .from(brokerEvents)
    .where(eq(brokerEvents.accountId, accountId));
  const seen = new Set(existing.map((e) => e.naturalKey));

  const withKeys = events.map((e) => ({
    event: e,
    key: naturalKey(e),
    ticker: e.symbol === null ? null : matchTicker(e.symbol, tickers),
  }));

  const duplicates = withKeys.filter((e) => seen.has(e.key));
  const fresh = withKeys.filter((e) => !seen.has(e.key));

  const flows = summariseCashFlows(events);
  const opening = checkOpeningBalance(events);

  // What the file says you hold. Shown before importing because it is the
  // cheapest way to tell a correctly-read statement from a plausibly-read one:
  // the quantities either match what the broker's own app shows, or they don't.
  const reconstruction = reconstructHoldings(events);

  return {
    ok: true as const,
    inspection,
    total: events.length,
    toImport: fresh.length,
    duplicates: duplicates.length,
    rejected,
    byKind: countKinds(events),
    flows,
    opening,
    holdings: reconstruction.holdings.map((h) => ({
      key: h.key,
      isin: h.isin,
      symbol: h.symbol,
      quantity: h.quantity,
      costBasis: h.costBasis,
      incomplete: h.incomplete,
      reasons: h.reasons,
    })),
    totalCostBasis: reconstruction.totalCostBasis,
    /** Symbols the file names that no open position matches. */
    unmatchedSymbols: [
      ...new Set(
        withKeys
          .filter((e) => e.event.symbol !== null && e.ticker === null)
          .map((e) => e.event.symbol!)
      ),
    ],
  };
}

function countKinds(events: readonly BrokerEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Writes the statement.
 *
 * Every row is stored, including the ones already there — the unique key on
 * (account, naturalKey) turns a re-import into a no-op rather than a duplicate.
 * Importing the same file twice is a normal thing to do by accident.
 */
export async function importBrokerStatement(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const text = String(formData.get("statement") ?? "");
  if (!accountId) throw new Error("Choose the account this statement belongs to.");

  const { events, rejected } = parseBrokerCsv(text);
  if (events.length === 0) {
    throw new Error("Nothing readable in that file. Check it's the transaction export.");
  }

  const known = await db.select().from(positions);
  const tickers = [...new Set(known.map((p) => p.coin))];

  await db
    .insert(brokerEvents)
    .values(
      events.map((e) => ({
        accountId,
        date: e.date,
        kind: e.kind,
        symbol: e.symbol,
        isin: e.isin,
        ticker: e.symbol === null ? null : matchTicker(e.symbol, tickers),
        quantity: e.quantity === null ? null : String(e.quantity),
        price: e.price === null ? null : String(e.price),
        amount: String(e.amount),
        fees: e.fees === null ? null : String(e.fees),
        currency: e.currency,
        description: e.description,
        externalId: e.externalId,
        naturalKey: naturalKey(e),
      }))
    )
    .onConflictDoNothing();

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: accountId,
    action: "broker_statement_imported",
    details: JSON.stringify({ rows: events.length, rejected: rejected.length }),
  });

  revalidatePath("/investments/analysis");
  revalidatePath("/investments/dividends");
  return { imported: events.length, rejected: rejected.length };
}

/**
 * What the account did, split between money you added and money you made.
 *
 * Returns null when no statement has been imported: without one there is no
 * honest way to tell a deposit from a gain, and guessing is what the whole
 * exercise is meant to stop.
 */
export async function getContributionBreakdown() {
  const rows = await db.select().from(brokerEvents);
  if (rows.length === 0) return null;

  const events: BrokerEvent[] = rows.map((r) => ({
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
  }));

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accountRows = await db.select().from(accounts);
  const currentValue = accountRows
    .filter((a) => accountIds.includes(a.id))
    .reduce((s, a) => s + Number(a.balance), 0);

  const flows = summariseCashFlows(events);
  const opening = checkOpeningBalance(events);

  return {
    flows,
    opening,
    // With an incomplete statement the opening balance is unknown, so the
    // "gain" would be whatever is missing. Reported as null instead of wrong.
    growth: opening.needsOpeningBalance ? null : growthBreakdown(currentValue, flows),
    currentValue,
    events: events.length,
    accountNames: accountRows.filter((a) => accountIds.includes(a.id)).map((a) => a.name),
  };
}

/**
 * Turns the statement's positions into ones you can edit.
 *
 * A reconstruction is read-only by nature: it is a replay of a file, so there
 * is nothing to change without changing the file. But these are real holdings,
 * and everything the app offers a holding — an asset type, a playlist, a risk
 * level, a price you keep up to date — was out of reach for them.
 *
 * So they become ordinary manual holdings, seeded with the quantity and the
 * average cost the statement proves. From that moment they behave like any
 * position you typed in yourself.
 *
 * Two things make this safe to press twice:
 *
 *  - Matched on account and ISIN, so a second run updates rather than
 *    duplicates. Quantity and cost come from the statement either way; your
 *    tags are never touched.
 *  - The account's balance already contains these, so they are shown and never
 *    added to Net Worth again. That is the `bank_and_broker` declaration doing
 *    its job, and it is why this can't inflate anything.
 */
export async function adoptStatementPositions(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) throw new Error("Which account?");
  return adoptForAccount(accountId);
}

/**
 * Every account with a statement, made real in one go.
 *
 * Exists because the split between "reconstruct" and "adopt" was a distinction
 * this app cared about and nobody else did. Someone looking at twelve positions
 * on screen has no way to know they are a live replay of a file rather than
 * rows — and the difference only surfaced as a button that reported nothing to
 * do. Anything that needs real positions can call this and stop caring.
 *
 * Idempotent, so calling it before every operation costs one query.
 */
export async function adoptAllStatements() {
  const [rows, positionRows] = await Promise.all([
    db.select().from(brokerEvents),
    db.select().from(positions),
  ]);

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  let created = 0;
  let updated = 0;

  for (const accountId of accountIds) {
    // A connector already reports this account's positions; replaying the
    // statement beside them would list every share twice.
    if (positionRows.some((p) => p.accountId === accountId)) continue;

    const result = await adoptForAccount(accountId);
    created += result.created;
    updated += result.updated;
  }

  return { created, updated };
}

async function adoptForAccount(accountId: string) {
  const rows = await db
    .select()
    .from(brokerEvents)
    .where(eq(brokerEvents.accountId, accountId));
  if (rows.length === 0) throw new Error("No statement has been imported for this account.");

  const events: (BrokerEvent & { isin: string | null })[] = rows.map((r) => ({
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
  }));

  const { holdings: rebuilt } = reconstructHoldings(events);
  const existing = await db.select().from(holdings);
  const currency = rows[0]?.currency ?? "EUR";

  let created = 0;
  let updated = 0;

  for (const h of rebuilt) {
    if (h.quantity <= 0 || h.averageCost === null) continue;

    // The instrument's own name is a better label than a twelve-character code,
    // and the ISIN is kept underneath it either way.
    const symbol = (h.symbol ?? h.key).slice(0, 120);
    const match = existing.find(
      (e) => e.accountId === accountId && (e.name === h.isin || e.symbol === symbol)
    );

    if (match) {
      /**
       * Quantity and cost only.
       *
       * A tag you set by hand is a judgement the statement knows nothing about,
       * and overwriting it on every re-import would make tagging pointless.
       */
      await db
        .update(holdings)
        .set({
          quantity: String(h.quantity),
          avgEntryPrice: String(h.averageCost),
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, match.id));
      updated += 1;
      continue;
    }

    await db.insert(holdings).values({
      symbol,
      // The ISIN lives in `name` so it survives beside the label and can be
      // matched on next time.
      name: h.isin ?? "",
      accountId,
      quantity: String(h.quantity),
      avgEntryPrice: String(h.averageCost),
      /**
       * Opened at cost, deliberately.
       *
       * The statement carries no price for today, and an invented one would
       * show a profit that nobody measured. Starting at cost reports zero
       * until you update it, which is the honest opening claim.
       */
      currentPrice: String(h.averageCost),
      currency,
      direction: "long",
      /**
       * Never priced, and recorded as such.
       *
       * Stamping a date here would claim the price was checked today when it is
       * simply the purchase price wearing the current-price field. The
       * interface reads this to show a dash instead of "+0.00", which is the
       * difference between "nothing has moved" and "nothing has been measured".
       */
      lastPriceUpdate: null,
    });
    created += 1;
  }

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: accountId,
    action: "statement_positions_adopted",
    details: JSON.stringify({ created, updated }),
  });

  revalidatePath("/investments");
  revalidatePath("/positions");
  revalidatePath("/investments/analysis");
  return { created, updated };
}

/**
 * What has actually been imported, per account.
 *
 * Exists because "I imported it and nothing happened" is impossible to diagnose
 * from a screen that shows only the result. The rows either reached this
 * account or they didn't, and until now there was no way to tell which — the
 * commonest cause being a broker export sent through the bank importer at the
 * top of the same page, which stores transactions and no instruments at all.
 */
export async function listKnownIsins(): Promise<string[]> {
  const rows = await db.select().from(brokerEvents);
  return [...new Set(rows.map((r) => r.isin).filter((i): i is string => i !== null))].sort();
}

export async function getImportedStatements() {
  const [rows, accountRows] = await Promise.all([
    db.select().from(brokerEvents),
    db.select().from(accounts),
  ]);

  const nameOf = new Map(accountRows.map((a) => [a.id, `${a.institution} — ${a.name}`]));
  const byAccount = new Map<string, { rows: number; first: Date; last: Date; symbols: Set<string> }>();

  for (const r of rows) {
    const seen = byAccount.get(r.accountId);
    const key = r.isin ?? r.symbol;
    if (!seen) {
      byAccount.set(r.accountId, {
        rows: 1,
        first: r.date,
        last: r.date,
        symbols: new Set(key ? [key] : []),
      });
      continue;
    }
    seen.rows += 1;
    if (r.date < seen.first) seen.first = r.date;
    if (r.date > seen.last) seen.last = r.date;
    if (key) seen.symbols.add(key);
  }

  return [...byAccount.entries()].map(([accountId, s]) => ({
    accountId,
    accountName: nameOf.get(accountId) ?? "(deleted account)",
    rows: s.rows,
    /** Distinct instruments named. Zero means nothing to rebuild a holding from. */
    instruments: s.symbols.size,
    from: s.first.toISOString().slice(0, 10),
    to: s.last.toISOString().slice(0, 10),
  }));
}

/**
 * Where the money went, read back out of the statement.
 *
 * Everything here was already stored at import — the rows are kept verbatim
 * precisely so questions nobody had thought of yet can still be asked. This is
 * one of those questions: not "what is my portfolio worth" but "what did I do
 * with the money, and what did it pay me".
 *
 * Deliberately about cost and cash, never market value. The statement records
 * what you paid and what you received, both exact; what those shares are worth
 * today is not in the file and is not invented here.
 */
export async function getStatementBreakdown() {
  const rows = await db.select().from(brokerEvents);
  if (rows.length === 0) return null;

  const events: (BrokerEvent & { isin: string | null })[] = rows.map((r) => ({
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
  }));

  const reconstruction = reconstructHoldings(events);
  const flows = summariseCashFlows(events);

  /**
   * The other half of the subtraction.
   *
   * The statement knows what these shares cost. An account that declares what
   * it is worth today knows the rest, and value minus cost is the unrealised
   * gain — exact, with no market prices involved at all.
   *
   * Only from accounts that both declare a value and have a statement here, so
   * the two sides describe the same holdings.
   */
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const declaringAccounts = (await db.select().from(accounts)).filter(
    (a) =>
      accountIds.includes(a.id) &&
      a.balanceMeaning === "bank_and_broker" &&
      a.investedValue !== null
  );

  const declaredValue =
    declaringAccounts.length === 0
      ? null
      : Math.round(
          declaringAccounts.reduce(
            (sum, a) => sum + Math.min(Number(a.investedValue ?? 0), Number(a.balance)),
            0
          ) * 100
        ) / 100;

  const gain = gainAgainstCost(declaredValue, reconstruction.totalCostBasis);

  /**
   * Interest is listed payment by payment, not as one total.
   *
   * It arrives in small amounts on a rhythm, and the rhythm is the useful part:
   * a total says you earned €1.34, a list says whether it is still arriving.
   */
  const interest = events
    .filter((e) => e.kind === "INTEREST")
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      amount: e.amount,
      currency: e.currency,
      description: e.description,
    }));

  const dividends = events
    .filter((e) => e.kind === "DIVIDEND")
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      amount: e.amount,
      currency: e.currency,
      symbol: e.symbol,
    }));

  const sum = (list: { amount: number }[]) =>
    Math.round(list.reduce((s, e) => s + e.amount, 0) * 100) / 100;

  const fees =
    Math.round(
      events.reduce(
        (s, e) => s + (e.fees ?? 0) + (e.kind === "FEE" ? Math.abs(e.amount) : 0),
        0
      ) * 100
    ) / 100;

  return {
    currency: rows[0]?.currency ?? "EUR",
    /** What you put in and took out across the account boundary. */
    flows,
    /** Where it ended up: one row per instrument, at what it cost. */
    holdings: reconstruction.holdings.map((h) => ({
      key: h.key,
      isin: h.isin,
      symbol: h.symbol,
      quantity: h.quantity,
      costBasis: h.costBasis,
      averageCost: h.averageCost,
      realizedPnl: h.realizedPnl,
      incomeReceived: h.incomeReceived,
      feesPaid: h.feesPaid,
      incomplete: h.incomplete,
      reasons: h.reasons,
      firstBought: h.firstBought === null ? null : h.firstBought.toISOString().slice(0, 10),
      lastTraded: h.lastTraded === null ? null : h.lastTraded.toISOString().slice(0, 10),
    })),
    stillInvested: reconstruction.totalCostBasis,
    /**
     * Value today against cost, when an account has said what it is worth.
     * Null when nothing declares a value — silence, not a gain of zero.
     */
    gain,
    /**
     * Realised profit on sales, computed by this app under the average-cost
     * method — Trading 212 publishes its own figure and it may differ. Kept
     * separate from income for that reason.
     */
    realizedPnl: reconstruction.totalRealizedPnl,
    interest: { payments: interest, total: sum(interest) },
    dividends: { payments: dividends, total: sum(dividends) },
    fees,
    lastEvent: reconstruction.lastEventDate?.toISOString().slice(0, 10) ?? null,
    events: events.length,
  };
}

/**
 * The part of the year the statement can account for.
 *
 * The value chart starts when snapshots start, because a snapshot is the only
 * record of what things were *worth*. A statement reaches further back but
 * carries prices paid, not prices on any later day — so this returns money
 * committed, cost of purchases and income received, and never a value line.
 */
export async function getStatementHistory() {
  const rows = await db.select().from(brokerEvents);
  if (rows.length === 0) return null;

  const events: BrokerEvent[] = rows.map((r) => ({
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
  }));

  const history = cumulativeHistory(events);
  return {
    history,
    from: history[0]?.date ?? null,
    to: history[history.length - 1]?.date ?? null,
    currency: rows[0]?.currency ?? "EUR",
  };
}
