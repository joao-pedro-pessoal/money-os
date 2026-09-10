import { isInstrumentTrade, directionOf } from './stats';
import type { TradeHistoryRow } from './filter';

export function isRealisedTrade(row: TradeHistoryRow): boolean {
  return isInstrumentTrade(row) && row.realizedPnl !== null && Number.isFinite(row.realizedPnl)
    && !/\bopen\b/i.test(row.description ?? '');
}

export interface TradeOpeningMatch {
  openings: { id: string; date: string; quantity: number }[];
  unmatched: number;
  method: "broker-position" | "broker-summary" | "fifo";
  brokerPositionId: string | null;
  /** Broker position creation time, not a fabricated opening execution. */
  openedAt: string | null;
}

const closing = (row: TradeHistoryRow) => /\bclos(?:e|ed)\b/i.test(row.description ?? '')
  || (!/\bopen\b/i.test(row.description ?? '') && (directionOf(row) === 'short' ? row.type === 'BUY' : row.type === 'SELL'));

/** IDs identify a lifecycle only within an account, connection, instrument and
 * currency. Without a lifecycle ID use FIFO, explicitly marked as an estimate.
 * Neither association changes P&L, tags, or the individual execution rows. */
export function matchTradeOpenings(rows: readonly TradeHistoryRow[]) {
  const queues = new Map<string, { row: TradeHistoryRow; remaining: number }[]>();
  const matches = new Map<string, TradeOpeningMatch>();
  const chronological = [...new Map(rows.map(r => [r.id, r])).values()]
    .filter(r => Number.isFinite(Date.parse(r.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || Number(closing(a)) - Number(closing(b)) || a.id.localeCompare(b.id));
  for (const row of chronological) {
    if (!isInstrumentTrade(row) || !row.symbol || !row.accountId) continue;
    const quantity = Math.abs(row.quantity ?? 0);
    const positionId = row.brokerPositionId?.trim() || null;
    if (row.brokerPositionSummary) {
      // A broker summary already identifies its position. Never consume an
      // unrelated fill queue or invent BUY events to make it look matched.
      const opened = row.brokerOpenedAt ? Date.parse(row.brokerOpenedAt) : NaN;
      const openedAt = positionId && Number.isFinite(opened) && opened <= Date.parse(row.date)
        ? new Date(opened).toISOString() : null;
      matches.set(row.id, { openings: [], unmatched: quantity, method: 'broker-summary', brokerPositionId: positionId, openedAt });
      continue;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const short = directionOf(row) === 'short';
    const key = JSON.stringify([row.accountId, row.connectionId ?? '', row.currency, row.symbol, short, positionId]);
    const queue = queues.get(key) ?? [];
    if (!closing(row)) queue.push({ row, remaining: quantity });
    else {
      let left = quantity;
      const openings: TradeOpeningMatch['openings'] = [];
      while (left > 1e-8 && queue.length) {
        const first = queue[0];
        const used = Math.min(left, first.remaining);
        openings.push({ id: first.row.id, date: first.row.date, quantity: used });
        left -= used;
        first.remaining -= used;
        if (first.remaining <= 1e-8) queue.shift();
      }
      matches.set(row.id, { openings, unmatched: Math.max(0, left),
        method: positionId ? 'broker-position' : 'fifo', brokerPositionId: positionId, openedAt: null });
    }
    queues.set(key, queue);
  }
  return matches;
}
