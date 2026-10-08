import type { TradeHistoryRow } from './filter';
import { matchTradeOpenings } from './tradeMatches';

type Classification = NonNullable<TradeHistoryRow['classification']>;

/**
 * The classification each fill answers to: its own, or the one of the trade it
 * is part of.
 *
 * A classification is saved on one stored event (`setTradeClassification`),
 * and a venue splits one order into several fills. A short on ZRO closed at
 * 15:49:24 arrived as three rows; putting "the trade" in a playlist from the
 * history classified the one row that was clicked, and the playlist counted
 * 1.91 of a 5.68 result.
 *
 * Two kinds of sibling share a classification here, when reading — nothing
 * stored changes:
 * - the fills of one order: same account, connection, currency, instrument,
 *   side, description and second;
 * - a closing fill and the fills that opened what it closed, as
 *   `matchTradeOpenings` pairs them.
 *
 * A fill's own classification always wins, including one saved with every
 * field empty: that is a decision, not an absence. Where the siblings disagree
 * nothing is shared — guessing which strategy a fill belonged to is worse than
 * leaving it unclassified. And never from a live position: a coin held in a
 * playlist does not claim the trades made on it.
 */
export function shareTradeClassification<T extends TradeHistoryRow>(rows: readonly T[]): T[] {
  const own = new Map<string, Classification>();
  for (const row of rows) if (row.classification) own.set(row.id, row.classification);
  if (own.size === 0) return [...rows];

  const orders = new Map<string, T[]>();
  for (const row of rows) {
    const key = orderKey(row);
    orders.set(key, [...(orders.get(key) ?? []), row]);
  }

  /** Own, or agreed by the rest of the order: the first stage. */
  const fromOrder = new Map<string, { classification: Classification; from: string }>();
  for (const row of rows) {
    const mine = own.get(row.id);
    if (mine) {
      fromOrder.set(row.id, { classification: mine, from: row.id });
      continue;
    }
    const agreed = agree((orders.get(orderKey(row)) ?? []).map((r) => r.id), own);
    if (agreed) fromOrder.set(row.id, agreed);
  }

  /** A closing fill still without one takes what opened its position, when that agrees. */
  const openings = matchTradeOpenings(rows);
  const settled = new Map(fromOrder);
  for (const row of rows) {
    if (settled.has(row.id)) continue;
    const match = openings.get(row.id);
    if (!match || match.openings.length === 0) continue;
    const opened = match.openings.map((o) => fromOrder.get(o.id)).filter((c) => c !== undefined);
    const agreed = agreeOn(opened);
    if (agreed) settled.set(row.id, agreed);
  }

  return rows.map((row) => {
    const found = settled.get(row.id);
    if (!found || found.from === row.id) return row;
    return { ...row, classification: { ...found.classification, notes: null, sharedFrom: found.from } };
  });
}

function orderKey(row: TradeHistoryRow): string {
  return JSON.stringify([
    row.accountId ?? '', row.connectionId ?? '', row.currency, row.symbol ?? '', row.type,
    row.description ?? '', row.date.slice(0, 19),
    // A broker lifecycle is stronger evidence than the same closing second.
    row.brokerPositionId?.trim() || null,
  ]);
}

/** Everything but the notes, which belong to the fill they were written on. */
function signature(c: Classification): string {
  return JSON.stringify([c.assetType, c.riskLevel, c.expectedReturn, c.timeHorizon, c.liquidity, c.apr, c.playlistId]);
}

function agree(ids: string[], own: Map<string, Classification>) {
  return agreeOn(ids.flatMap((id) => {
    const c = own.get(id);
    return c ? [{ classification: c, from: id }] : [];
  }));
}

function agreeOn(found: { classification: Classification; from: string }[]) {
  if (found.length === 0) return null;
  const first = signature(found[0].classification);
  return found.every((f) => signature(f.classification) === first) ? found[0] : null;
}
