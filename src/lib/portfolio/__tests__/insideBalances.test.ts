import { describe, it, expect } from "vitest";
import { marketExposedInsideBalances, portfolioSummary, type PositionItem } from "../positionView";

/**
 * Coins inside an account's equity, and whether net worth calls them invested.
 *
 * Found by the audit on real data: a unified Hyperliquid account keeps HYPE
 * inside its equity, so the Investments page listed 75.76 EUR of it as
 * market-exposed while net worth filed the same coins as capital-guaranteed.
 * The fixtures are shaped on that account.
 */
const item = (over: Partial<PositionItem> & { id: string }): PositionItem => ({
  symbol: over.id,
  side: null,
  accountId: "hyperliquid",
  accountName: "Hyperliquid",
  platform: "hyperliquid",
  assetType: "crypto",
  playlistName: null,
  riskLevel: null,
  timeHorizon: null,
  value: 100,
  notional: over.notional ?? over.value ?? 100,
  leverage: null,
  pnl: 0,
  source: "balance",
  insideBalance: true,
  apr: null,
  ...over,
});

describe("market-exposed coins inside a balance", () => {
  it("counts a volatile coin that is a breakdown of the account's equity", () => {
    const m = marketExposedInsideBalances([item({ id: "HYPE", value: 75.76 })]);
    expect(m.get("hyperliquid")).toBe(75.76);
  });

  it("leaves stablecoins and cash where they are", () => {
    // USDC beside HYPE in the same equity is stable on the Investments page, so
    // reclassifying it would make net worth call a dollar peg market-exposed.
    const m = marketExposedInsideBalances([
      item({ id: "HYPE", value: 75.76 }),
      item({ id: "USDC", value: 64.78, assetType: "stablecoin" }),
      item({ id: "EUR", value: 0.13, assetType: "cash", accountId: "other" }),
    ]);
    expect(m.get("hyperliquid")).toBe(75.76);
    expect(m.has("other")).toBe(false);
  });

  it("ignores a balance that is its own pool, because net worth already adds it", () => {
    // `insideBalance: false` means the coin sits beside the balance and arrives
    // through the synced portfolio. Moving it out of cash as well would take it
    // out of a cash figure it was never in.
    const m = marketExposedInsideBalances([item({ id: "BTC", insideBalance: false })]);
    expect(m.size).toBe(0);
  });

  it("ignores open positions, statements and manual holdings, which have their own route", () => {
    // Open trades are reclassified at their capital at risk and a bank-and-broker
    // account at its declared figure. Counting them here too would move the same
    // money out of cash twice.
    const m = marketExposedInsideBalances([
      item({ id: "XPL", source: "synced" }),
      item({ id: "ETF", source: "statement" }),
      item({ id: "VWCE", source: "manual" }),
    ]);
    expect(m.size).toBe(0);
  });

  it("keeps accounts apart, because the cap that uses this is per account", () => {
    const m = marketExposedInsideBalances([
      item({ id: "HYPE", value: 75.76 }),
      item({ id: "OTHER", value: 8.8, accountId: "other", accountName: "Another exchange" }),
      item({ id: "SECOND", value: 1.24 }),
    ]);
    expect(m.get("hyperliquid")).toBe(77);
    expect(m.get("other")).toBe(8.8);
  });

  it("skips a coin with no account rather than guessing whose balance caps it", () => {
    expect(marketExposedInsideBalances([item({ id: "HYPE", accountId: null })]).size).toBe(0);
  });

  it("agrees with the Investments page about what is market-exposed", () => {
    // The point of reading `hasPnl`: one definition of "moves with the market".
    // Every coin reclassified here is one portfolioSummary counts as floating,
    // including a coin nobody has tagged.
    const coins = [
      item({ id: "HYPE", value: 75.76 }),
      item({ id: "USDC", value: 64.78, assetType: "stablecoin" }),
      item({ id: "UNTAGGED", value: 3, assetType: null }),
    ];
    const reclassified = [...marketExposedInsideBalances(coins).values()].reduce((s, v) => s + v, 0);
    expect(reclassified).toBeCloseTo(portfolioSummary(coins).floating, 2);
  });
});
