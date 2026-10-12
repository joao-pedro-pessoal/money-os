import { GROUP_BY_OPTIONS, type GroupByKey, type GroupPerformance, type GroupMember } from './analysis';
import { hasPnl, portfolioSummary, type PositionItem } from './positionView';
import { cleanChoices, matchesAny } from '../filters/multi';
import type { TradeHistoryRow } from '../trading/filter';
import { directionOf } from '../trading/stats';
import { isRealisedTrade } from '../trading/tradeMatches';

export const PERFORMANCE_STATUS_OPTIONS = [
  { value: "both", label: "Open and closed" },
  { value: "open", label: "Open positions" },
  { value: "closed", label: "Closed trades" },
] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUS_OPTIONS)[number]["value"];

/**
 * The breakdown narrowed on any of the dimensions it can be grouped by: several
 * values per dimension, every dimension applying (`lib/filters/multi.ts`).
 * NONE picks what has nothing set there.
 */
export type PerformanceFilters = Partial<Record<GroupByKey, string[]>>;

/** What a dimension can be filtered on: the values in view, and whether anything is unset. */
export interface FilterChoices {
  values: string[];
  unset: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** What an open position carries on one dimension: several playlists, else one value or none. */
function itemKeys(p: PositionItem, key: GroupByKey): string[] {
  if (key === 'playlist') return [...new Set(p.playlistNames)];
  const value = key === 'account' ? p.accountName : key === 'direction' ? p.side : p[key];
  return value ? [value] : [];
}

/** The same for a closed trade, read from its own classification. */
function tradeKeys(t: TradeHistoryRow, key: GroupByKey): string[] {
  if (key === 'playlist') return [...new Set(t.classification?.playlistNames ?? [])];
  const value = key === 'account' ? t.accountName : key === 'direction' ? directionOf(t)
    : key === 'symbol' ? t.symbol : t.classification?.[key];
  return value ? [value] : [];
}

/** The open positions and realised trades the status shows, each once. */
function inView(items: PositionItem[], trades: TradeHistoryRow[], status: PerformanceStatus) {
  return {
    open: status === "closed" ? [] : [...new Map(items.map(p => [p.id, p])).values()],
    closed: status === "open" ? [] : [...new Map(trades.map(t => [t.id, t])).values()].filter(isRealisedTrade),
  };
}

/** Only what passes every filter. Nothing chosen on a dimension keeps everything. */
export function filterPerformanceInputs(items: PositionItem[], trades: TradeHistoryRow[], filters: PerformanceFilters) {
  const active = GROUP_BY_OPTIONS.map(o => [o.value, filters[o.value] ?? []] as const).filter(([, v]) => v.length > 0);
  if (active.length === 0) return { items, trades };
  return {
    items: items.filter(p => active.every(([key, v]) => matchesAny(itemKeys(p, key), v))),
    trades: trades.filter(t => active.every(([key, v]) => matchesAny(tradeKeys(t, key), v))),
  };
}

/**
 * Every dimension's choices, from everything the status shows rather than what
 * the filters leave: picking Crypto must not take ETF off the list it was
 * picked from.
 */
export function performanceFilterOptions(items: PositionItem[], trades: TradeHistoryRow[], status: PerformanceStatus = "both"): Record<GroupByKey, FilterChoices> {
  const { open, closed } = inView(items, trades, status);
  const carried = (key: GroupByKey) => [...open.map(p => itemKeys(p, key)), ...closed.map(t => tradeKeys(t, key))];
  return Object.fromEntries(GROUP_BY_OPTIONS.map(({ value: key }) => {
    const values = new Set<string>();
    let unset = false;
    for (const keys of carried(key)) {
      if (keys.length === 0) unset = true;
      for (const k of keys) values.add(k);
    }
    return [key, { values: [...values].sort((a, b) => a.localeCompare(b)), unset }];
  })) as Record<GroupByKey, FilterChoices>;
}

/**
 * Filters from an address or a saved view, kept to values that still exist —
 * a playlist renamed since drops out instead of leaving a filter that matches
 * nothing.
 */
export function cleanPerformanceFilters(raw: Partial<Record<string, unknown>>, options: Record<GroupByKey, FilterChoices>): PerformanceFilters {
  const out: PerformanceFilters = {};
  const given = raw && typeof raw === "object" ? raw : {};
  for (const { value: key } of GROUP_BY_OPTIONS) {
    const chosen = cleanChoices(given[key], options[key].values);
    if (chosen.length > 0) out[key] = chosen;
  }
  return out;
}

/** Positions and trades by the groups they fall in; with nothing set, "Unset". */
function buckets(open: PositionItem[], closed: TradeHistoryRow[], key: GroupByKey) {
  const groups = new Map<string, { open: PositionItem[]; closed: TradeHistoryRow[] }>();
  const group = (name: string) => {
    if (!groups.has(name)) groups.set(name, { open: [], closed: [] });
    return groups.get(name)!;
  };
  const orUnset = (keys: string[]) => (keys.length === 0 ? ['Unset'] : keys);
  for (const p of open) for (const name of orUnset(itemKeys(p, key))) group(name).open.push(p);
  for (const t of closed) for (const name of orUnset(tradeKeys(t, key))) group(name).closed.push(t);
  return groups;
}

/** One group's line and members; `total` is what its percent is a share of. */
function summarise(name: string, open: PositionItem[], closed: TradeHistoryRow[], total: number): GroupPerformance {
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
}

/** Inputs are already converted to the same base currency. Never join by ticker:
 * each open position and closed execution belongs to its own classification.
 *
 * `thenBy` splits every group again — playlist, then risk — into `children`,
 * whose percent is their share of the group above them. */
export function classifiedPerformance(items: PositionItem[], trades: TradeHistoryRow[], key: GroupByKey, status: PerformanceStatus = "both", thenBy: GroupByKey | null = null): GroupPerformance[] {
  const { open, closed } = inView(items, trades, status);
  // Of the positions themselves, each once: by playlist a position can sit in
  // several groups, and its share of the portfolio must not count it twice.
  const total = portfolioSummary(open).held;
  return [...buckets(open, closed, key)].map(([name, g]) => {
    const row = summarise(name, g.open, g.closed, total);
    if (!thenBy || thenBy === key) return row;
    const children = [...buckets(g.open, g.closed, thenBy)].map(([sub, c]) => summarise(sub, c.open, c.closed, row.value));
    return { ...row, children };
  });
}
