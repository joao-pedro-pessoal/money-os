/**
 * Grouping and filtering for the synced positions table.
 *
 * You tag positions on the Positions page — playlists like "Div RSI" or
 * "Insider Trading", risk levels, asset types — and none of it showed up where
 * you actually look at them. Worse, the same tagging drives the allocation
 * chart, which sat empty because it only counted manually-added holdings.
 *
 * So one shape describes everything you hold, and one function groups it.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PositionItem {
  id: string;
  symbol: string;
  side: "long" | "short" | null;
  accountName: string;
  platform: string;
  assetType: string | null;
  playlistName: string | null;
  riskLevel: string | null;
  timeHorizon: string | null;
  /**
   * Capital committed, in the base currency — margin for a leveraged position,
   * full market value for anything else. This is what every total and the
   * allocation chart use, because a 5× short controlling €258 is not €258 of
   * your money.
   */
  value: number;
  /** Full market exposure. Differs from `value` only when leveraged. */
  notional: number;
  /** Null when the position isn't leveraged. */
  leverage: number | null;
  pnl: number;
  /** Where it came from, so the table can say. */
  /**
   * Where it came from, so the table can say.
   *
   * `statement` is rebuilt from an imported broker export — the only route for
   * a broker with no API. Its `value` is what the shares **cost**, not what
   * they are worth today: the file records prices paid and nothing else, and
   * putting an invented market value in the same column as real ones would make
   * the whole column untrustworthy.
   */
  source: "synced" | "balance" | "manual" | "statement";
  /** True when `value` is a cost basis rather than a market value. */
  atCost?: boolean;
  /**
   * True when nothing states what this holding cost, so no P&L can be derived.
   *
   * Distinct from `atCost`, which is the opposite problem: there the cost is
   * known and the market value is not. Both end up unable to produce a P&L, and
   * both used to render "+0,00 €" — a portfolio claiming to be exactly flat.
   */
  costUnknown?: boolean;
  /**
   * True when this is a breakdown of an account balance rather than money on
   * top of it — IBKR's currency rows, or an open trade whose value already sits
   * inside the equity.
   *
   * It belongs in the picture of what you hold; it must never be added to Net
   * Worth, because the account balance already carries it. Showing it and
   * adding it are different questions, and conflating them is how the same
   * money gets counted twice.
   */
  insideBalance: boolean;
  /**
   * Annual rate this earns, when it earns one. Cash and stablecoins have no
   * P&L — their price doesn't move — but they can pay interest, and that is
   * the only return they have.
   */
  apr: number | null;
}

/** Asset types whose price doesn't move, so a P&L column says nothing. */
const NO_PNL_TYPES = ["cash", "stablecoin"];

export function hasPnl(item: PositionItem): boolean {
  return !(item.assetType !== null && NO_PNL_TYPES.includes(item.assetType));
}

/** What this earns in a year at its rate, or null when it doesn't earn. */
export function yearlyYield(item: PositionItem): number | null {
  if (item.apr === null || item.apr <= 0) return null;
  return round2((item.value * item.apr) / 100);
}

export interface PortfolioSummary {
  /** Everything held, at capital committed. */
  held: number;
  /** Full market exposure, which differs only where there's leverage. */
  notional: number;
  /** What the market-exposed part cost. */
  cost: number;
  pnl: number;
  pnlPercent: number;
  /** Cash and stablecoins — no P&L, possibly a yield. */
  stable: number;
  floating: number;
  /** Interest these would pay over a year at the rates you've set. */
  projectedYield: number;
  /** How much of the stable money has no rate recorded. */
  unratedStable: number;
  /**
   * Market-exposed value whose cost nobody states, so it contributes no P&L.
   *
   * Reported rather than absorbed: `cost` used to swallow it, which quietly
   * asserted that part of the portfolio was exactly break-even. It satisfies
   * `cost + pnl + costUnknown === floating`, so nothing has gone missing — it
   * has just been named.
   */
  costUnknown: number;
}

