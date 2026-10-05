import { describe, expect, it } from "vitest";
import { buildInvestmentReport, investmentCsvLines, type InvestmentReportInput } from "../investments";
import { timeWeightedReturn } from "@/lib/portfolio/returns";
import type { TradeRow } from "@/lib/trading/stats";

function trade(date: string, type: string, amount: number, extra: Partial<TradeRow> = {}): TradeRow {
  return {
    date: `${date}T10:00:00.000Z`,
    type,
    symbol: "VWCE",
    quantity: 1,
    amount,
    fees: null,
    realizedPnl: null,
    description: null,
    ...extra,
  };
}

/** A portfolio valued daily through March, with one deposit of 500 on the 10th. */
function input(overrides: Partial<InvestmentReportInput> = {}): InvestmentReportInput {
  const values = [];
  for (let d = 20; d <= 28; d++) values.push({ date: `2026-02-${d}`, value: 1000 });
  for (let d = 1; d <= 31; d++) {
    const day = String(d).padStart(2, "0");
    // Up 1% by the 10th, valued that day before the 500 arrives; flat afterwards.
    values.push({ date: `2026-03-${day}`, value: d <= 10 ? 1000 + d : 1510 });
  }
  return {
    from: "2026-03-01",
    to: "2026-03-31",
    today: "2026-04-15",
    values,
    flows: [
      { date: "2026-01-15", amount: -1000 },
      { date: "2026-03-10", amount: -500 },
    ],
    moneyWeightedWithheld: null,
    trades: [
      trade("2026-02-15", "BUY", -400),
      trade("2026-03-10", "BUY", -500, { fees: 1 }),
      trade("2026-03-20", "SELL", 120, { realizedPnl: 20, fees: 0.5 }),
      // A currency conversion is not a trade, here as on the Trade history page.
      trade("2026-03-21", "BUY", -50, { symbol: "EUR.USD" }),
    ],
    income: [
      { date: "2026-03-05", kind: "dividend", instrument: "VWCE", amount: 3 },
      { date: "2026-03-31", kind: "interest", instrument: "Broker", amount: 0.4 },
      { date: "2026-04-01", kind: "dividend", instrument: "VWCE", amount: 9 },
    ],
    benchmark: null,
    holdings: null,
    ...overrides,
  };
}

