import { describe, expect, it } from "vitest";
import { shortName } from "../shortName";

/**
 * Every long name here is real, taken from the Investments table where they
 * wrapped mid-word and made twelve rows unreadable.
 */
describe("shortName", () => {
  it("keeps the fund and drops the umbrella and the share class", () => {
    expect(shortName("Amundi Index Solutions - Amundi S&P 500 UCITS ETF - EUR (C)")).toBe("S&P 500");
    expect(shortName("iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc)")).toBe(
      "Core S&P 500"
    );
    expect(shortName("iShares VII plc - iShares NASDAQ 100 UCITS ETF USD (Acc)")).toBe("NASDAQ 100");
    expect(shortName("iShares III plc - iShares MSCI World Small Cap UCITS ETF USD (Acc)")).toBe(
      "MSCI World Small Cap"
    );
  });

  it("handles a name with no umbrella prefix", () => {
    expect(shortName("UBS Core MSCI Europe UCITS ETF hEUR acc")).toBe("Core MSCI Europe");
    expect(shortName("HSBC MSCI EMERGING MARKETS UCITS ETF USD (ACC)")).toBe(
      "MSCI EMERGING MARKETS"
    );
  });

  it("strips the _EQ suffix from a broker's internal code", () => {
    expect(shortName("MVOLI_EQ")).toBe("MVOLI");
    expect(shortName("PHAGa_EQ")).toBe("PHAGa");
    expect(shortName("IPRPa_EQ")).toBe("IPRPa");
  });

  it("leaves a plain ticker alone", () => {
    // There is nothing to shorten, and inventing a change would be worse.
    for (const t of ["BTC", "HYPE", "AAPL", "VWCE"]) {
      expect(shortName(t)).toBe(t);
    }
  });

  it("leaves a name it has no rule for untouched", () => {
    expect(shortName("DIVIDEND 15 SPLIT A CD 15")).toBe("DIVIDEND 15 SPLIT A CD 15");
  });

  it("never returns something longer than what it was given", () => {
    const names = [
      "Amundi Index Solutions - Amundi S&P 500 UCITS ETF - EUR (C)",
      "UBS Core MSCI Europe UCITS ETF hEUR acc",
      "BTC",
      "DIVIDEND 15 SPLIT A CD 15",
    ];
    for (const n of names) {
      expect(shortName(n).length).toBeLessThanOrEqual(n.length);
    }
  });

  it("falls back to the original rather than returning nothing", () => {
    // A name made entirely of words the rule calls noise means the rule is
    // wrong for this row, not that the row has no name.
    expect(shortName("UCITS ETF")).toBe("UCITS ETF");
  });

  it("keeps a lone issuer rather than emptying the cell", () => {
    // "plc" goes, "iShares" stays: an issuer is only dropped when something
    // more specific survives it.
    expect(shortName("iShares plc")).toBe("iShares");
  });

  it("keeps the cap size, which is the whole difference between two funds", () => {
    expect(shortName("iShares Core MSCI World Small Cap UCITS ETF")).toBe(
      "Core MSCI World Small Cap"
    );
    expect(shortName("SPDR MSCI USA Large Cap UCITS ETF")).toBe("MSCI USA Large Cap");
  });

  it("decides nothing about nothing", () => {
    expect(shortName(null)).toBe("");
    expect(shortName(undefined)).toBe("");
    expect(shortName("   ")).toBe("");
  });

  it("keeps the issuer when it is all the name has", () => {
    // Dropping it would leave an empty cell where a real holding sits.
    expect(shortName("Vanguard")).toBe("Vanguard");
  });
});