/**
 * Headline figures for the whole portfolio.
 *
 * Computed from the same items the table shows, because the old figures came
 * from manual holdings alone: with everything synced, the cards read
 * "Unrealized P&L 0,00 €" while the table below reported −0,51 €. Two numbers
 * for one question is worse than either of them being wrong.
 */
export function portfolioSummary(items: PositionItem[]): PortfolioSummary {
  let held = 0;
  let notional = 0;
  let pnl = 0;
  let stable = 0;
  let floating = 0;
  let projectedYield = 0;
  let unratedStable = 0;
  let costUnknown = 0;

  for (const i of items) {
    held += i.value;
    notional += i.notional;

    if (hasPnl(i)) {
      floating += i.value;
      // A holding nobody states a cost for contributes its value to what is
      // exposed and nothing to the P&L. Folding it in at zero would report it
      // as exactly break-even, which is a measurement it never made.
      if (i.costUnknown) costUnknown += i.value;
      else pnl += i.pnl;
    } else {
      stable += i.value;
      const y = yearlyYield(i);
      if (y === null) unratedStable += i.value;
      else projectedYield += y;
    }
  }

  // Cost is only meaningful for what can move and has a stated cost; cash
  // didn't "cost" anything, and neither did a holding nobody priced the entry
  // of. Keeps cost + pnl + costUnknown === floating.
  const cost = floating - pnl - costUnknown;

  return {
    held: round2(held),
    notional: round2(notional),
    cost: round2(cost),
    pnl: round2(pnl),
    pnlPercent: cost === 0 ? 0 : round2((pnl / Math.abs(cost)) * 100),
    stable: round2(stable),
    floating: round2(floating),
    projectedYield: round2(projectedYield),
    unratedStable: round2(unratedStable),
    costUnknown: round2(costUnknown),
  };
}

export interface PlatformAudit {
  platform: string;
  positions: number;
  floating: number;
  stable: number;
  total: number;
  /**
   * True when this platform's cash balances are the pool that backs its own
   * positions, rather than money sitting beside them.
   *
   * The distinction is invisible in a total and changes it materially. Trading
   * 212 reports free cash — 0.11 € beside 125 € of ETFs, and nothing overlaps.
   * A margin exchange reports the whole pool, which is already what the open
   * trades are collateralised with, so counting both adds the margin twice.
   */
  mayOverlap: boolean;
}

/**
 * The totals, broken down by platform so they can be reconciled.
 *
 * A figure nobody can check is a figure nobody should trust. This exists so
 * "how is that 177?" has an answer on the same screen.
 */
