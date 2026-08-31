import { describe, expect, it } from "vitest";
import {
  internalRateOfReturn,
  timeWeightedReturn,
  timeWeightedSeries,
  type ValuePoint,
  returnCoverage,
  asPercent,
  contributionsExplainValue,
  historyLooksLikePerformance,
} from "../returns";

describe("money-weighted return", () => {
  it("finds the rate a spreadsheet's XIRR would", () => {
    // 1000 in, 1100 back a year later: 10%.
    const rate = internalRateOfReturn([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ])!;
    expect(asPercent(rate)).toBeCloseTo(10, 1);
  });

  it("annualises a short period rather than reporting the raw gain", () => {
    // 5% in three months is far more than 5% a year.
    const rate = internalRateOfReturn([
      { date: "2026-01-01", amount: -1000 },
      { date: "2026-04-01", amount: 1050 },
    ])!;
    expect(asPercent(rate)!).toBeGreaterThan(18);
  });

  it("reports a loss as a loss", () => {
    const rate = internalRateOfReturn([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 800 },
    ])!;
    expect(asPercent(rate)).toBeCloseTo(-20, 1);
  });

  it("handles money added part-way through", () => {
    // The case the whole measure exists for: a second deposit late in the year
    // must not be treated as if it had been invested from the start.
    const rate = internalRateOfReturn([
      { date: "2026-01-01", amount: -1000 },
      { date: "2026-10-01", amount: -1000 },
      { date: "2027-01-01", amount: 2100 },
    ])!;
    expect(asPercent(rate)!).toBeGreaterThan(5);
  });

  it("says nothing when money only ever went one way", () => {
    // Deposits with nothing to show yet is not a return of any size.
    expect(
      internalRateOfReturn([
        { date: "2026-01-01", amount: -500 },
        { date: "2026-06-01", amount: -500 },
      ])
    ).toBeNull();
  });

  it("says nothing with a single flow, or none", () => {
    expect(internalRateOfReturn([{ date: "2026-01-01", amount: -500 }])).toBeNull();
    expect(internalRateOfReturn([])).toBeNull();
  });

  it("says nothing when no time has passed", () => {
    // Everything on one day: there is nothing to annualise over.
    expect(
      internalRateOfReturn([
        { date: "2026-01-01", amount: -1000 },
        { date: "2026-01-01", amount: 1100 },
      ])
    ).toBeNull();
  });
});

describe("time-weighted return", () => {
  it("measures growth when nothing was added or taken out", () => {
    const r = timeWeightedReturn(
      [
        { date: "2026-01-01", value: 1000 },
        { date: "2026-12-31", value: 1200 },
      ],
      []
    )!;
    expect(asPercent(r.totalReturn)).toBeCloseTo(20, 1);
  });

  it("ignores a deposit entirely, which is the whole point", () => {
    /**
     * Two portfolios, same performance. One gets 1000 added half way.
     * A profit-over-cost measure would call them different; TWR must not.
     */
    const withoutFlow = timeWeightedReturn(
      [
        { date: "2026-01-01", value: 1000 },
        { date: "2026-06-01", value: 1100 },
        { date: "2026-12-31", value: 1210 },
      ],
      []
    )!;

    const withFlow = timeWeightedReturn(
      [
        { date: "2026-01-01", value: 1000 },
        { date: "2026-06-01", value: 1100 },
        { date: "2026-12-31", value: 2310 },
      ],
      // Negative: money in.
      [{ date: "2026-06-01", amount: -1000 }]
    )!;

    expect(asPercent(withFlow.totalReturn)).toBeCloseTo(
      asPercent(withoutFlow.totalReturn)!,
      1
    );
  });

  it("ignores a withdrawal the same way", () => {
    const r = timeWeightedReturn(
      [
        { date: "2026-01-01", value: 1000 },
        { date: "2026-06-01", value: 1100 },
        { date: "2026-12-31", value: 660 },
      ],
      [{ date: "2026-06-01", amount: 500 }]
    )!;
    // 1000→1100 then 600→660: +10% twice.
    expect(asPercent(r.totalReturn)).toBeCloseTo(21, 0);
  });

  /**
   * The phantom loss. A deposit dated on the final snapshot opened a period
   * with nothing after it, and the trailing leg closed it against the same
   * reading that had just ended the previous one — turning money paid in into
   * a fall of its own size. Daily snapshots make this the ordinary case.
   */
  it("does not read a deposit on the last day as a loss", () => {
    const values = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-12-31", value: 1300 },
    ];

    const quiet = timeWeightedReturn(values, [])!;
    const withDepositToday = timeWeightedReturn(values, [
      { date: "2026-12-31", amount: -500 },
    ])!;

    // Same portfolio, same performance: +30%. The deposit landed at the end
    // and earned nothing, so it must not change the return at all.
    expect(asPercent(quiet.totalReturn)).toBeCloseTo(30, 6);
    expect(asPercent(withDepositToday.totalReturn)).toBeCloseTo(30, 6);
  });

  it("reports the window it actually measured", () => {
    const r = timeWeightedReturn(
      [
        { date: "2026-08-07", value: 700 },
        { date: "2026-08-25", value: 780 },
      ],
      []
    )!;
    expect(r.from).toBe("2026-08-07");
    expect(r.to).toBe("2026-08-25");
  });

  it("refuses to annualise a window under a month", () => {
    // Three good weeks become "+900% a year", which is arithmetic and not
    // information.
    const r = timeWeightedReturn(
      [
        { date: "2026-08-07", value: 700 },
        { date: "2026-08-25", value: 780 },
      ],
      []
    )!;
    expect(r.annualised).toBeNull();
    expect(r.totalReturn).toBeGreaterThan(0);
  });

  it("says nothing with less than two value points", () => {
    // The honest answer to "how have I done" before there is any history.
    expect(timeWeightedReturn([{ date: "2026-01-01", value: 1000 }], [])).toBeNull();
    expect(timeWeightedReturn([], [])).toBeNull();
  });

  it("does not chain around a flow outside the window", () => {
    // A January deposit against a portfolio first valued in August cannot be
    // measured, and must not quietly change the August figure.
    const withOutsideFlow = timeWeightedReturn(
      [
        { date: "2026-08-07", value: 700 },
        { date: "2026-08-25", value: 780 },
      ],
      [{ date: "2026-01-26", amount: -260 }]
    )!;
    const withNone = timeWeightedReturn(
      [
        { date: "2026-08-07", value: 700 },
        { date: "2026-08-25", value: 780 },
      ],
      []
    )!;
    expect(withOutsideFlow.totalReturn).toBeCloseTo(withNone.totalReturn, 6);
  });
});

