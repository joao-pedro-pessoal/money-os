export interface AccountEvolution {
  id: string;
  name: string;
  currency: string;
  points: { date: string; value: number }[];
  omitted: number;
  assumedCurrency: boolean;
}

/** Original account currency; never reprice past balances with today's FX rate.
 * Take the last observation of each UTC day, not the sum of its snapshots. */
export function accountBalanceHistory(currency: string, rows: { timestamp: string; balance: number; currency: string | null }[]) {
  const days = new Map<string, { date: string; value: number }>();
  let omitted = 0;
  let assumedCurrency = false;
  for (const row of [...rows].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    if (!Number.isFinite(Date.parse(row.timestamp)) || !Number.isFinite(row.balance) || (row.currency && row.currency !== currency)) {
      omitted++;
      continue;
    }
    if (!row.currency) assumedCurrency = true;
    const date = new Date(row.timestamp).toISOString().slice(0, 10);
    days.set(date, { date, value: row.balance });
  }
  return { points: [...days.values()], omitted, assumedCurrency };
}
