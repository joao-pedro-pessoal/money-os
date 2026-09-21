/**
 * Looking through your funds to the companies inside them.
 *
 * Three ETFs that each hold 5% Apple, beside Apple shares bought directly, is
 * one large bet on Apple that no single row shows. This adds what each fund
 * holds, weighted by what you hold of the fund, to the shares you own
 * directly, company by company.
 *
 * **Two sources, and each fund says which one it was read from.** The fund
 * manager publishes a file listing every position — 504 companies in an S&P
 * 500 tracker, 3 582 in a small-cap one — and that is used where it has been
 * read. Where it has not, the price source's ten largest holdings are all
 * there is: they covered 19% of the funds held here, and the rest is reported
 * as unseen rather than spread over companies by assumption.
 *
 * Pure: profiles come from lib/portfolio/exposure and actions/exposure.
 */

import { isEquity, type AssetProfile } from "./exposure";
import type { PriceChanges, WindowKey } from "@/lib/funds/priceMoves";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Legal-form words and share-class markers that do not tell two companies apart. */
const NOISE = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "plc", "ltd", "limited", "ag", "se",
  "sa", "nv", "asa", "ab", "oyj", "spa", "the", "class", "cl", "a", "b", "c", "holdings", "group",
  "adr", "reg", "registered", "shs", "ord",
]);

/**
 * One key per company, whichever listing or spelling it arrives under.
 *
 * A fund lists Apple as "AAPL" / "Apple Inc"; the same shares bought in
 * Frankfurt read "APC.DE" / "Apple Inc.". The name, stripped of legal form and
 * punctuation, is what the two have in common.
 */
export function companyKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w !== "" && !NOISE.has(w));
  return words.join(" ");
}

/** A line inside a fund, from either source. */
export interface LookThroughHolding {
  name: string;
  /** Fraction of the fund, 0-1. */
  weight: number;
  /** In the app's sector vocabulary; only the published file states one. */
  sector?: string | null;
  country?: string | null;
  /** The listing it trades under, where the file names a market this knows. */
  symbol?: string | null;
}

export interface LookThroughItem {
  /** What the position is called here, for a stock without a profile name. */
  label: string;
  value: number;
  assetType: string | null;
  profile: AssetProfile | null;
  /**
   * Your gain on this position, in percent of what you paid, where the app
   * knows what it cost. This is the one figure here that is yours.
   */
  gainPercent?: number | null;
  /**
   * Every position the fund publishes, where its file has been read. Null
   * falls back to the price source's largest holdings.
   */
  published?: LookThroughHolding[] | null;
  /**
   * Whose file `published` is. "index" means the fund holds none of these
   * companies — it follows their index by swap, and the list is read from a
   * physical fund tracking the same index (see `funds/indexProxy.ts`). Counted
   * apart, so the screen can say it is the index's list and not the fund's.
   */
  publishedFrom?: "manager" | "index";
}

export interface CompanyExposure {
  name: string;
  /** Held as shares directly. */
  direct: number;
  /** Held through funds. */
  viaFunds: number;
  total: number;
  /** Share of the stocks and ETFs held. */
  percent: number;
  /** The funds it came through, largest contribution first. */
  funds: string[];
  /** In the app's sector vocabulary, where any source names one. */
  sector: string | null;
  /** What the company does inside that sector, where a source names it. */
  industry: string | null;
  country: string | null;
  /** The listing this company trades under, where a source names one. */
  symbol: string | null;
  /**
   * How the company's own share price has moved, per window, in percent.
   *
   * The company's, not yours: what a fund's slice of it cost you is not
   * knowable, because you bought the fund. Empty where nothing was read, and
   * a window the listing is younger than is absent rather than zero.
   */
  changes: PriceChanges;
  /**
   * Your own gain on it, in percent of what you paid — and only where you
   * bought the thing itself. A company reached through a fund has none: the
   * fund bought it, at prices and dates that are the fund's business.
   */
  yourGain: number | null;
}

