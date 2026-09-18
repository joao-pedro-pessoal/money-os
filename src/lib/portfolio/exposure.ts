/**
 * What the shares and funds you hold are exposed to: which sectors, which
 * countries, which parts of the world.
 *
 * Only stocks and ETFs take part. A sector of bitcoin or a country of idle cash
 * is not a small number, it is no number, so everything else is left out and
 * the breakdown says how much that is.
 *
 * The figures come from the data source, never from a guess. A stock carries
 * one sector and one country. A fund carries the sector weights its provider
 * reports, and no countries — Yahoo does not report where a fund's companies
 * are — so a fund's value stays "Unclassified" by country rather than being
 * spread by an assumption about what "World" means. Whatever is not known is
 * shown as Unclassified, with its value, so every total adds up to what you
 * hold.
 *
 * Pure: the profiles are read and saved elsewhere (actions/exposure.ts).
 */

import { YAHOO_PREFIX } from "@/lib/quotes/symbolSource";

export const UNCLASSIFIED = "Unclassified";

export interface AssetProfile {
  /** The listing that was read, such as "SAP.DE". */
  symbol: string;
  /** Yahoo's type: "EQUITY", "ETF", "MUTUALFUND"… */
  quoteType: string | null;
  /** Sector key, such as "technology". A stock's own; null for a fund. */
  sector: string | null;
  /** Country of a company's head office, as the source spells it. */
  country: string | null;
  /** A fund's sector weights, 0–1, by sector key. Null for a stock. */
  sectorWeights: Record<string, number> | null;
}

const SECTOR_LABELS: Record<string, string> = {
  technology: "Technology",
  financial_services: "Financial services",
  healthcare: "Healthcare",
  consumer_cyclical: "Consumer cyclical",
  consumer_defensive: "Consumer defensive",
  communication_services: "Communication services",
  industrials: "Industrials",
  energy: "Energy",
  basic_materials: "Basic materials",
  utilities: "Utilities",
  realestate: "Real estate",
  real_estate: "Real estate",
};

/**
 * One key per sector, whichever spelling it arrived in.
 *
 * A stock's profile says "financial-services" and a fund's weights say
 * "financial_services" for the same sector; without this they would be two
 * rows of one sector.
 */
export function sectorKey(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return key === "real_estate" ? "realestate" : key;
}

