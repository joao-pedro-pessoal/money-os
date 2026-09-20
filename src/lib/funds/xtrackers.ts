/**
 * Every company an Xtrackers fund holds, from the file DWS publishes.
 *
 * The second manager read here, and the first that made it worth having a
 * shape of its own — see `holdings.ts`. Where iShares writes German headers, a
 * ticker and a percentage, DWS writes English headers, an ISIN and a fraction,
 * and the two files agree about nothing except what they are for.
 *
 * **It names no ticker.** So the companies in it carry no listing, which means
 * no price move and no mark beside them — but their sector, their country and
 * what you hold of them are all stated, and that is what the table is for. A
 * company also held through a fund that does name tickers keeps that listing:
 * the readings are joined by name, not by file.
 *
 * **Refused when it is not an equity file.** The exchange and industry columns
 * are what make a row a company; a bond fund's file from the same endpoint has
 * neither, and reading it as if it did would file bonds as shares in every
 * total on the screen. A fund whose file is refused keeps its ten largest
 * holdings, which is what it had before.
 *
 * Pure: no fetch, no database. The action does the reading and the saving.
 */

import { parseCsvLine } from "@/lib/library/covers-import";
import { parseAmount } from "@/lib/csv";
import { isValidIsin } from "@/lib/portfolio/isin";
import { sectorKey } from "@/lib/portfolio/exposure";
import { addsUp, type FundHoldingRow, type FundHoldings, type HoldingKind } from "./holdings";

/**
 * The classification MSCI states, in the app's own vocabulary.
 *
 * The same eleven groups the price source reports, under different names — so
 * a company seen through this fund and a share held directly land in one
 * sector rather than two. A name not here becomes null, which the screen shows
 * as Unclassified; the file writes "unknown" for its cash lines.
 */
const SECTORS: Record<string, string> = {
  "information technology": "technology",
  "financials": "financial_services",
  "health care": "healthcare",
  "healthcare": "healthcare",
  "consumer discretionary": "consumer_cyclical",
  "consumer staples": "consumer_defensive",
  "communication services": "communication_services",
  "telecommunication services": "communication_services",
  "industrials": "industrials",
  "energy": "energy",
  "materials": "basic_materials",
  "utilities": "utilities",
  "real estate": "realestate",
};

/**
 * The file's own marker for a currency balance: "_CURRENCYGBP".
 *
 * Cash rather than a company, and it can be negative, which is why the weights
 * are summed rather than assumed.
 */
const CURRENCY_PREFIX = "_CURRENCY";

const HEADER = "ShareClass ISIN";

/**
 * The file as rows, or null when it is not one.
 *
 * `isin` is the fund the file was asked for. Every line names the share class
 * it belongs to, so a file that came back for a different fund can be caught
 * here rather than becoming somebody else's holdings under your fund's name.
 */
export function parseXtrackersHoldings(csv: string, isin?: string | null): FundHoldings | null {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.startsWith(HEADER));
  if (headerAt < 0) return null;
  const headers = parseCsvLine(lines[headerAt], ";").map((h) => h.trim().toLowerCase());
  const at = (name: string) => headers.indexOf(name);
  const columns = {
    fund: at("shareclass isin"),
    isin: at("constituent isin"),
    name: at("constituent name"),
    country: at("constituent country"),
    weight: at("constituent weighting"),
    exchange: at("constituent main exchange name"),
    sector: at("constituent industry classification name"),
  };
  // The last two are what make this an equity file. Without them there is no
  // telling a share from a bond, and guessing is how a bond fund's holdings
  // would be counted as companies.
  if (columns.name < 0 || columns.weight < 0 || columns.exchange < 0 || columns.sector < 0) return null;

  const wanted = (isin ?? "").trim().toUpperCase();
  const rows: FundHoldingRow[] = [];
  let weight = 0;
  for (const line of lines.slice(headerAt + 1)) {
    if (line.trim() === "") continue;
    const cells = parseCsvLine(line, ";");
    const name = (cells[columns.name] ?? "").trim();
    if (name === "") continue;
    // A file for a fund you did not ask about is worse than no file: every
    // figure built on it would be right about a fund you do not hold.
    const fund = (cells[columns.fund] ?? "").trim().toUpperCase();
    if (wanted !== "" && fund !== "" && fund !== wanted) return null;

    const share = parseAmount(cells[columns.weight] ?? "");
    if (share === null) continue;
    weight += share;
    const holdingIsin = (cells[columns.isin] ?? "").trim().toUpperCase();
    const country = (cells[columns.country] ?? "").trim();
    const sector = (cells[columns.sector] ?? "").trim().toLowerCase();
    const exchange = (cells[columns.exchange] ?? "").trim() || null;
    rows.push({
      // The file states an ISIN where iShares states a ticker, and a listing
      // cannot be built from an ISIN without asking somebody. Null, and the
      // company shows no price move rather than a wrong one.
      ticker: null,
      exchange,
      symbol: null,
      name,
      sector: SECTORS[sector] ? sectorKey(SECTORS[sector]) : null,
      kind: kindOf(holdingIsin),
      weight: share,
      country: country === "" ? null : country,
    });
  }

  if (rows.length === 0 || !addsUp(weight)) return null;
  return { asOf: null, rows, weight };
}

/**
 * What a line is, from the only column that says: the constituent's own
 * identifier.
 *
 * A currency balance is marked as one. Anything carrying a valid ISIN is a
 * holding in a company — this file is only ever read when its equity columns
 * are there, which is what makes that safe. Anything else is left as "other",
 * where it counts towards the fund and towards no company.
 */
function kindOf(identifier: string): HoldingKind {
  if (identifier.startsWith(CURRENCY_PREFIX)) return "cash";
  return isValidIsin(identifier) ? "equity" : "other";
}

/**
 * The URL of a fund's constituents file on the DWS site.
 *
 * Keyed by the fund's own ISIN, so there is no product list to fetch first and
 * no table of addresses to keep up to date. The English export is asked for
 * because its countries, exchanges and sectors are already in the words the
 * rest of the app uses. A fund that is not DWS's answers 500 with a web page.
 */
export function xtrackersHoldingsUrl(isin: string): string {
  return `https://etf.dws.com/etfdata/export/GBR/ENG/csv/product/constituent/${encodeURIComponent(isin.toUpperCase())}/`;
}
