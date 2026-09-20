import { describe, expect, it } from "vitest";
import { isharesHoldingsUrl, parseGermanDay, parseIsharesHoldings } from "../ishares";

/** The real file's shape, as served on 17 September 2026. */
const HEAD = [
  'Fondsposition per,"17.Sept.2026"',
  " ",
  "Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung",
].join("\n");

const row = (
  ticker: string,
  name: string,
  sector: string,
  kind: string,
  weight: string,
  country: string,
  exchange = "Xetra"
) => `"${ticker}","${name}","${sector}","${kind}","1.000,00","${weight}","1.000,00","10,00","100,00","${country}","${exchange}","EUR"`;

const file = (...rows: string[]) => [HEAD, ...rows, " "].join("\n");

describe("the file a fund publishes", () => {
  it("reads a company's weight, sector and country into the app's own words", () => {
    const out = parseIsharesHoldings(
      file(row("NVDA", "NVIDIA CORP", "IT", "Aktien", "60,00", "Vereinigte Staaten"),
        row("VNA", "VONOVIA SE", "Immobilien", "Aktien", "40,00", "Deutschland"))
    );
    expect(out?.rows).toEqual([
      { ticker: "NVDA", exchange: "Xetra", symbol: "NVDA.DE", name: "NVIDIA CORP", sector: "technology", kind: "equity", weight: 0.6, country: "United States" },
      { ticker: "VNA", exchange: "Xetra", symbol: "VNA.DE", name: "VONOVIA SE", sector: "realestate", kind: "equity", weight: 0.4, country: "Germany" },
    ]);
    expect(out?.weight).toBeCloseTo(1, 10);
    expect(out?.asOf).toBe("2026-09-17");
  });

  /**
   * The same sector key the price source reports, so a share held directly and
   * the same company inside a fund land in one sector instead of two.
   */
  it("uses the sector keys the rest of the app uses", () => {
    const sectors = [
      ["Kommunikation", "communication_services"],
      ["Zyklische Konsumgüter", "consumer_cyclical"],
      ["Nichtzyklische Konsumgüter", "consumer_defensive"],
      ["Gesundheitsversorgung", "healthcare"],
      ["Finanzwesen", "financial_services"],
      ["Versorger", "utilities"],
      ["Materialien", "basic_materials"],
      ["Industrie", "industrials"],
      ["Energie", "energy"],
    ] as const;
    for (const [german, key] of sectors) {
      const out = parseIsharesHoldings(file(row("X", "A COMPANY", german, "Aktien", "100,00", "Japan")));
      expect(out?.rows[0].sector).toBe(key);
    }
  });

  it("marks cash and futures as what they are, with no sector", () => {
    const out = parseIsharesHoldings(
      file(row("EUR", "EUR CASH", "Cash und/oder Derivate", "Geldmarkt", "99,00", "Europäische Union"),
        row("SRIZ6", "EURO STOXX REAL ESTATE DEC 26", "Cash und/oder Derivate", "Futures", "1,00", "-"))
    );
    expect(out?.rows.map((r) => [r.kind, r.sector, r.country])).toEqual([
      ["cash", null, null],
      ["derivative", null, null],
    ]);
  });

  /** A name the map does not know is unknown, not a guess from a prefix. */
  it("leaves a country it cannot translate unclassified", () => {
    const out = parseIsharesHoldings(file(row("X", "A COMPANY", "IT", "Aktien", "100,00", "Atlantis")));
    expect(out?.rows[0].country).toBeNull();
  });

  /**
   * A truncated download and a disclaimer page both arrive looking like a
   * short portfolio, which would understate every company in it.
   */
  it("refuses a file whose weights do not add up to the fund", () => {
    expect(parseIsharesHoldings(file(row("X", "A COMPANY", "IT", "Aktien", "12,00", "Japan")))).toBeNull();
    expect(parseIsharesHoldings("<!doctype html><html><body>Please accept…</body></html>")).toBeNull();
    expect(parseIsharesHoldings(file())).toBeNull();
  });

  it("reads the day the fund states", () => {
    expect(parseGermanDay('Fondsposition per,"17.Sept.2026"')).toBe("2026-09-17");
    expect(parseGermanDay('Fondsposition per,"1.März.2026"')).toBe("2026-03-01");
    expect(parseGermanDay("no date here")).toBeNull();
  });

  it("builds the file's address from the product page", () => {
    expect(isharesHoldingsUrl("/de/privatanleger/de/produkte/253743/ishares-sp-500-b-ucits-etf-acc-fund", "SXR8")).toBe(
      "https://www.ishares.com/de/privatanleger/de/produkte/253743/ishares-sp-500-b-ucits-etf-acc-fund/1478358465952.ajax?fileType=csv&fileName=SXR8_holdings&dataType=fund"
    );
  });
});

describe("the listing each row is asked about", () => {
  const line = (ticker: string, exchange: string, country: string) =>
    `"${ticker}","A COMPANY","IT","Aktien","1.000,00","100,00","1.000,00","10,00","100,00","${country}","${exchange}","USD"`;
  const wrap = (row: string) =>
    ['Fondsposition per,"17.Sept.2026"', " ", "Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung", row, " "].join("\n");

  it("works the symbol out from the exchange the file names", () => {
    expect(parseIsharesHoldings(wrap(line("NVDA", "NASDAQ", "Vereinigte Staaten")))?.rows[0].symbol).toBe("NVDA");
    expect(parseIsharesHoldings(wrap(line("7203", "Tokyo Stock Exchange", "Japan")))?.rows[0].symbol).toBe("7203.T");
  });

  it("leaves it null where the market is not one it knows", () => {
    expect(parseIsharesHoldings(wrap(line("X", "NO MARKET (E.G. UNLISTED)", "Japan")))?.rows[0].symbol).toBeNull();
  });
});
