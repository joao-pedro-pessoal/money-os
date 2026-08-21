import { describe, it, expect } from "vitest";
import { wasFoundAutomatically, displaySymbol } from "../symbolSource";

/**
 * The test that would have caught the button doing nothing.
 *
 * Every price on the account it was written for came from Yahoo and was stored
 * as `yahoo:SXR8.DE`. The predicate it replaced only recognised the Stooq
 * spelling, so "Forget found prices" matched nothing, reported that it had
 * cleared nothing, and the eleven wrong prices stayed exactly where they were.
 */
describe("telling a guessed symbol from a chosen one", () => {
  it("recognises a Yahoo match, which is how they are actually stored", () => {
    expect(wasFoundAutomatically("yahoo:SXR8.DE")).toBe(true);
    expect(wasFoundAutomatically("yahoo:CSPX.L")).toBe(true);
    expect(wasFoundAutomatically("yahoo:500.PA")).toBe(true);
  });

  it("recognises a Stooq match", () => {
    expect(wasFoundAutomatically("sxr8.de")).toBe(true);
    expect(wasFoundAutomatically("iusn.de")).toBe(true);
    expect(wasFoundAutomatically("spy.us")).toBe(true);
  });

  it("leaves a symbol you typed yourself alone", () => {
    // The whole point of the distinction: undoing a guess must not delete a
    // decision.
    expect(wasFoundAutomatically("AAPL")).toBe(false);
    expect(wasFoundAutomatically("VWCE")).toBe(false);
    expect(wasFoundAutomatically("BTC-EUR")).toBe(false);
  });

  it("does not treat an unknown market as one of ours", () => {
    // `candidateSymbols` only ever produces four suffixes. A fifth means the
    // symbol came from somewhere else, and somewhere else means a person.
    expect(wasFoundAutomatically("abc.jp")).toBe(false);
    expect(wasFoundAutomatically("abc.hk")).toBe(false);
  });

  it("handles nothing, empty and whitespace without deciding anything", () => {
    expect(wasFoundAutomatically(null)).toBe(false);
    expect(wasFoundAutomatically(undefined)).toBe(false);
    expect(wasFoundAutomatically("")).toBe(false);
    expect(wasFoundAutomatically("   ")).toBe(false);
    expect(wasFoundAutomatically(".de")).toBe(false);
  });

  it("shows the listing rather than the storage detail", () => {
    // Reading the listing is how a wrong match gets caught against a broker's
    // screen, so the prefix must not be in the way.
    expect(displaySymbol("yahoo:SXR8.DE")).toBe("SXR8.DE");
    expect(displaySymbol("sxr8.de")).toBe("sxr8.de");
    expect(displaySymbol(null)).toBeNull();
    expect(displaySymbol("")).toBeNull();
  });
});
