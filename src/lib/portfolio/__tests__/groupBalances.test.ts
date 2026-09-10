import { describe, it, expect } from "vitest";
import { groupBalancesByCoin, explainMissingTotal, type BalanceLike } from "../groupBalances";

const bal = (over: Partial<BalanceLike> & { id: string; coin: string }): BalanceLike => ({
  accountName: "Somewhere",
  total: 1,
  available: 1,
  price: 1,
  usdValue: 1,
  currency: "USD",
  ...over,
});

/** The real list: two EUR rows and two USDT rows among seven. */
const LIVE = [
  bal({ id: "1", coin: "EUR", accountName: "Interactive Brokers", total: 1.66, available: 1.66, usdValue: 1.66, currency: "EUR" }),
  bal({ id: "2", coin: "USD", accountName: "Interactive Brokers", total: 10.09, available: 10.09, usdValue: 10.09, currency: "USD" }),
  bal({ id: "3", coin: "USDC", accountName: "Hyperliquid", total: 82.24, available: 50.16, usdValue: 82.24, currency: "USD" }),
  bal({ id: "4", coin: "HYPE", accountName: "Hyperliquid", total: 1.116, available: 1.116, usdValue: 94.56, currency: "USD" }),
  bal({ id: "5", coin: "EUR", accountName: "Trading 212", total: 0.13, available: 0.13, usdValue: 0.13, currency: "EUR" }),
  bal({ id: "6", coin: "USDT", accountName: "MEXC", total: 0.0000000024, available: 0, usdValue: 0, currency: "USD" }),
  bal({ id: "7", coin: "USDT", accountName: "MEXC", total: 36.13, available: 36.13, usdValue: 36.13, currency: "USD" }),
];

describe("one row per coin", () => {
  const groups = groupBalancesByCoin(LIVE);

  it("turns seven rows into five coins", () => {
    expect(groups.map((g) => g.coin)).toEqual(["HYPE", "USDC", "USDT", "USD", "EUR"]);
  });

  it("adds the units, which are always addable", () => {
    const usdt = groups.find((g) => g.coin === "USDT")!;
    expect(usdt.total).toBeCloseTo(36.13, 6);
    expect(usdt.parts).toHaveLength(2);
  });

  it("adds what is available separately from what is held", () => {
    const usdc = groups.find((g) => g.coin === "USDC")!;
    expect(usdc.total).toBe(82.24);
    // 32.08 of it is on hold behind an open trade.
    expect(usdc.available).toBe(50.16);
  });

  it("keeps every account the coin sits in, biggest first", () => {
    const eur = groups.find((g) => g.coin === "EUR")!;
    expect(eur.parts.map((p) => p.accountName)).toEqual(["Interactive Brokers", "Trading 212"]);
    expect(eur.value).toBe(1.79);
  });

  it("ranks by what a group is worth", () => {
    expect(groups[0].coin).toBe("HYPE");
  });
});

/**
 * The recurring bug in this codebase, in miniature. A balance is denominated in
 * itself when it is cash and in the platform's currency when it is a token, so
 * two rows of one coin are not guaranteed to share a currency.
 */
describe("a total nobody can state", () => {
  const mixed = [
    bal({ id: "a", coin: "USDC", accountName: "Hyperliquid", usdValue: 80, currency: "USD" }),
    bal({ id: "b", coin: "USDC", accountName: "Somewhere else", usdValue: 20, currency: "EUR" }),
  ];

  it("refuses to add two currencies rather than producing a number in neither", () => {
    const [group] = groupBalancesByCoin(mixed);
    expect(group.value).toBeNull();
    expect(group.currency).toBeNull();
    expect(group.total).toBe(2); // units still add: a coin is a coin
  });

  it("says why, rather than leaving a blank that reads as broken", () => {
    const [group] = groupBalancesByCoin(mixed);
    expect(explainMissingTotal(group)).toBe(
      "held in EUR and USD, which cannot be added without a rate"
    );
  });

  /** One unpriced part makes the group's worth unknown, not smaller. */
  it("refuses a total when any part could not be priced", () => {
    const [group] = groupBalancesByCoin([
      bal({ id: "a", coin: "XYZ", usdValue: 50 }),
      bal({ id: "b", coin: "XYZ", usdValue: null }),
    ]);
    expect(group.value).toBeNull();
    expect(explainMissingTotal(group)).toContain("unknown rather than lower");
  });

  it("has nothing to explain when the total is there", () => {
    const [group] = groupBalancesByCoin([bal({ id: "a", coin: "USDT", usdValue: 5 })]);
    expect(explainMissingTotal(group)).toBeNull();
  });
});

describe("odds and ends", () => {
  it("treats the same coin in different cases as one", () => {
    const groups = groupBalancesByCoin([
      bal({ id: "a", coin: "usdt", usdValue: 5 }),
      bal({ id: "b", coin: "USDT", usdValue: 5 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].coin).toBe("USDT");
  });

  it("sorts unpriced groups by what is held, so they land somewhere predictable", () => {
    const groups = groupBalancesByCoin([
      bal({ id: "a", coin: "AAA", total: 1, usdValue: null }),
      bal({ id: "b", coin: "BBB", total: 9, usdValue: null }),
    ]);
    expect(groups.map((g) => g.coin)).toEqual(["BBB", "AAA"]);
  });

  it("has nothing to say about nothing", () => {
    expect(groupBalancesByCoin([])).toEqual([]);
  });
});
