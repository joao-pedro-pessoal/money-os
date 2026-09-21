import { describe, expect, it } from "vitest";
import { excelDay, hsbcHoldingsUrl, isLegacyWorkbook, parseHsbcHoldings } from "../hsbc";
import { withTopTenSymbols, type FundHoldingRow } from "../holdings";

/** The real workbook's layout, with rows copied from it and the weights rounded to add up. */
const workbook = [
  ["Name", "HSBC MSCI Emerging Markets UCITS ETF"],
  ["Date", 46281],
  ["Fund Size", 4219572721],
  ["ISIN", "CUSIP", "SecurityName", "NumberOfShare", "MarketValue", "Country", "LocalCurrencyCode", "Weighting"],
  ["TW0002330008", null, "Taiwan Semiconductor Manufacturing Co Ltd", 12075165, 901004584, "Taiwan", "TWD", 60],
  ["KR7005930003", null, "Samsung Electronics Co Ltd", 2294191, 424834668, "South Korea", "KRW", 25],
  ["KYG875721634", null, "Tencent Holdings Ltd", 3011089, 166357236, "China", "HKD", 15],
  [null, null, "Usd Reclaimable Tax On Dividends", 238, 238, null, "USD", 0],
];

describe("the workbook HSBC publishes", () => {
  it("reads each company's weight and country", () => {
    const parsed = parseHsbcHoldings(workbook, { holdsShares: true });
    expect(parsed?.rows).toHaveLength(4);
    expect(parsed?.rows[0]).toEqual({
      ticker: null,
      exchange: null,
      symbol: null,
      name: "Taiwan Semiconductor Manufacturing Co Ltd",
      sector: null,
      kind: "equity",
      weight: 0.6,
      country: "Taiwan",
    });
    expect(parsed?.weight).toBeCloseTo(1, 6);
  });

  it("states the day the file is for", () => {
    expect(parseHsbcHoldings(workbook, { holdsShares: true })?.asOf).toBe("2026-09-16");
  });

  it("keeps the fund's own lines apart from its companies", () => {
    const tax = parseHsbcHoldings(workbook, { holdsShares: true })?.rows.find((r) => r.name.startsWith("Usd"));
    expect(tax?.kind).toBe("other");
  });

  /**
   * Nothing in this file tells a share from a bond: an ISIN looks the same on
   * both. Only the fund's own statement that it holds shares makes its lines
   * companies.
   */
  it("is refused for a fund that has not said it holds shares", () => {
    expect(parseHsbcHoldings(workbook, { holdsShares: false })).toBeNull();
  });

  it("is refused when it does not add up, or is not the table at all", () => {
    expect(parseHsbcHoldings(workbook.slice(0, 5), { holdsShares: true })).toBeNull();
    expect(parseHsbcHoldings([["<html>"], ["Page not found"]], { holdsShares: true })).toBeNull();
  });

  /** A 404 page read by an Excel library becomes a table. The bytes say which it was. */
  it("tells a workbook from a web page by its first bytes", () => {
    expect(isLegacyWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe(true);
    expect(isLegacyWorkbook(new TextEncoder().encode("\r\n\r\n<!DOCTYPE html>"))).toBe(false);
  });

  it("is asked for by the fund's ISIN, as the site writes it", () => {
    expect(hsbcHoldingsUrl("IE000KCS7J59")).toBe(
      "https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/ie000kcs7j59/gb/en/holdings"
    );
  });
});

describe("an Excel day number", () => {
  it("is a day counted from 30 December 1899", () => {
    expect(excelDay(46281)).toBe("2026-09-16");
    expect(excelDay(45658)).toBe("2025-01-01");
  });

  it("is nothing when it is not a plausible day", () => {
    expect(excelDay("46281")).toBeNull();
    expect(excelDay(46281.5)).toBeNull();
    expect(excelDay(12)).toBeNull();
    expect(excelDay(null)).toBeNull();
  });
});

describe("a file's companies, given the ten largest's listings", () => {
  const row = (name: string, symbol: string | null = null, kind: FundHoldingRow["kind"] = "equity"): FundHoldingRow => ({
    ticker: null, exchange: null, symbol, name, sector: null, kind, weight: 0.1, country: null,
  });

  /**
   * Reading the whole file used to take from TSMC and Samsung the listing the
   * ten largest gave them — and with it their sector, price move and mark.
   */
  it("gives a company the listing the ten largest name it under", () => {
    const out = withTopTenSymbols(
      [row("Taiwan Semiconductor Manufacturing Co Ltd"), row("Samsung Electronics Co Ltd")],
      [
        { symbol: "2330.TW", name: "Taiwan Semiconductor Manufacturing Co Ltd" },
        { symbol: "005930.KS", name: "Samsung Electronics Co., Ltd." },
      ]
    );
    expect(out.map((r) => r.symbol)).toEqual(["2330.TW", "005930.KS"]);
  });

  it("leaves a company the ten largest do not name without one, rather than guessing", () => {
    expect(withTopTenSymbols([row("Delta Electronics Inc")], [{ symbol: "2330.TW", name: "TSMC" }])[0].symbol).toBeNull();
  });

  it("never replaces a listing the file already gave", () => {
    expect(withTopTenSymbols([row("Apple Inc", "AAPL")], [{ symbol: "APC.DE", name: "Apple Inc" }])[0].symbol).toBe("AAPL");
  });

  it("gives nothing to the fund's own lines", () => {
    expect(withTopTenSymbols([row("Cash", null, "cash")], [{ symbol: "X", name: "Cash" }])[0].symbol).toBeNull();
  });
});
