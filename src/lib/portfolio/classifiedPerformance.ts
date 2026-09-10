import type { GroupByKey, GroupPerformance, GroupMember } from './analysis';
import { hasPnl, portfolioSummary, type PositionItem } from './positionView';
import type { TradeHistoryRow } from '../trading/filter';
import { directionOf } from '../trading/stats';
import { isRealisedTrade } from '../trading/tradeMatches';

const round = (n: number) => Math.round(n * 100) / 100;

/** Inputs are already converted to the same base currency. Never join by ticker:
 * each open position and closed execution belongs to its own classification. */
export function classifiedPerformance(items: PositionItem[], trades: TradeHistoryRow[], key: GroupByKey): GroupPerformance[] {
  const groups = new Map<string, { open: PositionItem[]; closed: TradeHistoryRow[] }>();
  const group = (name: string | null | undefined) => {
    const label = name || 'Unset';
    if (!groups.has(label)) groups.set(label, { open: [], closed: [] });
    return groups.get(label)!;
  };
  for (const p of new Map(items.map(p => [p.id, p])).values()) {
    const name = key === 'playlist' ? p.playlistName : key === 'account' ? p.accountName
      : key === 'direction' ? p.side : p[key];
    group(name).open.push(p);
  }
  for (const t of new Map(trades.map(t => [t.id, t])).values()) {
    if (!isRealisedTrade(t)) continue;
    const name = key === 'playlist' ? t.classification?.playlistName : key === 'account' ? t.accountName
      : key === 'direction' ? directionOf(t) : key === 'symbol' ? t.symbol : t.classification?.[key];
    group(name).closed.push(t);
  }
  const total = portfolioSummary([...groups.values()].flatMap(g => g.open)).held;
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