export function sectorLabel(raw: string): string {
  const key = sectorKey(raw);
  return SECTOR_LABELS[key] ?? raw.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const REGIONS: Record<string, string[]> = {
  "North America": ["United States", "Canada", "Bermuda"],
  Europe: [
    "Austria", "Belgium", "Czech Republic", "Denmark", "Finland", "France", "Germany", "Greece",
    "Hungary", "Iceland", "Ireland", "Italy", "Luxembourg", "Netherlands", "Norway", "Poland",
    "Portugal", "Spain", "Sweden", "Switzerland", "United Kingdom", "Jersey", "Guernsey",
    "Isle of Man", "Monaco", "Liechtenstein", "Malta", "Cyprus", "Estonia", "Latvia", "Lithuania",
    "Slovakia", "Slovenia", "Croatia", "Romania", "Bulgaria",
  ],
  "Asia-Pacific": [
    "Japan", "China", "Hong Kong", "Taiwan", "South Korea", "Korea", "Singapore", "India",
    "Australia", "New Zealand", "Indonesia", "Malaysia", "Thailand", "Philippines", "Vietnam", "Macau",
  ],
  "Latin America": ["Brazil", "Mexico", "Chile", "Argentina", "Colombia", "Peru", "Uruguay", "Panama"],
  "Middle East & Africa": [
    "Israel", "South Africa", "United Arab Emirates", "Saudi Arabia", "Qatar", "Turkey", "Egypt",
    "Kuwait", "Nigeria", "Morocco",
  ],
};

const REGION_OF = new Map(
  Object.entries(REGIONS).flatMap(([region, countries]) => countries.map((c) => [c.toLowerCase(), region] as const))
);

/** The part of the world a country is in, or "Other" for one not listed. */
export function regionOf(country: string): string {
  return REGION_OF.get(country.trim().toLowerCase()) ?? "Other";
}

/**
 * The Yahoo listing to ask about, from what a position already knows.
 *
 * A price source chosen for the position wins — it is the listing whose price
 * is on screen. Stooq's spelling is turned into Yahoo's ("sxr8.de" → "SXR8.DE",
 * "vod.uk" → "VOD.L", "aapl.us" → "AAPL"). Without one, the ticker itself.
 */
export function yahooSymbolFor(quoteSymbol: string | null | undefined, ticker: string): string {
  const chosen = quoteSymbol?.trim();
  if (chosen) {
    if (chosen.toLowerCase().startsWith(YAHOO_PREFIX)) return chosen.slice(YAHOO_PREFIX.length).trim().toUpperCase();
    const match = /^([a-z0-9-]+)\.(us|de|uk|fr)$/.exec(chosen);
    if (match) {
      const base = match[1].toUpperCase();
      return match[2] === "us" ? base : `${base}.${{ de: "DE", uk: "L", fr: "PA" }[match[2] as "de" | "uk" | "fr"]}`;
    }
    return chosen.toUpperCase();
  }
  const clean = ticker.trim();
  // Trading 212 writes "AAPL_US_EQ", and "VUSAl_EQ" for a London listing: the
  // lowercase letter is the exchange.
  const t212 = /^([A-Z0-9.]+?)([a-z])?_(?:[A-Z]{2}_)?EQ$/.exec(clean);
  if (t212) {
    const exchange = t212[2] ? T212_EXCHANGES[t212[2]] : undefined;
    return exchange ? `${t212[1]}.${exchange}` : t212[1];
  }
  return clean.toUpperCase();
}

const T212_EXCHANGES: Record<string, string> = { l: "L", d: "DE", p: "PA", a: "AS", m: "MI", e: "MC", s: "SW" };

/**
 * Whether a text can be a listing to ask for directly. A statement's full
 * legal name ("iShares Core S&P 500 UCITS ETF…") cannot; it is searched for.
 */
export function looksLikeSymbol(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(value);
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const raw = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : obj(v)?.raw;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** A profile from Yahoo's quoteSummary (modules assetProfile, quoteType, topHoldings), or null. */
export function parseYahooProfile(symbol: string, payload: unknown): AssetProfile | null {
  const result = obj(payload)?.quoteSummary;
  const first = Array.isArray(obj(result)?.result) ? (obj(result)!.result as unknown[])[0] : null;
  const r = obj(first);
  if (!r) return null;
  const profile = obj(r.assetProfile) ?? obj(r.summaryProfile);
  const quoteType = text(obj(r.quoteType)?.quoteType);

  let sectorWeights: Record<string, number> | null = null;
  const weights = obj(r.topHoldings)?.sectorWeightings;
  if (Array.isArray(weights)) {
    sectorWeights = {};
    for (const entry of weights) {
      for (const [key, value] of Object.entries(obj(entry) ?? {})) {
        const w = raw(value);
        if (w !== null && w > 0) sectorWeights[sectorKey(key)] = (sectorWeights[sectorKey(key)] ?? 0) + w;
      }
    }
    // The weights describe the fund's shares; the cash and bonds beside them
    // belong to no sector, and stay Unclassified.
    const shares = raw(obj(r.topHoldings)?.stockPosition);
    if (shares !== null && shares > 0 && shares <= 1) {
      for (const key of Object.keys(sectorWeights)) sectorWeights[key] *= shares;
    }
    if (Object.keys(sectorWeights).length === 0) sectorWeights = null;
  }

  const sector = text(profile?.sectorKey) ?? text(profile?.sector);
  return {
    symbol,
    quoteType,
    // A fund's profile can name its own "sector" (the manager's); only a
    // company's counts as the holding's sector.
    sector: sectorWeights ? null : sector ? sectorKey(sector) : null,
    country: sectorWeights ? null : text(profile?.country),
    sectorWeights,
  };
}

export type ExposureDimension = "sector" | "country" | "region";

export interface ExposureItem {
  value: number;
  assetType: string | null;
  /** Null when no profile has been found for it. */
  profile: AssetProfile | null;
}

export interface ExposureSlice {
  name: string;
  value: number;
  percent: number;
}

export interface Exposure {
  /** Largest first; Unclassified last, when there is any. */
  slices: ExposureSlice[];
  /** Value of the stocks and ETFs this breakdown is about. */
  total: number;
  /** Value of everything else held, left out on purpose. */
  excluded: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Stocks and funds: the positions a sector or a country can describe. */
export function isEquity(assetType: string | null): boolean {
  return assetType === "stock" || assetType === "etf" || assetType === "stock_etf";
}

/**
 * The stocks and ETFs held, split by sector, country or region.
 *
 * A fund's sector weights are applied to its value; what they do not cover
 * (cash inside the fund, bonds, a remainder the provider leaves out) is
 * Unclassified. Shorts and anything valued at zero or less are left out, as
 * the allocation charts leave them out: a slice cannot be negative.
 */
export function exposure(items: readonly ExposureItem[], dimension: ExposureDimension): Exposure {
  const byName = new Map<string, number>();
  const add = (name: string, value: number) => byName.set(name, (byName.get(name) ?? 0) + value);
  let total = 0;
  let excluded = 0;

  for (const item of items) {
    if (item.value <= 0) continue;
    if (!isEquity(item.assetType)) {
      excluded += item.value;
      continue;
    }
    total += item.value;
    const p = item.profile;
    if (!p) {
      add(UNCLASSIFIED, item.value);
      continue;
    }
    if (dimension === "sector") {
      if (p.sectorWeights) {
        let covered = 0;
        for (const [key, weight] of Object.entries(p.sectorWeights)) {
          const share = Math.min(weight, Math.max(0, 1 - covered));
          covered += share;
          add(sectorLabel(key), item.value * share);
        }
        if (covered < 1) add(UNCLASSIFIED, item.value * (1 - covered));
      } else {
        add(p.sector ? sectorLabel(p.sector) : UNCLASSIFIED, item.value);
      }
    } else if (p.country) {
      add(dimension === "country" ? p.country : regionOf(p.country), item.value);
    } else {
      add(UNCLASSIFIED, item.value);
    }
  }

  const slices = [...byName]
    .filter(([, value]) => round2(value) > 0)
    .map(([name, value]) => ({ name, value: round2(value), percent: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => Number(a.name === UNCLASSIFIED) - Number(b.name === UNCLASSIFIED) || b.value - a.value);
  return { slices, total: round2(total), excluded: round2(excluded) };
}
