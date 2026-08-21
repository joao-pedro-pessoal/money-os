import { describe, it, expect } from "vitest";
import { isStableAsset, isCapitalStable, classifyCoin } from "../tags";

/**
 * Which money the market can move.
 *
 * The answer decides what appears in parentheses on the dashboard as "not
 * guaranteed", so getting it wrong overstates or understates risk on the page
 * people check first.
 */
describe("capital-stable, by tag before ticker", () => {
  it("takes the user's word over the symbol", () => {
    // The bug: the Positions page lets you tag a balance, that tag was read for
    // open trades and ignored for balances, and correcting a misclassified coin
    // did nothing at all.
    expect(isStableAsset("WHATEVER", "stablecoin")).toBe(true);
    expect(isStableAsset("WHATEVER", "cash")).toBe(true);
    expect(isStableAsset("USDC", "crypto")).toBe(false);
  });

  it("falls back to the ticker when nothing was said", () => {
    expect(isStableAsset("USDC", null)).toBe(true);
    expect(isStableAsset("EUR", null)).toBe(true);
    expect(isStableAsset("BTC", null)).toBe(false);
    expect(isStableAsset(null, null)).toBe(false);
  });

  it("recognises fiat and stablecoins alike for the split", () => {
    // They are different things — a stablecoin is an issuer's promise, euros in
    // a bank are not — but neither moves with the market, which is the only
    // question the accounting asks here.
    expect(isCapitalStable("EUR")).toBe(true);
    expect(isCapitalStable("USDC")).toBe(true);
    expect(isCapitalStable("ETH")).toBe(false);
  });

  it("keeps naming them apart even though they behave alike", () => {
    expect(classifyCoin("EUR")).toBe("cash");
    expect(classifyCoin("USDC")).toBe("stablecoin");
    expect(classifyCoin("BTC")).toBeNull();
  });

  it("is case and whitespace insensitive, as tickers arrive", () => {
    expect(isStableAsset(" usdc ", null)).toBe(true);
    expect(isStableAsset("eur", null)).toBe(true);
  });

  it("treats a coin it has never heard of as market-exposed", () => {
    // The safe default: claiming an unknown token is stable would report money
    // as guaranteed when it isn't. The tag exists to correct this.
    expect(isStableAsset("NEWSTABLE99", null)).toBe(false);
    expect(isStableAsset("NEWSTABLE99", "stablecoin")).toBe(true);
  });
});
