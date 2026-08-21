import { describe, it, expect } from "vitest";
import {
  looksUnified,
  parseAbstraction,
  isUnifiedAbstraction,
  parsePortfolioValue,
} from "../parse";

describe("asking the venue whether the account is unified", () => {
  it("reads the documented answers", () => {
    expect(parseAbstraction("unifiedAccount")).toBe("unifiedAccount");
    expect(parseAbstraction("portfolioMargin")).toBe("portfolioMargin");
    expect(parseAbstraction("default")).toBe("default");
  });

  it("reports nothing usable as null, so the caller can fall back", () => {
    expect(parseAbstraction(null)).toBeNull();
    expect(parseAbstraction("")).toBeNull();
    expect(parseAbstraction({ mode: "unifiedAccount" })).toBeNull();
  });

  it("treats unified and portfolio margin as one pot", () => {
    // Hyperliquid's docs group both: under either, the spot balance is the
    // collateral, so adding the perps value on top counts it twice.
    expect(isUnifiedAbstraction("unifiedAccount")).toBe(true);
    expect(isUnifiedAbstraction("portfolioMargin")).toBe(true);
  });

  it("leaves the separated modes alone", () => {
    for (const mode of ["default", "disabled", "dexAbstraction", null]) {
      expect(isUnifiedAbstraction(mode)).toBe(false);
    }
  });
});

describe("reading the venue's own portfolio value", () => {
  const payload = [
    [
      "day",
      {
        accountValueHistory: [
          [1741886630493, "90.10"],
          [1741895270493, "92.49"],
        ],
        pnlHistory: [],
        vlm: "0.0",
      },
    ],
    ["week", { accountValueHistory: [[1741886630493, "80.00"]] }],
  ];

  it("takes the most recent point of the shortest window", () => {
    // 92.49 is the figure the venue's own screen shows, and the number the app
    // used to disagree with by 17 dollars.
    expect(parsePortfolioValue(payload)).toBe(92.49);
  });

  it("falls back to a longer window when the day is empty", () => {
    const noDay = [["day", { accountValueHistory: [] }], ["week", { accountValueHistory: [[1, "77.5"]] }]];
    expect(parsePortfolioValue(noDay)).toBe(77.5);
  });

  it("returns null rather than zero for a shape it doesn't recognise", () => {
    // A zero here would wipe the account's value and look like a real change.
    expect(parsePortfolioValue(null)).toBeNull();
    expect(parsePortfolioValue({})).toBeNull();
    expect(parsePortfolioValue([])).toBeNull();
    expect(parsePortfolioValue([["day", {}]])).toBeNull();
    expect(parsePortfolioValue([["day", { accountValueHistory: [[1, "abc"]] }]])).toBeNull();
  });

  it("keeps a genuine zero balance", () => {
    expect(parsePortfolioValue([["day", { accountValueHistory: [[1, "0.0"]] }]])).toBe(0);
  });
});

describe("the fallback heuristic, for when the endpoint is unreachable", () => {
  it("still recognises the account that exposed the bug", () => {
    // withdrawable 69.46 against a perps pot of 18.03. You cannot withdraw
    // more than a pot holds, so the figure describes something larger.
    expect(looksUnified({ equity: 18.03, withdrawable: 69.46, spotValue: 91.88 })).toBe(true);
  });

  it("leaves a separated account alone", () => {
    expect(looksUnified({ equity: 500, withdrawable: 420, spotValue: 100 })).toBe(false);
  });

  it("is not fooled by an account with nothing open", () => {
    expect(looksUnified({ equity: 250, withdrawable: 250, spotValue: 80 })).toBe(false);
  });

  it("says nothing without a withdrawable figure", () => {
    expect(looksUnified({ equity: 10, withdrawable: null, spotValue: 90 })).toBe(false);
  });
});