describe("saying what could not be measured", () => {
  it("counts the flows that happened before any value was recorded", () => {
    // The real situation: nine flows between January and July, snapshots from
    // August. The interface has to be able to say so.
    const coverage = returnCoverage(
      [
        { date: "2026-08-07", value: 700 },
        { date: "2026-08-25", value: 780 },
      ],
      [
        { date: "2026-01-26", amount: -100 },
        { date: "2026-06-22", amount: -160 },
        { date: "2026-08-10", amount: -50 },
      ]
    );

    expect(coverage.flowsBeforeHistory).toBe(2);
    expect(coverage.historyStarts).toBe("2026-08-07");
    expect(coverage.firstFlow).toBe("2026-01-26");
  });

  it("counts every flow as uncovered when there is no history at all", () => {
    const coverage = returnCoverage([], [{ date: "2026-01-26", amount: -100 }]);
    expect(coverage.flowsBeforeHistory).toBe(1);
    expect(coverage.historyStarts).toBeNull();
  });
});

/**
 * Both guards exist because the first real run produced 8091% and an
 * uncomputable IRR. The maths was right; the inputs could not support it.
 */
describe("refusing to answer", () => {
  it("rejects a value history that is the app being filled in", () => {
    // 7 August: nothing recorded yet. 25 August: every account connected.
    // That is not a return, and it read as +8091%.
    expect(
      historyLooksLikePerformance([
        { date: "2026-08-07", value: 8.9 },
        { date: "2026-08-25", value: 729.83 },
      ])
    ).toBe(false);
  });

  it("accepts a history that starts with a real portfolio in it", () => {
    expect(
      historyLooksLikePerformance([
        { date: "2026-08-07", value: 700 },
        { date: "2026-08-25", value: 780 },
      ])
    ).toBe(true);
  });

  it("accepts a portfolio that fell", () => {
    // Losing money is performance too, and the guard must not mistake a
    // drawdown for missing data.
    expect(
      historyLooksLikePerformance([
        { date: "2026-01-01", value: 1000 },
        { date: "2026-06-01", value: 400 },
      ])
    ).toBe(true);
  });

  it("has nothing to judge with one point or none", () => {
    expect(historyLooksLikePerformance([{ date: "2026-08-07", value: 700 }])).toBe(false);
    expect(historyLooksLikePerformance([])).toBe(false);
  });

  it("rejects contributions that cannot explain the portfolio", () => {
    // The real case: 730 € held against a net of −46 € contributed, because
    // only one platform reports its deposits while the value covers them all.
    expect(contributionsExplainValue({ netContributed: -46, currentValue: 729.83 })).toBe(false);
  });

  it("accepts a portfolio smaller than what went into it", () => {
    // Contributing 1000 and holding 600 is a loss, not missing data.
    expect(contributionsExplainValue({ netContributed: 1000, currentValue: 600 })).toBe(true);
  });

  it("has no objection when there is nothing held", () => {
    expect(contributionsExplainValue({ netContributed: 0, currentValue: 0 })).toBe(true);
  });
});