export function auditByPlatform(items: PositionItem[]): PlatformAudit[] {
  const groups = new Map<string, PositionItem[]>();
  for (const i of items) {
    const list = groups.get(i.platform) ?? [];
    list.push(i);
    groups.set(i.platform, list);
  }

  return [...groups.entries()]
    .map(([platform, list]) => {
      const summary = portfolioSummary(list);
      const hasPositions = list.some((i) => i.source === "synced");
      // A balance flagged as living inside the account's equity, on a platform
      // that also has open positions, is the overlapping case.
      const hasInsideCash = list.some((i) => i.source === "balance" && i.insideBalance);

      return {
        platform,
        positions: list.filter((i) => i.source !== "balance").length,
        floating: summary.floating,
        stable: summary.stable,
        total: round2(summary.floating + summary.stable),
        mayOverlap: hasPositions && hasInsideCash,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export type GroupKey = "none" | "assetType" | "playlist" | "riskLevel" | "account" | "side" | "platform";

export const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "assetType", label: "Asset type" },
  { value: "playlist", label: "Playlist" },
  { value: "riskLevel", label: "Risk" },
  { value: "account", label: "Account" },
  { value: "platform", label: "Platform" },
  { value: "side", label: "Long / short" },
];

/** The untagged bucket. Named rather than hidden, so nothing goes missing. */
export const UNTAGGED = "—";

export function groupValueOf(item: PositionItem, key: GroupKey): string {
  switch (key) {
    case "assetType":
      return item.assetType ?? UNTAGGED;
    case "playlist":
      return item.playlistName ?? UNTAGGED;
    case "riskLevel":
      return item.riskLevel ?? UNTAGGED;
    case "account":
      return item.accountName;
    case "platform":
      return item.platform;
    case "side":
      return item.side ?? UNTAGGED;
    case "none":
    default:
      return "";
  }
}

export interface Filters {
  assetType: string;
  playlist: string;
  riskLevel: string;
  account: string;
  search: string;
}

export const NO_FILTERS: Filters = {
  assetType: "",
  playlist: "",
  riskLevel: "",
  account: "",
  search: "",
};

export function applyFilters(items: PositionItem[], f: Filters): PositionItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    // An empty filter means "all". Selecting the untagged bucket is a real
    // choice — "show me what I haven't classified" — so it matches on null.
    if (f.assetType && (i.assetType ?? UNTAGGED) !== f.assetType) return false;
    if (f.playlist && (i.playlistName ?? UNTAGGED) !== f.playlist) return false;
    if (f.riskLevel && (i.riskLevel ?? UNTAGGED) !== f.riskLevel) return false;
    if (f.account && i.accountName !== f.account) return false;
    if (q && !`${i.symbol} ${i.accountName} ${i.playlistName ?? ""}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

export interface Group {
  key: string;
  items: PositionItem[];
  value: number;
  pnl: number;
  /** Share of the filtered total, 0-100. */
  percent: number;
}

/**
 * Groups and totals, biggest first.
 *
 * The percentage is of what's currently shown, not of everything — a filtered
 * view that reported shares of the unfiltered total would be quietly answering
 * a question nobody asked.
 */
export function groupItems(items: PositionItem[], key: GroupKey): Group[] {
  const total = items.reduce((s, i) => s + i.value, 0);

  if (key === "none") {
    return [
      {
        key: "",
        items: [...items].sort((a, b) => b.value - a.value),
        value: round2(total),
        pnl: round2(items.reduce((s, i) => s + i.pnl, 0)),
        percent: 100,
      },
    ];
  }

  const buckets = new Map<string, PositionItem[]>();
  for (const item of items) {
    const k = groupValueOf(item, key);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(item);
  }

  return [...buckets.entries()]
    .map(([k, list]) => {
      const value = list.reduce((s, i) => s + i.value, 0);
      return {
        key: k,
        items: [...list].sort((a, b) => b.value - a.value),
        value: round2(value),
        pnl: round2(list.reduce((s, i) => s + i.pnl, 0)),
        percent: total === 0 ? 0 : round2((value / total) * 100),
      };
    })
    .sort((a, b) => {
      // Untagged last, whatever it's worth: it's a to-do, not a category.
      if (a.key === UNTAGGED) return 1;
      if (b.key === UNTAGGED) return -1;
      return b.value - a.value;
    });
}

/** Distinct values present, for the filter dropdowns. */
export function filterOptions(items: PositionItem[]) {
  const uniq = (xs: (string | null)[]) =>
    [...new Set(xs.map((x) => x ?? UNTAGGED))].sort((a, b) =>
      a === UNTAGGED ? 1 : b === UNTAGGED ? -1 : a.localeCompare(b)
    );

  return {
    assetTypes: uniq(items.map((i) => i.assetType)),
    playlists: uniq(items.map((i) => i.playlistName)),
    riskLevels: uniq(items.map((i) => i.riskLevel)),
    accounts: uniq(items.map((i) => i.accountName)),
  };
}

/**
 * Slices for the allocation donut, from whatever is currently shown.
 *
 * Falls back to individual positions when the chosen grouping collapses into a
 * single slice. Filtering to one playlist and grouping by asset type gives a
 * ring that is 100% one colour — technically correct and completely useless.
 * At that point the question you're asking is "what's inside this", so it
 * answers that instead.
 */
export function allocationOf(items: PositionItem[], key: GroupKey): { name: string; value: number }[] {
  const effective: GroupKey = key === "none" ? "assetType" : key;

  const grouped = groupItems(items, effective).filter((g) => g.value > 0);
  if (grouped.length > 1) {
    return grouped.map((g) => ({ name: g.key || "All", value: g.value }));
  }

  return [...items]
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((i) => ({ name: i.symbol, value: i.value }));
}
