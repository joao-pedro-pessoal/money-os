import { describe, expect, it } from "vitest";
import type { SpendingRow } from "@/lib/spending/analyse";
import {
  buildMonthlyReport,
  buildReport,
  monthLabel,
  netWorthChange,
  previousMonth,
  reportMonths,
  reportPeriods,
  reportToCsv,
} from "../monthly";

function row(date: string, type: string, amount: number, extra: Partial<SpendingRow> = {}): SpendingRow {
  return {
    date: `${date}T12:00:00.000Z`,
    type,
    amount,
    categoryName: null,
    subcategoryName: null,
    accountName: "Cash",
    merchant: null,
    fixed: false,
    ...extra,
  };
}

const rows: SpendingRow[] = [
  row("2026-09-01", "income", 2000),
  row("2026-09-03", "expense", -600, { categoryName: "Rent", fixed: true }),
  row("2026-09-10", "expense", -150, { categoryName: "Food", merchant: "Market" }),
  row("2026-09-12", "expense", -50),
  row("2026-09-15", "transfer", -500),
  row("2026-09-20", "investment_contribution", -300),
  row("2026-08-01", "income", 1800),
  row("2026-08-03", "expense", -600, { categoryName: "Rent", fixed: true }),
  row("2026-08-09", "expense", -100, { categoryName: "Food" }),
  row("2026-06-09", "expense", -200, { categoryName: "Food" }),
];

describe("months", () => {
  it("steps back across a year", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });

  it("names a month in English, whatever the time zone", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
  });

  it("offers every month with a movement, newest first", () => {
    expect(reportMonths(rows)).toEqual(["2026-09", "2026-08", "2026-06"]);
  });
});

describe("buildMonthlyReport", () => {
  const report = buildMonthlyReport({ rows, month: "2026-09", netWorthSeries: [] });

  it("counts income and spending, never transfers or investing, as spending", () => {
    expect(report.totals.income).toBe(2000);
    expect(report.totals.spent).toBe(800);
    expect(report.totals.net).toBe(1200);
    expect(report.invested).toBe(300);
  });

  it("gives the savings rate on income, and none in a month without income", () => {
    expect(report.savingsRate).toBe(60);
    const noIncome = buildMonthlyReport({ rows, month: "2026-06", netWorthSeries: [] });
    expect(noIncome.savingsRate).toBeNull();
  });

  it("compares each category with the month before, and does not invent a change from nothing", () => {
    const food = report.categories.find((c) => c.name === "Food")!;
    expect(food).toMatchObject({ spent: 150, previous: 100, changePercent: 50 });
    const uncategorised = report.categories.find((c) => c.name === "Uncategorised")!;
    expect(uncategorised.changePercent).toBeNull();
  });

  it("averages only earlier months that have spending", () => {
    // August (700) and June (200); July has nothing and is not a zero.
    expect(report.averageSpent).toEqual({ amount: 450, periods: 2 });
  });

  it("lists the largest expenses first", () => {
    expect(report.topExpenses.map((e) => e.amount)).toEqual([600, 150, 50]);
    expect(report.topExpenses[1].name).toBe("Market");
  });

  it("splits fixed from variable", () => {
    expect(report.split).toMatchObject({ fixed: 600, variable: 200 });
  });

  it("has no previous month to compare with when the month before is empty", () => {
    expect(buildMonthlyReport({ rows, month: "2026-06", netWorthSeries: [] }).previous).toBeNull();
  });
});

describe("netWorthChange", () => {
  const series = [
    { date: "2026-08-20", netWorth: 1000 },
    { date: "2026-09-05", netWorth: 1100 },
    { date: "2026-09-28", netWorth: 1250 },
  ];

  it("starts from the last figure before the month and ends on its last one", () => {
    expect(netWorthChange(series, "2026-09")).toEqual({ start: 1000, end: 1250, change: 250 });
  });

  it("reports nothing for a month without a figure inside it", () => {
    expect(netWorthChange(series, "2026-10")).toBeNull();
  });
});

describe("reportToCsv", () => {
  it("quotes a field with a comma so it stays one column", () => {
    const withComma = buildMonthlyReport({
      rows: [row("2026-09-02", "expense", -10, { merchant: "Bread, milk" })],
      month: "2026-09",
      netWorthSeries: [],
    });
    const csv = reportToCsv(withComma, "EUR");
    expect(csv).toContain('"Bread, milk",2026-09-02');
    expect(csv.split("\n")[0]).toBe("Money OS monthly report,September 2026");
  });
});

describe("the same report for a week and for a year", () => {
  it("reads a week Monday to Sunday, against the week before", () => {
    // 7–13 September: Food 150 on the 10th and 50 uncategorised on the 12th.
    const week = buildReport({ kind: "week", key: "2026-W37", rows, netWorthSeries: [] });
    expect(week.label).toBe("7–13 Sep 2026");
    expect(week.totals.spent).toBe(200);
    // 31 August – 6 September: the rent on the 3rd.
    expect(week.previous).toMatchObject({ key: "2026-W36", totals: { spent: 600, income: 2000 } });
    expect(week.months).toBeNull();
  });

  it("reads a year with each month, and no row of zeros for a month with nothing", () => {
    const year = buildReport({ kind: "year", key: "2026", rows, netWorthSeries: [] });
    expect(year.totals).toMatchObject({ income: 3800, spent: 1700 });
    expect(year.months).toHaveLength(12);
    expect(year.months?.[0].totals).toBeNull();
    expect(year.months?.[6].totals).toBeNull(); // July
    expect(year.months?.[5].totals?.spent).toBe(200); // June
    expect(year.months?.[8].totals).toMatchObject({ income: 2000, spent: 800 }); // September
    expect(year.previous).toBeNull();
  });

  it("names itself in the CSV and gives a year's months their own section", () => {
    const csv = reportToCsv(buildReport({ kind: "year", key: "2026", rows, netWorthSeries: [] }), "EUR");
    expect(csv.split("\n")[0]).toBe("Money OS annual report,2026");
    expect(csv).toContain("Month,Income,Spent,Net");
    expect(csv).toContain("July 2026,,,");
    expect(reportToCsv(buildReport({ kind: "week", key: "2026-W37", rows, netWorthSeries: [] }), "EUR").split("\n")[0])
      .toBe("Money OS weekly report,7–13 Sep 2026");
  });

  it("offers every week or year with a movement, newest first", () => {
    expect(reportPeriods(rows, "year")).toEqual(["2026"]);
    expect(reportPeriods(rows, "week")[0]).toBe("2026-W38");
  });

  it("takes net worth over the period asked for", () => {
    const series = [
      { date: "2025-12-20", netWorth: 900 },
      { date: "2026-03-01", netWorth: 1000 },
      { date: "2026-11-30", netWorth: 1400 },
    ];
    expect(netWorthChange(series, "2026", "year")).toEqual({ start: 900, end: 1400, change: 500 });
  });
});
