/**
 * Every company a fund holds, from the file the fund manager publishes.
 *
 * The price source reports a fund's ten largest holdings, which on an S&P 500
 * tracker is 19% of it and on a small-cap fund almost nothing. The rest was
 * reported as unseen — honest, and not much use for the question "what am I
 * actually exposed to". BlackRock publishes the whole list, updated daily, as
 * a CSV beside each fund: 510 rows for the S&P 500 tracker, 3 600 for MSCI
 * World Small Cap.
 *
 * **Why the German site.** The same file is served from every iShares country
 * site. The British and Irish ones answer a disclaimer page instead of the
 * file, and the Swiss path 404s; the German one returns it. So the headers,
 * the sectors, the countries and the numbers all arrive in German, and the
 * maps below translate them into the vocabulary the rest of the app already
 * uses — the same sector keys the price source reports, so a company seen
 * through a fund and a share held directly land in one sector rather than two.
 *
 * A name not in the maps becomes null, which the screen shows as Unclassified.
 * Guessing it from a prefix is how a "Kommunikation" would end up filed under
 * "Kommunale Versorger".
 *
 * Pure: no fetch, no database. The action does the reading and the saving.
 */

import { parseCsvLine } from "@/lib/library/covers-import";
import { parseAmount } from "@/lib/csv";
import { sectorKey } from "@/lib/portfolio/exposure";
import { yahooListing } from "./listing";
import { addsUp, type FundHoldingRow, type FundHoldings, type HoldingKind } from "./holdings";

// The shape every reader produces, so a caller needs one import for any of them.
export type { FundHoldingRow, FundHoldings, HoldingKind } from "./holdings";


const SECTORS: Record<string, string> = {
  "informationstechnologie": "technology",
  "it": "technology",
  "finanzwesen": "financial_services",
  "finanzen": "financial_services",
  "gesundheitsversorgung": "healthcare",
  "gesundheitswesen": "healthcare",
  "zyklische konsumgüter": "consumer_cyclical",
  "nicht-basiskonsumgüter": "consumer_cyclical",
  "nichtzyklische konsumgüter": "consumer_defensive",
  "basiskonsumgüter": "consumer_defensive",
  "kommunikation": "communication_services",
  "telekommunikationsdienste": "communication_services",
  "industrie": "industrials",
  "energie": "energy",
  "materialien": "basic_materials",
  "roh-, hilfs- & betriebsstoffe": "basic_materials",
  "grundstoffe": "basic_materials",
  "versorger": "utilities",
  "versorgungsbetriebe": "utilities",
  "immobilien": "realestate",
};

/**
 * The countries seen across the funds held, plus the rest of the developed and
 * emerging markets an index fund can reach. Unknown stays unknown.
 */
const COUNTRIES: Record<string, string> = {
  "vereinigte staaten": "United States",
  "kanada": "Canada",
  "bermuda": "Bermuda",
  "kaimaninseln": "Cayman Islands",
  "mexiko": "Mexico",
  "brasilien": "Brazil",
  "chile": "Chile",
  "kolumbien": "Colombia",
  "peru": "Peru",
  "argentinien": "Argentina",
  "uruguay": "Uruguay",
  "panama": "Panama",
  "deutschland": "Germany",
  "frankreich": "France",
  "niederlande": "Netherlands",
  "belgien": "Belgium",
  "luxemburg": "Luxembourg",
  "irland": "Ireland",
  "vereinigtes königreich": "United Kingdom",
  "jersey": "Jersey",
  "guernsey": "Guernsey",
  "isle of man": "Isle of Man",
  "schweiz": "Switzerland",
  "österreich": "Austria",
  "italien": "Italy",
  "spanien": "Spain",
  "portugal": "Portugal",
  "griechenland": "Greece",
  "dänemark": "Denmark",
  "schweden": "Sweden",
  "norwegen": "Norway",
  "finnland": "Finland",
  "island": "Iceland",
  "polen": "Poland",
  "tschechien": "Czech Republic",
  "tschechische republik": "Czech Republic",
  "ungarn": "Hungary",
  "rumänien": "Romania",
  "bulgarien": "Bulgaria",
  "kroatien": "Croatia",
  "slowenien": "Slovenia",
  "slowakei": "Slovakia",
  "estland": "Estonia",
  "lettland": "Latvia",
  "litauen": "Lithuania",
  "malta": "Malta",
  "zypern": "Cyprus",
  "liechtenstein": "Liechtenstein",
  "monaco": "Monaco",
  "japan": "Japan",
  "china": "China",
  "festlandchina": "China",
  "hongkong": "Hong Kong",
  "taiwan": "Taiwan",
  "südkorea": "South Korea",
  "korea": "South Korea",
  "singapur": "Singapore",
  "indien": "India",
  "australien": "Australia",
  "neuseeland": "New Zealand",
  "indonesien": "Indonesia",
  "malaysia": "Malaysia",
  "thailand": "Thailand",
  "philippinen": "Philippines",
  "vietnam": "Vietnam",
  "macau": "Macau",
  "israel": "Israel",
  "südafrika": "South Africa",
  "vereinigte arabische emirate": "United Arab Emirates",
  "saudi-arabien": "Saudi Arabia",
  "katar": "Qatar",
  "türkei": "Turkey",
  "ägypten": "Egypt",
  "kuwait": "Kuwait",
  "nigeria": "Nigeria",
  "marokko": "Morocco",
};

