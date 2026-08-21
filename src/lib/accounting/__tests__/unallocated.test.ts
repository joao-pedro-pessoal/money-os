import { describe, it, expect } from "vitest";
import { unallocatedCash, explainFree, splitPortfolioCash } from "../unallocated";

describe("what free actually means", () => {
  it("is the balance when nothing is committed", () => {
    const v = unallocatedCash({ availableOnPlatform: 500, allocatedToBuckets: 0 });
    expect(v.free).toBe(500);
  });

  it("subtracts money assigned to buckets", () => {
    // The gap this closes: on a connected account, bucket allocations were
    // skipped entirely, so an emergency fund sitting on an exchange read as
    // free money and invited you to spend it twice.
    const v = unallocatedCash({ availableOnPlatform: 500, allocatedToBuckets: 300 });
    expect(v.free).toBe(200);
    expect(v.reservedForBuckets).toBe(300);
  });

  it("counts a separate pool as spendable but names it", () => {
    // Hyperliquid's spot USDC: unencumbered, but it has to be moved before it
    // can back a trade, so it isn't the same thing as free margin.
    const v = unallocatedCash({
      availableOnPlatform: 0,
      separatePool: 97.43,
      allocatedToBuckets: 0,
      marginUsed: 24.01,
    });
    expect(v.free).toBe(97.43);
    expect(v.inSeparatePool).toBe(97.43);
    expect(v.lockedAsMargin).toBe(24.01);
  });

  it("does not subtract margin twice", () => {
    // availableOnPlatform already has margin deducted; marginUsed is carried
    // only so the figure can explain itself.
    const v = unallocatedCash({
      availableOnPlatform: 76,
      allocatedToBuckets: 0,
      marginUsed: 24,
    });
    expect(v.free).toBe(76);
  });

  it("reports over-allocation instead of clamping it to zero", () => {
    // A goal funded by money that isn't there is a real problem, and rounding
    // it up to zero hides it.
    const v = unallocatedCash({ availableOnPlatform: 100, allocatedToBuckets: 250 });
    expect(v.free).toBe(-150);
    expect(v.overAllocated).toBe(true);
  });

  it("never claims more is reserved than the account can spend", () => {
    const v = unallocatedCash({ availableOnPlatform: 100, allocatedToBuckets: 250 });
    expect(v.reservedForBuckets).toBe(100);
  });

  it("handles an empty account without going negative on the reservation", () => {
    const v = unallocatedCash({ availableOnPlatform: 0, allocatedToBuckets: 50 });
    expect(v.reservedForBuckets).toBe(0);
    expect(v.free).toBe(-50);
  });

  it("is not fooled by floating point", () => {
    const v = unallocatedCash({ availableOnPlatform: 0.3, allocatedToBuckets: 0.1 });
    expect(v.free).toBe(0.2);
    expect(v.overAllocated).toBe(false);
  });
});

describe("splitting free cash from investing cash", () => {
  it("keeps the whole amount spendable when the share is zero", () => {
    const s = splitPortfolioCash(500, 0);
    expect(s.spendable).toBe(500);
    expect(s.belongsToPortfolio).toBe(0);
  });

  it("removes the whole amount when it is all investing money", () => {
    // Cash in a broker waiting to buy something isn't money you can live on,
    // and the dashboard figure is exactly what people check before spending.
    const s = splitPortfolioCash(97.43, 100);
    expect(s.spendable).toBe(0);
    expect(s.belongsToPortfolio).toBe(97.43);
  });

  it("splits a mixed account", () => {
    const s = splitPortfolioCash(200, 25);
    expect(s.belongsToPortfolio).toBe(50);
    expect(s.spendable).toBe(150);
  });

  it("treats an unset share as spendable, and says it is unset", () => {
    // The app must not quietly decide that your money is earmarked.
    const s = splitPortfolioCash(300, null);
    expect(s.spendable).toBe(300);
    expect(s.unset).toBe(true);
  });

  it("clamps a nonsense percentage instead of inverting the figure", () => {
    expect(splitPortfolioCash(100, 150).belongsToPortfolio).toBe(100);
    expect(splitPortfolioCash(100, -20).belongsToPortfolio).toBe(0);
  });

  it("does not apportion a shortfall", () => {
    // Negative free means the buckets promise more than exists. Splitting that
    // across two labels would bury the problem in both of them.
    const s = splitPortfolioCash(-40, 50);
    expect(s.belongsToPortfolio).toBe(0);
    expect(s.spendable).toBe(-40);
  });
});

describe("explaining the figure", () => {
  it("lists only what applies", () => {
    const plain = unallocatedCash({ availableOnPlatform: 500, allocatedToBuckets: 0 });
    expect(explainFree(plain, "EUR")).toEqual([]);
  });

  it("names margin, buckets and the separate pool", () => {
    const v = unallocatedCash({
      availableOnPlatform: 10,
      separatePool: 97.43,
      allocatedToBuckets: 50,
      marginUsed: 24.01,
    });
    const said = explainFree(v, "USD").join(" | ");
    expect(said).toMatch(/backing open trades/);
    expect(said).toMatch(/assigned to buckets/);
    expect(said).toMatch(/separate pool/);
  });

  it("says so when buckets promise too much", () => {
    const v = unallocatedCash({ availableOnPlatform: 10, allocatedToBuckets: 90 });
    expect(explainFree(v, "EUR").join(" ")).toMatch(/promise more/);
  });
});