describe("the investing side of a period", () => {
  const report = buildInvestmentReport(input());

  it("reads the value at both ends the way net worth is read", () => {
    expect(report.value).toEqual({ start: 1000, end: 1510, change: 510, startDate: "2026-02-28", endDate: "2026-03-31" });
    expect(report.valueLine[0]).toEqual({ date: "2026-03-01", value: 1001 });
  });

  it("separates the money paid in from what the value did beyond it", () => {
    expect(report.flows).toEqual({ deposited: 500, withdrawn: 0, net: 500, count: 1, complete: true });
    expect(report.unexplained).toBe(10);
    expect(report.unexplainedWithheld).toBeNull();
  });

  it("does not split the change by deposits when the deposit record is known to be incomplete", () => {
    const incomplete = buildInvestmentReport(input({ moneyWeightedWithheld: "Deposits are incomplete." }));
    expect(incomplete.flows.complete).toBe(false);
    expect(incomplete.unexplained).toBeNull();
    expect(incomplete.unexplainedWithheld).toMatch(/Not every platform/);
    // The deposits that were recorded are still shown.
    expect(incomplete.flows.deposited).toBe(500);
  });

  it("reads the change beyond deposits between the same two valuations as the change", () => {
    // Last valued on 10 Feb; 300 paid in and invested on 25 Feb; the March report.
    const report = buildInvestmentReport(
      input({
        values: [
          { date: "2026-02-10", value: 1000 },
          { date: "2026-03-15", value: 1330 },
          { date: "2026-03-31", value: 1340 },
        ],
        flows: [
          { date: "2026-01-15", amount: -1000 },
          { date: "2026-02-25", amount: -300 },
        ],
      })
    );
    expect(report.value).toMatchObject({ start: 1000, end: 1340, startDate: "2026-02-10", endDate: "2026-03-31" });
    // The 300 is not in the period's deposits, and not a gain either.
    expect(report.flows.deposited).toBe(0);
    expect(report.unexplained).toBe(40);
  });

  it("treats a deposit on the last valued day the way the time-weighted return does: not yet in that value", () => {
    // Up 1% to 31 March, valued that morning; 500 arrives the same day.
    const values = [
      { date: "2026-02-28", value: 1000 },
      { date: "2026-03-31", value: 1010 },
    ];
    const lastDay = buildInvestmentReport(
      input({ values, flows: [{ date: "2026-01-15", amount: -1000 }, { date: "2026-03-31", amount: -500 }] })
    );
    expect(lastDay.returns.moneyWeighted).toBeCloseTo(0.01, 3);
    expect(lastDay.returns.timeWeighted?.total).toBeCloseTo(0.01, 10);
    expect(lastDay.unexplained).toBe(10);

    // A deposit on the opening day happened after that valuation, so it is money in.
    const firstDay = buildInvestmentReport(
      input({
        values: [
          { date: "2026-02-28", value: 1000 },
          { date: "2026-03-31", value: 1515 },
        ],
        flows: [{ date: "2026-01-15", amount: -1000 }, { date: "2026-02-28", amount: -500 }],
      })
    );
    expect(firstDay.returns.moneyWeighted).toBeCloseTo(0.01, 3);
    expect(firstDay.unexplained).toBe(15);
  });

  it("counts trades by the Trade history page's rules", () => {
    expect(report.trades).toMatchObject({ bought: 500, buys: 1, sold: 120, sells: 1, realised: 20, closed: 1, fees: 1.5, net: 18.5 });
  });

  it("takes only the dividends and interest paid inside the period", () => {
    expect(report.income).toMatchObject({ dividends: 3, interest: 0.4, total: 3.4, payments: 2 });
    expect(report.income.byInstrument).toEqual([{ name: "VWCE", amount: 3, payments: 1 }]);
  });

  it("measures the time-weighted return over the period alone, from the valuation just before it", () => {
    const twr = report.returns.timeWeighted!;
    expect(twr.from).toBe("2026-02-28");
    expect(twr.to).toBe("2026-03-31");
    // The same function the Investments page calls, over the same valuations.
    const direct = timeWeightedReturn(
      input().values.filter((v) => v.date >= "2026-02-28"),
      [...input().flows]
    )!;
    expect(twr.total).toBeCloseTo(direct.totalReturn, 10);
    expect(twr.total).toBeGreaterThan(0.009);
    expect(twr.total).toBeLessThan(0.011);
    expect(report.returns.curve[0]).toEqual({ date: "2026-02-28", value: 100 });
  });

  it("states a money-weighted return for the period, not a yearly one", () => {
    expect(report.returns.moneyWeighted).not.toBeNull();
    expect(report.returns.moneyWeighted!).toBeGreaterThan(0);
    expect(report.returns.moneyWeighted!).toBeLessThan(0.02);
  });

  it("keeps the portfolio's own reason when no money-weighted return can be stated at all", () => {
    const withheld = buildInvestmentReport(input({ moneyWeightedWithheld: "Deposits are incomplete." }));
    expect(withheld.returns.moneyWeighted).toBeNull();
    expect(withheld.returns.moneyWeightedWithheld).toBe("Deposits are incomplete.");
  });

  it("refuses a return while the history is still being filled in", () => {
    const filling = buildInvestmentReport(
      input({
        values: [
          { date: "2026-03-01", value: 10 },
          { date: "2026-03-05", value: 400 },
          { date: "2026-03-20", value: 1000 },
        ],
      })
    );
    expect(filling.returns.timeWeighted).toBeNull();
    expect(filling.returns.timeWeightedWithheld).toMatch(/filled in/);
  });

  it("does not open a return on a valuation weeks before the period", () => {
    const sparse = buildInvestmentReport(
      input({
        values: [
          { date: "2026-01-02", value: 500 },
          { date: "2026-03-15", value: 1000 },
          { date: "2026-03-30", value: 1010 },
        ],
      })
    );
    expect(sparse.returns.timeWeighted?.from).toBe("2026-03-15");
    // The value change still starts from the last value known before the period.
    expect(sparse.value?.start).toBe(500);
  });

  it("compares with the index over exactly the days the return measured", () => {
    const points = [];
    for (let d = 1; d <= 31; d++) points.push({ date: `2026-03-${String(d).padStart(2, "0")}`, close: 100 + d });
    points.unshift({ date: "2026-02-28", close: 100 });
    const compared = buildInvestmentReport(
      input({ benchmark: { name: "World", currency: "EUR", expectedCurrency: "EUR", points } })
    );
    expect(compared.benchmark).toMatchObject({ name: "World", from: "2026-02-28", to: "2026-03-31" });
    if (compared.benchmark === null || !("indexReturn" in compared.benchmark)) throw new Error("no comparison");
    expect(compared.benchmark.indexReturn).toBeCloseTo(0.31, 10);
  });

  it("says why there is no comparison instead of drawing one", () => {
    const refused = buildInvestmentReport(
      input({ benchmark: { name: "World", currency: "USD", expectedCurrency: "EUR", points: [] } })
    );
    expect(refused.benchmark).toMatchObject({ name: "World", unavailable: expect.stringMatching(/currency/) });
  });

  it("shows today's positions, with their gains, for a period that reaches today", () => {
    const holdings = {
      held: 1510,
      unrealised: 60,
      costUnknown: 0,
      items: [
        { name: "VWCE", account: "Broker", assetType: "etf", value: 1200, pnl: 60 },
        { name: "BTC", account: "Exchange", assetType: "crypto", value: 300, pnl: null },
        { name: "EUR", account: "Broker", assetType: null, value: 10, pnl: null },
      ],
    };
    const now = buildInvestmentReport(input({ holdings, today: "2026-03-31" }));
    expect(now.composition).toMatchObject({ asOf: "2026-03-31", today: true, held: 1510, unrealised: 60 });
    // Named as the Investments page names them when it groups by asset type.
    expect(now.composition?.byType.map((t) => [t.name, t.value])).toEqual([
      ["ETF", 1200],
      ["Crypto", 300],
      ["Untagged", 10],
    ]);
    expect(now.composition?.largest[1]).toMatchObject({ name: "BTC", pnl: null });
    expect(now.compositionNote).toBeNull();
    // Today's positions are not what was held at the end of a period that closed earlier.
    expect(buildInvestmentReport(input({ holdings })).composition).toBeNull();
  });

  it("shows what was held on the last day of a period that has closed, with no gain stated", () => {
    const heldAtEnd = [
      { name: "VWCE", account: "Broker", assetType: "etf", value: 1210, pnl: null },
      { name: "BTC", account: "Exchange", assetType: "crypto", value: 300, pnl: null },
    ];
    const past = buildInvestmentReport(input({ heldAtEnd }));
    expect(past.composition).toMatchObject({ asOf: "2026-03-31", today: false, held: 1510, unrealised: null });
    // It adds up to the value the report states for the end.
    expect(past.composition?.held).toBe(past.value?.end);
    expect(past.composition?.largest.map((p) => p.percent)).toEqual([80.13, 19.87]);
    expect(past.compositionNote).toMatch(/today's exchange rates/);
    expect(buildInvestmentReport(input({ heldAtEnd: [] })).compositionNote).toBe("Nothing was held on 2026-03-31.");
  });

  it("knows when nothing happened", () => {
    const empty = buildInvestmentReport(input({ values: [], flows: [], trades: [], income: [] }));
    expect(empty.hasAnything).toBe(false);
    expect(empty.value).toBeNull();
    expect(empty.unexplained).toBeNull();
    expect(empty.returns.timeWeightedWithheld).toMatch(/fewer than two/);
  });

  it("puts the same figures in the CSV", () => {
    const lines = investmentCsvLines(report);
    expect(lines).toContainEqual(["Value change", 510]);
    expect(lines).toContainEqual(["Deposited", 500]);
    expect(lines).toContainEqual(["Dividends", 3]);
    expect(lines).toContainEqual(["Realised from trades", 20]);
  });
});