const KINDS: Record<string, HoldingKind> = {
  "aktien": "equity",
  "reit": "equity",
  "anleihen": "bond",
  "staatsanleihen": "bond",
  "unternehmensanleihen": "bond",
  "geldmarkt": "cash",
  "money market": "cash",
  "cash collateral and margins": "cash",
  "cash und/oder derivate": "cash",
  "futures": "derivative",
  "fx": "derivative",
  "optionen": "derivative",
  "swaps": "derivative",
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mär: 3, mar: 3, apr: 4, mai: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12,
};

/** "17.Sept.2026" — the day the fund states the file is for. */
export function parseGermanDay(raw: string): string | null {
  const match = /(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\.?\s*(\d{4})/.exec(raw.trim());
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HEADER = "Emittententicker";

/**
 * The file as rows, or null when it is not one.
 *
 * Refused rather than half-read when the weights do not add up to about the
 * whole fund: a truncated download, or a page served instead of a file, both
 * arrive looking like a short portfolio, and a short portfolio quietly
 * understates every company in it.
 */
export function parseIsharesHoldings(csv: string): FundHoldings | null {
  const lines = csv.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.startsWith(HEADER));
  if (headerAt < 0) return null;
  const headers = parseCsvLine(lines[headerAt], ",").map((h) => h.trim().toLowerCase());
  const at = (name: string) => headers.findIndex((h) => h.startsWith(name));
  const columns = {
    ticker: at("emittententicker"),
    name: at("name"),
    sector: at("sektor"),
    kind: at("anlageklasse"),
    weight: at("gewichtung"),
    country: at("standort"),
    exchange: at("börse"),
  };
  if (columns.name < 0 || columns.weight < 0) return null;

  const rows: FundHoldingRow[] = [];
  let weight = 0;
  for (const line of lines.slice(headerAt + 1)) {
    if (line.trim() === "") continue;
    const cells = parseCsvLine(line, ",");
    const name = (cells[columns.name] ?? "").trim();
    if (name === "") continue;
    // The file writes 2,27 for 2.27%, and the fund's own currency amounts with
    // thousands dots. parseAmount reads both conventions.
    const percent = parseAmount(cells[columns.weight] ?? "");
    if (percent === null) continue;
    const share = percent / 100;
    weight += share;
    const sectorName = (cells[columns.sector] ?? "").trim().toLowerCase();
    const countryName = (cells[columns.country] ?? "").trim().toLowerCase();
    const kindName = (cells[columns.kind] ?? "").trim().toLowerCase();
    const ticker = (cells[columns.ticker] ?? "").trim() || null;
    const exchange = (cells[columns.exchange] ?? "").trim() || null;
    const country = COUNTRIES[countryName] ?? null;
    rows.push({
      ticker,
      exchange,
      symbol: yahooListing({ ticker, exchange, country }),
      name,
      sector: SECTORS[sectorName] ? sectorKey(SECTORS[sectorName]) : null,
      kind: KINDS[kindName] ?? "other",
      weight: share,
      country,
    });
  }

  if (rows.length === 0 || !addsUp(weight)) return null;
  return { asOf: parseGermanDay(lines[0] ?? ""), rows, weight };
}

/**
 * The URL of a fund's holdings file on the German iShares site.
 *
 * `page` is the product path the screener gives for an ISIN; the number in the
 * middle is that site's file endpoint and is the same for every fund on it.
 * `ticker` only names the download.
 */
export function isharesHoldingsUrl(page: string, ticker: string): string {
  const path = page.startsWith("http") ? page : `https://www.ishares.com${page}`;
  return `${path}/1478358465952.ajax?fileType=csv&fileName=${encodeURIComponent(ticker)}_holdings&dataType=fund`;
}
