/**
 * What a fund's published holdings file says, whoever published it.
 *
 * One shape for every manager: iShares writes German headers and a ticker per
 * line, Xtrackers writes English ones and an ISIN instead, and the screens
 * must not care. A reader that produced its own shape would make the table ask
 * which manager each row came from, which is exactly the question nobody looking
 * at "how much Apple do I hold" is asking.
 *
 * Pure: types and nothing else.
 */

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