/**
 * The curve and the headline are the same measurement.
 *
 * `timeWeightedSeries` exists so a benchmark can be drawn against something
 * that is a return rather than a bank balance. The moment it disagrees with
 * `timeWeightedReturn` the app has two definitions of one number — the exact
 * failure `lib/accounting/networth.ts` exists to prevent, moved to a new file.
 */
/**
 * How closely the curve's last point may differ from the headline.
 *
 * The curve rounds each point to two decimals because it is drawn, so the
 * agreement is exact only up to that rounding — one hundredth of a percentage
 * point. Asserting more than that is asserting something that isn't true, and
 * a test that demands false precision fails later on data that is perfectly
 * fine. Asserting less would let a real divergence through.
 */
function expectAgreement(curve: ValuePoint[], totalReturn: number, note?: string) {
  const end = curve[curve.length - 1].value;
  expect(Math.abs(end - (1 + totalReturn) * 100), note).toBeLessThanOrEqual(0.01);
}

describe("time-weighted curve", () => {
  it("is rebased to 100 on the first day", () => {
    const curve = timeWeightedSeries(
      [
        { date: "2026-01-01", value: 1000 },
        { date: "2026-12-31", value: 1200 },
      ],
      []
    );
    expect(curve[0]).toEqual({ date: "2026-01-01", value: 100 });
    expect(curve[curve.length - 1].value).toBeCloseTo(120, 1);
  });

  it("ends where timeWeightedReturn says it ends", () => {
    const values = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-06-01", value: 1100 },
      { date: "2026-12-31", value: 2310 },
    ];
    const flows = [{ date: "2026-06-01", amount: -1000 }];

    const summary = timeWeightedReturn(values, flows)!;
    const curve = timeWeightedSeries(values, flows);

    expectAgreement(curve, summary.totalReturn);
  });

  /**
   * The case the two functions could most easily disagree on: a deposit on a
   * day with no snapshot. `valueAt` breaks the period at the previous reading,
   * and the curve has to do the same rather than subtract at the next one.
   */
  it("agrees on a flow that falls between two snapshots", () => {
    const values = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-06-01", value: 1100 },
      { date: "2026-12-31", value: 2310 },
    ];
    const flows = [{ date: "2026-07-15", amount: -1000 }];

    const summary = timeWeightedReturn(values, flows)!;
    const curve = timeWeightedSeries(values, flows);

    expectAgreement(curve, summary.totalReturn);
  });

  /**
   * Hand-written examples only cover the cases you thought of. This walks a
   * range of flow dates, including ones on snapshots and ones between them,
   * and asserts the two never part company.
   */
  it("agrees with the headline across generated flow dates and sizes", () => {
    const values = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-03-01", value: 1080 },
      { date: "2026-06-01", value: 1150 },
      { date: "2026-09-01", value: 1240 },
      { date: "2026-12-31", value: 1300 },
    ];

    const dates = [
      "2026-01-01", "2026-02-14", "2026-03-01", "2026-04-20",
      "2026-06-01", "2026-07-15", "2026-09-01", "2026-11-30", "2026-12-31",
    ];
    const amounts = [-500, -100, -1, 1, 100, 500];

    for (const date of dates) {
      for (const amount of amounts) {
        const flows = [{ date, amount }];
        const summary = timeWeightedReturn(values, flows);
        const curve = timeWeightedSeries(values, flows);
        if (summary === null) continue;

        expectAgreement(curve, summary.totalReturn, `flow ${amount} on ${date}`);
      }
    }
  });

  it("has no curve where there is no return, matching the null above", () => {
    expect(timeWeightedSeries([{ date: "2026-08-07", value: 700 }], [])).toEqual([]);
    expect(timeWeightedReturn([{ date: "2026-08-07", value: 700 }], [])).toBeNull();
  });

  it("draws a point for every reading, so the line has the shape of the history", () => {
    const curve = timeWeightedSeries(
      [
        { date: "2026-01-01", value: 1000 },
        { date: "2026-02-01", value: 900 },
        { date: "2026-03-01", value: 1100 },
      ],
      []
    );
    expect(curve.map((p) => p.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    // A dip has to show as a dip: 900/1000 is 90.
    expect(curve[1].value).toBeCloseTo(90, 6);
  });
});
