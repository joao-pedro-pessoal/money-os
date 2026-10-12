import { playlistGroups } from "./playlists";
import type { GroupByKey, GroupPerformance, GroupMember } from './analysis';
import { hasPnl, portfolioSummary, type PositionItem } from './positionView';
import type { TradeHistoryRow } from '../trading/filter';
import { directionOf } from '../trading/stats';
import { isRealisedTrade } from '../trading/tradeMatches';

export const PERFORMANCE_STATUS_OPTIONS = [
  { value: "both", label: "Open and closed" },
  { value: "open", label: "Open positions" },
  { value: "closed", label: "Closed trades" },
] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUS_OPTIONS)[number]["value"];

const round = (n: number) => Math.round(n * 100) / 100;

/** Inputs are already converted to the same base currency. Never join by ticker:
 * each open position and closed execution belongs to its own classification. */
export function classifiedPerformance(items: PositionItem[], trades: TradeHistoryRow[], key: GroupByKey, status: PerformanceStatus = "both"): GroupPerformance[] {
  const groups = new Map<string, { open: PositionItem[]; closed: TradeHistoryRow[] }>();
  const group = (name: string | null | undefined) => {
    const label = name || 'Unset';
    if (!groups.has(label)) groups.set(label, { open: [], closed: [] });
    return groups.get(label)!;
  };
  const opened = [...new Map((status === "closed" ? [] : items).map(p => [p.id, p])).values()];
  for (const p of opened) {
    const names = key === 'playlist' ? playlistGroups(p.playlistNames, '')
      : [key === 'account' ? p.accountName : key === 'direction' ? p.side : p[key]];
    for (const name of names) group(name).open.push(p);
  }
  for (const t of new Map((status === "open" ? [] : trades).map(t => [t.id, t])).values()) {
    if (!isRealisedTrade(t)) continue;
    const names = key === 'playlist' ? playlistGroups(t.classification?.playlistNames ?? [], '')
      : [key === 'account' ? t.accountName : key === 'direction' ? directionOf(t) : key === 'symbol' ? t.symbol : t.classification?.[key]];
    for (const name of names) group(name).closed.push(t);
  }
  // Of the positions themselves, each once: by playlist a position can sit in
  // several groups, and its share of the portfolio must not count it twice.
  const total = portfolioSummary(opened).held;
  return [...groups].map(([name, { open, closed }]) => {
    const s = portfolioSummary(open);
    const members: GroupMember[] = open.map(p => {
      const one = portfolioSummary([p]);
      return { id: p.id, symbol: p.symbol, accountName: p.accountName, status: 'open',
        pnlKnown: hasPnl(p) && !p.costUnknown && !p.atCost, value: p.value,
        cost: one.cost, pnl: one.pnl, pnlPercent: one.pnlPercent, realized: 0,
        shareOfGroup: s.held ? round(p.value / s.held * 100) : 0 };
    });
    members.push(...closed.map(t => ({ id: `trade:${t.id}`, symbol: t.symbol!,
      accountName: t.accountName, date: t.date, status: 'closed' as const, pnlKnown: false,
      value: 0, cost: 0, pnl: 0, pnlPercent: 0, realized: t.realizedPnl!, shareOfGroup: 0 })));
    return { key: name, value: s.held, cost: s.cost, pnl: s.pnl, pnlPercent: s.pnlPercent,
      realized: round(closed.reduce((sum, t) => sum + t.realizedPnl!, 0)),
      percent: total ? round(s.held / total * 100) : 0, count: members.length,
      openCount: open.length, closedCount: closed.length, members };
  });
}
