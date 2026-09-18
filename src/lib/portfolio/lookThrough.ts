/**
 * Looking through your funds to the companies inside them.
 *
 * Three ETFs that each hold 5% Apple, beside Apple shares bought directly, is
 * one large bet on Apple that no single row shows. This adds a fund's largest
 * holdings, weighted by what you hold of the fund, to the shares you own
 * directly, company by company.
 *
 * The source reports only a fund's largest holdings (usually ten). The rest of
 * the fund is not spread over companies by assumption: it is shown as the part
 * of your funds this cannot see, beside the part it can.
 *
 * Pure: profiles come from lib/portfolio/exposure and actions/exposure.
 */

import { isEquity, type AssetProfile } from "./exposure";

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

export interface LookThroughItem {
  /** What the position is called here, for a stock without a profile name. */
  label: string;
  value: number;
  assetType: string | null;
  profile: AssetProfile | null;
}

export interface CompanyExposure {
  name: string;
  /** Held as shares directly. */
  direct: number;
  /** Held through funds, from their reported largest holdings. */
  viaFunds: number;
  total: number;
  /** Share of the stocks and ETFs held. */
  percent: number;
  /** The funds it came through, largest contribution first. */
  funds: string[];
}

export interface LookThrough {
  companies: CompanyExposure[];
  /** Value held in funds. */
  fundValue: number;
  /** The part of it the reported holdings account for. */
  fundSeen: number;
  /** Value in funds whose holdings were not read or not reported. */
  fundsWithoutHoldings: number;
  /** Stocks and ETFs held, the base of every percentage. */
  total: number;
}

/**
 * Companies by what you hold of them, directly and through funds, largest first.
 * Only companies reached through at least one fund, or held directly and also
 * inside a fund, are the point — but every direct share is listed, so the
 * table answers "how much Apple do I have" either way.
 */
export function lookThrough(items: readonly LookThroughItem[], limit = 15): LookThrough {
  const byKey = new Map<string, { name: string; direct: number; viaFunds: number; funds: Map<string, number> }>();
  const entry = (name: string) => {
    const key = companyKey(name) || name.toLowerCase();
    let e = byKey.get(key);
    if (!e) {
      e = { name, direct: 0, viaFunds: 0, funds: new Map() };
      byKey.set(key, e);
    }
    return e;
  };

  let total = 0;
  let fundValue = 0;
  let fundSeen = 0;
  let fundsWithoutHoldings = 0;

  for (const item of items) {
    if (item.value <= 0 || !isEquity(item.assetType)) continue;
    total += item.value;
    const p = item.profile;
    const isFund = p?.quoteType === "ETF" || p?.quoteType === "MUTUALFUND" || (p === null && item.assetType === "etf");
    if (!isFund) {
      entry(p?.name ?? item.label).direct += item.value;
      continue;
    }
    fundValue += item.value;
    const holdings = p?.topHoldings ?? [];
    if (holdings.length === 0) {
      fundsWithoutHoldings += item.value;
      continue;
    }
    const fundName = p?.name ?? item.label;
    for (const h of holdings) {
      const amount = item.value * h.weight;
      const e = entry(h.name);
      e.viaFunds += amount;
      e.funds.set(fundName, (e.funds.get(fundName) ?? 0) + amount);
      fundSeen += amount;
    }
  }

  const companies = [...byKey.values()]
    .map((e) => ({
      name: e.name,
      direct: round2(e.direct),
      viaFunds: round2(e.viaFunds),
      total: round2(e.direct + e.viaFunds),
      percent: total > 0 ? ((e.direct + e.viaFunds) / total) * 100 : 0,
      funds: [...e.funds].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return {
    companies,
    fundValue: round2(fundValue),
    fundSeen: round2(fundSeen),
    fundsWithoutHoldings: round2(fundsWithoutHoldings),
    total: round2(total),
  };
}