export interface LookThrough {
  companies: CompanyExposure[];
  /** Value held in funds. */
  fundValue: number;
  /** The part of it the holdings read account for. */
  fundSeen: number;
  /** Value in funds whose holdings were not read or not reported. */
  fundsWithoutHoldings: number;
  /** Value in funds read from the manager's own complete file. */
  fundsFromFile: number;
  /**
   * Value in funds that follow an index by swap, seen through the index's
   * companies as a physical fund publishes them. Exposure to those companies,
   * not ownership of them: the fund owns a collateral basket instead.
   */
  fundsFromIndex: number;
  /** Value in funds known only by their ten largest holdings. */
  fundsFromTopTen: number;
  /** Stocks and ETFs held, the base of every percentage. */
  total: number;
  /** Companies past the limit, and what they add up to. */
  hiddenCompanies: number;
  hiddenValue: number;
}

/**
 * Companies by what you hold of them, directly and through funds, largest first.
 * Only companies reached through at least one fund, or held directly and also
 * inside a fund, are the point — but every direct share is listed, so the
 * table answers "how much Apple do I have" either way.
 */
export function lookThrough(
  items: readonly LookThroughItem[],
  limit = 250,
  /** A company's own moves, by listing, where they have been read. */
  moves: ReadonlyMap<string, PriceChanges> = new Map(),
  /**
   * What each listing is, where it has been read: the sector, the industry
   * and the country. Fills the gaps a fund's ten largest leave — those name
   * the company and nothing else about it.
   */
  details: ReadonlyMap<string, { sector: string | null; industry: string | null; country: string | null }> = new Map()
): LookThrough {
  const byKey = new Map<
    string,
    {
      name: string;
      direct: number;
      viaFunds: number;
      funds: Map<string, number>;
      sector: string | null;
      country: string | null;
      symbol: string | null;
      industry: string | null;
      yourGain: number | null;
    }
  >();
  const entry = (name: string) => {
    const key = companyKey(name) || name.toLowerCase();
    let e = byKey.get(key);
    if (!e) {
      e = {
        name, direct: 0, viaFunds: 0, funds: new Map(),
        sector: null, country: null, symbol: null, industry: null, yourGain: null,
      };
      byKey.set(key, e);
    }
    return e;
  };

  let total = 0;
  let fundValue = 0;
  let fundSeen = 0;
  let fundsWithoutHoldings = 0;
  let fundsFromFile = 0;
  let fundsFromIndex = 0;
  let fundsFromTopTen = 0;

  for (const item of items) {
    if (item.value <= 0 || !isEquity(item.assetType)) continue;
    total += item.value;
    const p = item.profile;
    const isFund = p?.quoteType === "ETF" || p?.quoteType === "MUTUALFUND" || (p === null && item.assetType === "etf");
    if (!isFund) {
      const e = entry(p?.name ?? item.label);
      e.direct += item.value;
      e.sector = e.sector ?? p?.sector ?? null;
      e.country = e.country ?? p?.country ?? null;
      e.symbol = e.symbol ?? p?.symbol ?? null;
      e.industry = e.industry ?? p?.industry ?? null;
      // Only a thing you bought yourself has a gain of yours.
      e.yourGain = e.yourGain ?? item.gainPercent ?? null;
      continue;
    }
    fundValue += item.value;
    // The manager's own file where it has been read, the price source's ten
    // largest otherwise. Never both: that would count the same shares twice.
    const published = item.published ?? null;
    const holdings: LookThroughHolding[] = published ?? p?.topHoldings ?? [];
    if (holdings.length === 0) {
      fundsWithoutHoldings += item.value;
      continue;
    }
    if (published && item.publishedFrom === "index") fundsFromIndex += item.value;
    else if (published) fundsFromFile += item.value;
    else fundsFromTopTen += item.value;
    const fundName = p?.name ?? item.label;
    for (const h of holdings) {
      const amount = item.value * h.weight;
      if (amount <= 0) continue;
      const e = entry(h.name);
      e.viaFunds += amount;
      e.funds.set(fundName, (e.funds.get(fundName) ?? 0) + amount);
      e.sector = e.sector ?? h.sector ?? null;
      e.country = e.country ?? h.country ?? null;
      e.symbol = e.symbol ?? h.symbol ?? null;
      fundSeen += amount;
    }
  }

  const all = [...byKey.values()]
    .map((e) => {
      // What the fund's file did not say, the listing's own profile can.
      const known = e.symbol !== null ? details.get(e.symbol) : undefined;
      return {
        name: e.name,
        direct: round2(e.direct),
        viaFunds: round2(e.viaFunds),
        total: round2(e.direct + e.viaFunds),
        percent: total > 0 ? ((e.direct + e.viaFunds) / total) * 100 : 0,
        funds: [...e.funds].sort((a, b) => b[1] - a[1]).map(([name]) => name),
        sector: e.sector ?? known?.sector ?? null,
        industry: e.industry ?? known?.industry ?? null,
        country: e.country ?? known?.country ?? null,
        symbol: e.symbol,
        changes: (e.symbol !== null ? moves.get(e.symbol) : undefined) ?? {},
        yourGain: e.yourGain,
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  return limitCompanies(
    {
      companies: all,
      fundValue: round2(fundValue),
      fundSeen: round2(fundSeen),
      fundsWithoutHoldings: round2(fundsWithoutHoldings),
      fundsFromFile: round2(fundsFromFile),
      fundsFromIndex: round2(fundsFromIndex),
      fundsFromTopTen: round2(fundsFromTopTen),
      total: round2(total),
      hiddenCompanies: 0,
      hiddenValue: 0,
    },
    limit
  );
}

/**
 * The largest companies of a reading, and what listing them all would have
 * added.
 *
 * Separate from the reading itself so a caller that needs both — the table
 * shows 250 rows, the sector figures are of every company — walks the
 * holdings once instead of twice. Zero means all of them.
 */
export function limitCompanies(full: LookThrough, limit: number): LookThrough {
  if (limit <= 0 || full.companies.length <= limit) {
    return { ...full, hiddenCompanies: 0, hiddenValue: 0 };
  }
  const companies = full.companies.slice(0, limit);
  const hidden = full.companies.slice(limit);
  return {
    ...full,
    companies,
    hiddenCompanies: hidden.length,
    hiddenValue: round2(hidden.reduce((sum, c) => sum + c.total, 0)),
  };
}

export interface SectorMove {
  sector: string | null;
  /** The window these figures are for. */
  window: WindowKey;
  /** What you hold of the companies in it, through funds and directly. */
  value: number;
  /** Of that, what has a price move read for it. */
  measured: number;
  /**
   * The average move of those companies over the window, weighted by what you
   * hold of each. Null when nothing in the sector has been measured — never
   * zero, which would claim a sector that has not moved.
   */
  change: number | null;
}

/**
 * How the sectors you hold have moved over a year.
 *
 * The market's move, not your return: it weights each company's own yearly
 * change by what you hold of that company today, and you did not hold it for
 * all of that year. It answers "which of the things I own have been rising",
 * which no figure in this app answered before, and it says how much of each
 * sector it could measure so a sector read from two companies out of fifty
 * cannot pass for the whole.
 */
export function sectorMoves(companies: readonly CompanyExposure[], window: WindowKey = "y1"): SectorMove[] {
  const by = new Map<string, { sector: string | null; value: number; measured: number; weighted: number }>();
  for (const c of companies) {
    if (c.total <= 0) continue;
    const key = c.sector ?? "";
    const e = by.get(key) ?? { sector: c.sector, value: 0, measured: 0, weighted: 0 };
    e.value += c.total;
    const change = c.changes[window];
    if (change !== undefined) {
      e.measured += c.total;
      e.weighted += c.total * change;
    }
    by.set(key, e);
  }
  return [...by.values()]
    .map((e) => ({
      sector: e.sector,
      window,
      value: round2(e.value),
      measured: round2(e.measured),
      change: e.measured > 0 ? Math.round((e.weighted / e.measured) * 100) / 100 : null,
    }))
    .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity) || b.value - a.value);
}
