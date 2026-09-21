/**
 * Every company an HSBC fund holds, from the workbook HSBC publishes.
 *
 * The third manager, and the least forthcoming. The file is a legacy Excel
 * workbook — the action opens it — whose one sheet states the fund's name, the
 * day, and then per line an ISIN, a name, a country and a weight in percent.
 * No sector, no exchange, no ticker. So its companies arrive with a country
 * and nothing to classify them by; the largest of them get their listing back
 * from the fund's own ten largest (see `withTopTenSymbols`), and with it a
 * sector, a price move and a mark.
 *
 * **Nothing in the file tells a share from a bond.** Xtrackers' file is
 * refused unless its exchange and industry columns are there, which is what
 * makes a line a company; this one has no such column. So the caller has to
 * say, from what the fund states about itself, that it holds shares — and
 * without that the file is refused. An ISIN looks the same on a bond.
 *
 * Pure: it reads rows already taken out of the workbook, so the Excel library
 * stays in the action and out of every test here.
 */

import { parseAmount } from "@/lib/csv";
import { isValidIsin } from "@/lib/portfolio/isin";
import { addsUp, type FundHoldingRow, type FundHoldings } from "./holdings";

/** The workbook's cells, row by row, as the Excel library hands them over. */
export type SheetRows = readonly (readonly unknown[])[];

/**
 * An Excel day number as YYYY-MM-DD.
 *
 * Excel counts days from 30 December 1899 (a date chosen to absorb Lotus's
 * belief that 1900 was a leap year), so 46281 is 16 September 2026. Anything
 * that is not a plausible day of this century is not a date.
 */
export function excelDay(serial: unknown): string | null {
  if (typeof serial !== "number" || !Number.isInteger(serial) || serial < 36526 || serial > 73050) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}

const text = (cell: unknown): string => (typeof cell === "string" ? cell.trim() : typeof cell === "number" ? String(cell) : "");

const number = (cell: unknown): number | null =>
  typeof cell === "number" && Number.isFinite(cell) ? cell : typeof cell === "string" ? parseAmount(cell) : null;

/**
 * The workbook as holdings, or null when it is not one this can read.
 *
 * `holdsShares` is the fund's own statement that it holds shares — its
 * reported split, not a guess from its name. Without it every ISIN in the
 * file would be counted as a company, bonds included.
 */
export function parseHsbcHoldings(rows: SheetRows, { holdsShares }: { holdsShares: boolean }): FundHoldings | null {
  if (!holdsShares) return null;
  const headerAt = rows.findIndex((r) => r.some((c) => text(c) === "ISIN") && r.some((c) => text(c) === "Weighting"));
  if (headerAt < 0) return null;
  const headers = rows[headerAt].map((c) => text(c).toLowerCase());
  const at = (name: string) => headers.indexOf(name);
  const columns = { isin: at("isin"), name: at("securityname"), country: at("country"), weight: at("weighting") };
  if (columns.isin < 0 || columns.name < 0 || columns.weight < 0) return null;

  // The lines above the table: "Date" beside a day number.
  const dateRow = rows.slice(0, headerAt).find((r) => text(r[0]).toLowerCase() === "date");

  const out: FundHoldingRow[] = [];
  let weight = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const name = text(row[columns.name]);
    if (name === "") continue;
    const percent = number(row[columns.weight]);
    if (percent === null) continue;
    const share = percent / 100;
    weight += share;
    const isin = text(row[columns.isin]).toUpperCase();
    const country = columns.country < 0 ? "" : text(row[columns.country]);
    out.push({
      ticker: null,
      exchange: null,
      symbol: null,
      name,
      // The file names no sector. Unclassified is the true answer until a
      // listing is known and its own profile says.
      sector: null,
      // Settlement lines, reclaimable tax and receivables carry no ISIN and a
      // weight of nothing: they are the fund's, not companies.
      kind: isValidIsin(isin) ? "equity" : "other",
      weight: share,
      country: country === "" ? null : country,
    });
  }

  if (out.length === 0 || !addsUp(weight)) return null;
  return { asOf: excelDay(dateRow?.[1]), rows: out, weight };
}

/**
 * Where HSBC keeps a fund's holdings workbook.
 *
 * Keyed by the fund's own ISIN, in lower case, as their site writes it. A fund
 * that is not theirs answers 404 with a web page — which an Excel library
 * would happily read as a table, so the action checks it is a workbook first.
 */
export function hsbcHoldingsUrl(isin: string): string {
  return `https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/${encodeURIComponent(isin.toLowerCase())}/gb/en/holdings`;
}

/**
 * Whether these bytes are a legacy Excel workbook: the compound-file signature
 * every .xls starts with. An error page is not one, whatever its status says.
 */
export function isLegacyWorkbook(bytes: Uint8Array): boolean {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);
}
