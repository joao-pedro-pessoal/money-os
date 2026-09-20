import { describe, expect, it } from "vitest";
import { listingAlternatives, yahooListing } from "../listing";

const listing = (ticker: string, exchange: string, country: string | null = null) =>
  yahooListing({ ticker, exchange, country });

describe("the listing to ask about a company inside a fund", () => {
  it("leaves an American ticker alone", () => {
    expect(listing("NVDA", "NASDAQ")).toBe("NVDA");
    expect(listing("CCI", "New York Stock Exchange Inc.")).toBe("CCI");
  });

  it("adds the market's suffix everywhere else", () => {
    expect(listing("VNA", "Xetra")).toBe("VNA.DE");
    expect(listing("AZN", "London Stock Exchange")).toBe("AZN.L");
    expect(listing("MC", "Nyse Euronext - Euronext Paris")).toBe("MC.PA");
    expect(listing("ASML", "Euronext Amsterdam")).toBe("ASML.AS");
    expect(listing("NESN", "SIX Swiss Exchange")).toBe("NESN.SW");
    expect(listing("7203", "Tokyo Stock Exchange")).toBe("7203.T");
    expect(listing("RY", "Toronto Stock Exchange")).toBe("RY.TO");
    expect(listing("CSL", "Asx - All Markets")).toBe("CSL.AX");
  });

  /** One name, four markets: only the company's country tells them apart. */
  it("separates the Nordic markets by the company's country", () => {
    expect(listing("VOLV B", "Nasdaq Omx Nordic", "Sweden")).toBe("VOLV-B.ST");
    expect(listing("NOVO B", "Nasdaq Omx Nordic", "Denmark")).toBe("NOVO-B.CO");
    expect(listing("NOKIA", "Nasdaq Omx Nordic", "Finland")).toBe("NOKIA.HE");
    expect(listing("X", "Nasdaq Omx Nordic", "Japan")).toBeNull();
  });

  it("writes a share class the way the price source does", () => {
    expect(listing("HEBA B", "Nasdaq Omx Nordic", "Sweden")).toBe("HEBA-B.ST");
    expect(listing("BRK B", "New York Stock Exchange Inc.")).toBe("BRK-B");
  });

  /** Hong Kong codes are padded: 700 is asked for as 0700.HK. */
  it("pads a Hong Kong code to four digits", () => {
    expect(listing("700", "Hong Kong Exchanges And Clearing Ltd")).toBe("0700.HK");
    expect(listing("1299", "Hong Kong Exchanges And Clearing Ltd")).toBe("1299.HK");
  });

  /**
   * A wrong symbol is a price belonging to another company. Saying nothing is
   * the only safe answer where the market is unknown.
   */
  it("says nothing rather than guessing", () => {
    expect(listing("XYZ", "Some Exchange Nobody Mapped")).toBeNull();
    expect(listing("XYZ", "NO MARKET (E.G. UNLISTED)")).toBeNull();
    expect(listing("", "NASDAQ")).toBeNull();
    expect(listing("XYZ", "")).toBeNull();
  });
});

/**
 * Every one of these was seen in this portfolio: the price source's own fund
 * data spells a listing one way and its quotes another.
 */
describe("other spellings worth trying", () => {
  it("tries the other Korean market", () => {
    expect(listingAlternatives("005930.KQ")).toContain("005930.KS");
    expect(listingAlternatives("000660.KS")).toContain("000660.KQ");
  });

  it("gives a bare six-digit code a Korean market", () => {
    expect(listingAlternatives("005935")).toEqual(["005935.KS", "005935.KQ"]);
  });

  it("pads a bare Hong Kong code to four digits", () => {
    expect(listingAlternatives("00939")).toEqual(["0939.HK"]);
  });

  /** Rolls-Royce arrives as "RR..L" and is quoted as "RR.L". */
  it("collapses a doubled dot", () => {
    expect(listingAlternatives("RR..L")).toEqual(["RR.L"]);
  });

  it("writes a share class with a dash", () => {
    expect(listingAlternatives("GIB.A.TO")).toEqual(["GIB-A.TO"]);
  });

  it("offers nothing for a listing that needs no fixing", () => {
    expect(listingAlternatives("NVDA")).toEqual([]);
    expect(listingAlternatives("VNA.DE")).toEqual([]);
    expect(listingAlternatives("")).toEqual([]);
  });
});
