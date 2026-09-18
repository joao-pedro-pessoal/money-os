/**
 * What investing costs you: what your funds take each year (TER), and what
 * you paid in fees.
 *
 * A fund's TER never appears as a line on a statement — it is taken inside
 * the fund's price, a little every day — so it is the cost most easily
 * forgotten. It is worked out here as what you hold × the TER the provider
 * reports. A fund with no reported TER is listed as unknown with its value,
 * never counted as free.
 *
 * Fees paid are the ones on your imported movements: the fee on each trade
 * (the same figure Trade history charts) and fee movements of their own, such
 * as custody. Pure: profiles and movements are read elsewhere.
 */

import { isInstrumentTrade, type TradeRow } from "@/lib/trading/stats";
import type { AssetProfile } from "./exposure";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface FundCostItem {
  label: string;
  value: number;
  assetType: string | null;
  profile: AssetProfile | null;
}

export interface FundCost {
  name: string;
  value: number;
  /** Fraction, 0.002 for 0.20%. */
  ter: number;
  /** value × ter: roughly what the fund takes in a year at today's value. */
  yearly: number;
}

export interface FundCosts {
  funds: FundCost[];
  /** Sum of `yearly`. */
  yearly: number;
  /** Value in funds whose TER is known. */
  covered: number;
  /** Funds with no reported TER: shown, never counted as free. */
  unknown: { name: string; value: number }[];
  /** yearly ÷ covered: the average TER, weighted by what you hold. Null with no fund known. */
  weightedTer: number | null;
}

/** Whether a position is a fund, by its profile when read, else by its asset type. */
function isFund(item: FundCostItem): boolean {
  const type = item.profile?.quoteType;
  if (type) return type === "ETF" || type === "MUTUALFUND";
  return item.assetType === "etf";
}

export function fundCosts(items: readonly FundCostItem[]): FundCosts {
  const funds: FundCost[] = [];
  const unknown: { name: string; value: number }[] = [];

  for (const item of items) {
    if (item.value <= 0 || !isFund(item)) continue;
    const name = item.profile?.name ?? item.label;
    const ter = item.profile?.expenseRatio ?? null;
    if (ter === null) {
      unknown.push({ name, value: round2(item.value) });
      continue;
    }
    funds.push({ name, value: round2(item.value), ter, yearly: round2(item.value * ter) });
  }

  funds.sort((a, b) => b.yearly - a.yearly);
  unknown.sort((a, b) => b.value - a.value);
  const yearly = funds.reduce((s, f) => s + f.yearly, 0);
  const covered = funds.reduce((s, f) => s + f.value, 0);
  return {
    funds,
    yearly: round2(yearly),
    covered: round2(covered),
    unknown,
    weightedTer: covered > 0 ? yearly / covered : null,
  };
}

export interface FeeRow extends TradeRow {
  accountName: string;
}

export interface FeeYear {
  year: string;
  /** Fees on buys and sells, as Trade history counts them. */
  trading: number;
  /** Fee movements of their own: custody, account, platform fees. */
  other: number;
  total: number;
  /** By account, largest first. */
  accounts: { name: string; total: number }[];
}

/**
 * Fees paid, by calendar year, newest first.
 *
 * Trade fees are summed exactly as `cumulativePnl` sums them, so this page and
 * Trade history cannot disagree. A fee movement is money that left: its amount
 * is negative, and what it cost is the opposite.
 */
export function feesByYear(rows: readonly FeeRow[]): FeeYear[] {
  const years = new Map<string, { trading: number; other: number; accounts: Map<string, number> }>();
  const add = (row: FeeRow, kind: "trading" | "other", amount: number) => {
    if (amount === 0) return;
    const year = row.date.slice(0, 4);
    const y = years.get(year) ?? { trading: 0, other: 0, accounts: new Map<string, number>() };
    y[kind] += amount;
    y.accounts.set(row.accountName, (y.accounts.get(row.accountName) ?? 0) + amount);
    years.set(year, y);
  };

  for (const row of rows) {
    if (isInstrumentTrade(row)) {
      if (row.fees !== null) add(row, "trading", row.fees);
    } else if (row.type.toUpperCase() === "FEE") {
      add(row, "other", -row.amount);
    }
  }

  return [...years]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, y]) => ({
      year,
      trading: round2(y.trading),
      other: round2(y.other),
      total: round2(y.trading + y.other),
      accounts: [...y.accounts]
        .map(([name, total]) => ({ name, total: round2(total) }))
        .filter((a) => a.total !== 0)
        .sort((a, b) => b.total - a.total),
    }));
}
