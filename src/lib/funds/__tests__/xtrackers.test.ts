import { describe, expect, it } from "vitest";
import { parseXtrackersHoldings, xtrackersHoldingsUrl } from "../xtrackers";

/** The real file's header, and rows copied from it. */
const HEADER =
  "ShareClass ISIN;Constituent ISIN;Constituent Name;Constituent Country;Constituent Currency ISO Code;" +
  "Constituent Weighting;Constituent Rating;Constituent Main Exchange Name;Constituent Industry Classification Name";

const file = (rows: string[]) => [HEADER, ...rows].join("\r\n");

const IMI = "LU0322253906;GB00BGLP8L22;IMI PLC;United Kingdom;GBP;0.5000000000;;London Stock Exchange;Industrials";
const BEAZLEY = "LU0322253906;GB00BYQ0JC66;BEAZLEY PLC;United Kingdom;GBP;0.3000000000;;London Stock Exchange;Financials";
const GTT = "LU0322253906;FR0011726835;GAZTRANSPORT & TECHNIGAZ SA;France;EUR;0.2000000000;;Euronext Paris;Energy";
const CASH = "LU0322253906;_CURRENCYGBP;POUND STERLING;United Kingdom;GBP;-0.0000836830;;;unknown";

describe("the file DWS publishes", () => {
  it("reads a company's weight, sector and country", () => {
    const parsed = parseXtrackersHoldings(file([IMI, BEAZLEY, GTT]), "LU0322253906");
    expect(parsed?.rows).toHaveLength(3);
    expect(parsed?.rows[0]).toEqual({
      ticker: null,
      exchange: "London Stock Exchange",
      symbol: null,
      name: "IMI PLC",
      sector: "industrials",
      kind: "equity",
      weight: 0.5,
      country: "United Kingdom",
    });
    expect(parsed?.rows[1].sector).toBe("financial_services");
  });

  /** The weights are a fraction of the fund already, not a percentage. */
  it("adds up to the whole fund", () => {
    expect(parseXtrackersHoldings(file([IMI, BEAZLEY, GTT]), "LU0322253906")?.weight).toBeCloseTo(1, 6);
  });

  it("marks a currency balance as cash, and lets it be negative", () => {
    const parsed = parseXtrackersHoldings(file([IMI, BEAZLEY, GTT, CASH]), "LU0322253906");
    const cash = parsed?.rows.find((r) => r.name === "POUND STERLING");
    expect(cash?.kind).toBe("cash");
    expect(cash?.weight).toBeLessThan(0);
  });

  /**
   * A short file is a truncated download or a page served instead of one, and
   * it looks exactly like a portfolio that has shrunk.
   */
  it("refuses a file whose weights do not add up", () => {
    expect(parseXtrackersHoldings(file([IMI]), "LU0322253906")).toBeNull();
    expect(parseXtrackersHoldings("<!DOCTYPE html><html>error</html>")).toBeNull();
  });

  /**
   * Every line names the share class it belongs to. A file that came back for
   * another fund would be right about a fund nobody holds.
   */
  it("refuses a file that belongs to another fund", () => {
    expect(parseXtrackersHoldings(file([IMI, BEAZLEY, GTT]), "LU0274208692")).toBeNull();
  });

  /**
   * The exchange and industry columns are what tell a share from a bond. A
   * file without them is left unread, and the fund keeps its ten largest.
   */
  it("refuses a file with no equity columns", () => {
    const bonds = [
      "ShareClass ISIN;Constituent ISIN;Constituent Name;Constituent Country;Constituent Currency ISO Code;Constituent Weighting;Constituent Rating;Coupon;Maturity",
      "LU0290355717;DE0001102under;BUND 0%;Germany;EUR;1.0000000000;AAA;0;2033-05-15",
    ].join("\r\n");
    expect(parseXtrackersHoldings(bonds, "LU0290355717")).toBeNull();
  });
});

describe("where the file is asked for", () => {
  it("is keyed by the fund's own ISIN", () => {
    expect(xtrackersHoldingsUrl("LU0322253906")).toBe(
      "https://etf.dws.com/etfdata/export/GBR/ENG/csv/product/constituent/LU0322253906/"
    );
    expect(xtrackersHoldingsUrl("lu0322253906")).toContain("LU0322253906");
  });
});
