import type { TradeHistoryRow } from './filter';
import { isRealisedTrade } from './tradeMatches';

/** All amounts arrive in the base currency. Days follow the history's UTC timestamps. */
export function dailyRealisedPnl(rows: readonly TradeHistoryRow[]) {
  const days = new Map<string, { date: string; pnl: number; trades: TradeHistoryRow[] }>();
  for (const row of new Map(rows.map(r => [r.id, r])).values()) {
    if (!isRealisedTrade(row) || !Number.isFinite(Date.parse(row.date))) continue;
    const date = new Date(row.date).toISOString().slice(0, 10);
    const day = days.get(date) ?? { date, pnl: 0, trades: [] };
    day.pnl += row.realizedPnl!;
    day.trades.push(row);
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({
    ...day, pnl: Math.round(day.pnl * 100) / 100,
    trades: day.trades.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  }));
}

/** Monday-first complete weeks, with null padding instead of invented dates. */
export function monthDays(month: string): (string | null)[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const cells: (string | null)[] = Array((first.getUTCDay() + 6) % 7).fill(null);
  for (let day = 1; day <= last.getUTCDate(); day++) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
