import { describe, it, expect } from "vitest";
import { mergeNetWorthSeries } from "../composition";

describe("merging the net worth line", () => {
  it("carries each side forward between readings", () => {
    // Balances are recorded on the days they change, not every day. A gap is
    // not a drop to zero.
    const merged = mergeNetWorthSeries(
      [
        { date: "2026-08-01", netWorth: 100 },
        { date: "2026-08-05", netWorth: 120 },
      ],
      [{ date: "2026-08-03", portfolioValue: 50 }]
    );

    expect(merged).toEqual([
      { date: "2026-08-01", netWorth: 100, cash: 100, portfolio: 0, approximate: false },
      { date: "2026-08-03", netWorth: 150, cash: 100, portfolio: 50, approximate: false },
      { date: "2026-08-05", netWorth: 170, cash: 120, portfolio: 50, approximate: false },
    ]);
  });

  it("treats a date before either side started as nothing, not as the first value", () => {
    const merged = mergeNetWorthSeries(
      [{ date: "2026-08-05", netWorth: 100 }],
      [{ date: "2026-08-01", portfolioValue: 40 }]
    );

    expect(merged[0]).toMatchObject({ date: "2026-08-01", cash: 0, portfolio: 40, netWorth: 40 });
  });

  it("does not depend on the order the points arrive in", () => {
    const shuffled = mergeNetWorthSeries(
      [
        { date: "2026-08-05", netWorth: 120 },
        { date: "2026-08-01", netWorth: 100 },
      ],
      [{ date: "2026-08-03", portfolioValue: 50 }]
    );

    expect(shuffled.map((p) => p.netWorth)).toEqual([100, 150, 170]);
  });

  it("keeps the approximate flag from the cash side", () => {
    const merged = mergeNetWorthSeries(
      [{ date: "2026-08-01", netWorth: 100, approximate: true }],
      []
    );

    expect(merged[0].approximate).toBe(true);
  });

  it("handles both sides being empty", () => {
    expect(mergeNetWorthSeries([], [])).toEqual([]);
  });

  /**
   * The bug this function was extracted to prevent.
   *
   * A broker account whose balance already contains its ETFs was being added to
   * a portfolio series containing the same ETFs. Every number involved was
   * individually correct; the total was nearly triple.
   */
  describe("the double count it must not be given", () => {
    it("adds exactly what it is handed, which is why the caller must hand it only the surplus", () => {
      // 451.41 of Trade Republic, of which 450.83 is ETFs. If the ETFs are
      // passed in as portfolio, the line reads 902.24 for an account holding
      // 451.41 — the shape of the bug, reproduced deliberately.
      const wrong = mergeNetWorthSeries(
        [{ date: "2026-08-19", netWorth: 451.41 }],
        [{ date: "2026-08-19", portfolioValue: 450.83 }]
      );
      expect(wrong[0].netWorth).toBe(902.24);

      // Passed correctly — nothing sits outside the balance — the line is the
      // account.
      const right = mergeNetWorthSeries([{ date: "2026-08-19", netWorth: 451.41 }], []);
      expect(right[0].netWorth).toBe(451.41);
    });

    it("adds a holding that genuinely sits outside any balance", () => {
      // The legitimate case, and the reason the parameter isn't simply zero:
      // gold in a drawer, or a manual holding on a cash-only account.
      const merged = mergeNetWorthSeries(
        [{ date: "2026-08-19", netWorth: 200 }],
        [{ date: "2026-08-19", portfolioValue: 1000 }]
      );

      expect(merged[0].netWorth).toBe(1200);
    });
  });

  it("rounds to the cent rather than trailing floating point", () => {
    const merged = mergeNetWorthSeries(
      [{ date: "2026-08-19", netWorth: 0.1 }],
      [{ date: "2026-08-19", portfolioValue: 0.2 }]
    );

    expect(merged[0].netWorth).toBe(0.3);
  });
});
