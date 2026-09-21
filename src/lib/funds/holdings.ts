/**
 * What a fund's published holdings file says, whoever published it.
 *
 * One shape for every manager: iShares writes German headers and a ticker per
 * line, Xtrackers English ones and an ISIN instead, HSBC a workbook with an
 * ISIN and nothing else — and the screens must not care. A reader that
 * produced its own shape would make the table ask which manager each row came
 * from, which is exactly the question nobody looking at "how much Apple do I
 * hold" is asking.
 *
 * Pure.
 */

import { companyKey } from "@/lib/portfolio/lookThrough";

/** One line of the file: a company, a bond, a cash balance or a future. */
export interface FundHoldingRow {
  /** The issuer ticker as the file writes it ("AAPL", "VNA"), or null. */
  ticker: string | null;
  /** The exchange as the file names it, which is what identifies the listing. */
  exchange: string | null;
  /**
   * The listing to ask a price source about ("VNA.DE"), or null where the
   * market is one `lib/funds/listing.ts` does not know — or where the file
   * names no ticker at all, which is how Xtrackers publishes. Worked out when
   * the file is read, so a screen never has to.
   */
  symbol: string | null;
  name: string;
  /** In the app's sector vocabulary, or null where the file names no sector. */
  sector: string | null;
  /** What kind of thing the line is, in the file's own terms. */
  kind: HoldingKind;
  /** Fraction of the fund, 0–1. */
  weight: number;
  /** Country in English, or null when the file says none or names one not in the map. */
  country: string | null;
}

export type HoldingKind = "equity" | "bond" | "cash" | "derivative" | "other";

export interface FundHoldings {
  /** The day the fund states the file is for, as YYYY-MM-DD, or null. */
  asOf: string | null;
  rows: FundHoldingRow[];
  /** What the weights add up to, 0-1. A file that does not add up is refused. */
  weight: number;
}

/**
 * Whether the weights describe a whole fund.
 *
 * A truncated download and a page served instead of a file both arrive looking
 * like a short portfolio, and a short portfolio quietly understates every
 * company in it. Refused rather than half-read.
 */
export function addsUp(weight: number): boolean {
  return weight >= 0.9 && weight <= 1.1;
}

/**
 * A file's companies, with the listing the fund's ten largest give them.
 *
 * Two managers publish no ticker — DWS writes an ISIN, HSBC an ISIN and
 * nothing else — so reading their whole file used to cost the largest
 * companies what the ten largest had given them: TSMC, Samsung and SK hynix
 * had a listing, and with it a sector, a price move and a mark, and the
 * complete file took all three away while adding a thousand smaller names.
 *
 * The price source's ten largest name each company with its listing. Where a
 * line of the file is the same company — the same key `lookThrough` already
 * joins companies by, across every fund — it takes that listing. A line the
 * ten largest do not name keeps none, and shows no move rather than a guessed
 * one. A line that already has a listing keeps its own.
 */
export function withTopTenSymbols(
  rows: readonly FundHoldingRow[],
  topTen: readonly { symbol?: string | null; name: string }[] | null | undefined
): FundHoldingRow[] {
  const listed = new Map<string, string>();
  for (const h of topTen ?? []) {
    const key = companyKey(h.name);
    if (key !== "" && h.symbol) listed.set(key, h.symbol);
  }
  if (listed.size === 0) return [...rows];
  return rows.map((r) => (r.symbol || r.kind !== "equity" ? r : { ...r, symbol: listed.get(companyKey(r.name)) ?? null }));
}
