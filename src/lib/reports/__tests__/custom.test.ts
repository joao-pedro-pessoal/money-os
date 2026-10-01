import { describe, expect, it } from "vitest";
import type { SpendingRow } from "@/lib/spending/analyse";
import { buildReport, customKey, netWorthLine, parseCustomKey, reportToCsv, reportWindow } from "../monthly";
import { daysInRange, isDay, monthsBetween, rangeBefore, rangeLabel, shiftDay } from "../periods";

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
  row("2026-01-30", "expense", -40, { categoryName: "Food" }),
  row("2026-02-02", "income", 1000),
  row("2026-02-10", "expense", -100, { categoryName: "Food" }),
  row("2026-03-01", "expense", -300, { categoryName: "Rent", fixed: true }),
  row("2026-03-16", "expense", -50, { categoryName: "Food" }),
  row("2026-03-17", "expense", -999, { categoryName: "Food" }),
];

describe("a range of days", () => {
  it("knows which days exist", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("26-01-01")).toBe(false);
  });

  it("counts both ends, and moves across months and leap days", () => {
    expect(daysInRange("2026-03-01", "2026-03-01")).toBe(1);
    expect(daysInRange("2026-02-01", "2026-03-01")).toBe(29);
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  /** Compared with the range of the same length that ends the day before it begins. */
  it("sits beside the same number of days just before it", () => {
    expect(rangeBefore("2026-03-01", "2026-03-10")).toEqual({ from: "2026-02-19", to: "2026-02-28" });
    expect(rangeBefore("2026-03-05", "2026-03-05")).toEqual({ from: "2026-03-04", to: "2026-03-04" });
  });

  it("reads the way a person writes it", () => {
    expect(rangeLabel("2026-03-03", "2026-03-03")).toBe("3 Mar 2026");
    expect(rangeLabel("2026-03-03", "2026-03-17")).toBe("3–17 Mar 2026");
    expect(rangeLabel("2026-02-28", "2026-03-03")).toBe("28 Feb – 3 Mar 2026");
    expect(rangeLabel("2025-12-29", "2026-01-04")).toBe("29 Dec 2025 – 4 Jan 2026");
  });

  it("lists the months it touches", () => {
    expect(monthsBetween("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-03-01", "2026-03-31")).toEqual(["2026-03"]);
  });

  it("travels in the address as one key, and refuses one that is not a range", () => {
    expect(customKey("2026-03-01", "2026-03-16")).toBe("2026-03-01..2026-03-16");
    expect(parseCustomKey("2026-03-01..2026-03-16")).toEqual({ from: "2026-03-01", to: "2026-03-16" });
    expect(parseCustomKey("2026-03-16..2026-03-01")).toBeNull();
    expect(parseCustomKey("2026-02-30..2026-03-01")).toBeNull();
    expect(parseCustomKey("2026-03")).toBeNull();
    expect(() => reportWindow("custom", "nonsense")).toThrow();
  });
});

describe("a custom report", () => {
  const report = buildReport({ kind: "custom", key: "2026-02-01..2026-03-16", rows, netWorthSeries: [] });

  it("holds exactly the rows inside its two days", () => {
    // In: income 1000, food 100 and 50, rent 300. Out: 30 Jan and 17 Mar.
    expect(report.totals).toMatchObject({ income: 1000, spent: 450, transactions: 4 });
    expect(report.label).toBe("1 Feb – 16 Mar 2026");
    expect(report).toMatchObject({ from: "2026-02-01", to: "2026-03-16" });
  });

  it("is compared with the 44 days before it", () => {
    // 1 Feb – 16 Mar is 44 days; the 44 before are 19 Dec – 31 Jan, holding the 30 Jan expense.
    expect(report.previous).toMatchObject({ key: "2025-12-19..2026-01-31", totals: { spent: 40 } });
  });

  it("breaks into the months it crosses, marking the one it only partly covers", () => {
    expect(report.months?.map((m) => [m.key, m.partial, m.totals?.spent ?? null])).toEqual([
      ["2026-02", false, 100],
      ["2026-03", true, 350],
    ]);
  });

  it("has no month breakdown inside one month, and no budgets of its own", () => {
    const inside = buildReport({ kind: "custom", key: "2026-03-01..2026-03-20", rows, netWorthSeries: [] });
    expect(inside.months).toBeNull();
    expect(inside.budgets).toEqual([]);
  });

  it("gives the same totals as the calendar period covering the same days", () => {
    const month = buildReport({ kind: "month", key: "2026-02", rows, netWorthSeries: [] });
    const range = buildReport({ kind: "custom", key: "2026-02-01..2026-02-28", rows, netWorthSeries: [] });
    expect(range.totals).toEqual(month.totals);
    expect(range.categories.map((c) => [c.name, c.spent])).toEqual(month.categories.map((c) => [c.name, c.spent]));
  });

  it("names its days in the CSV and calls itself custom", () => {
    const lines = reportToCsv(report, "EUR").split("\n");
    expect(lines[0]).toBe("Money OS custom report,1 Feb – 16 Mar 2026");
    expect(lines[1]).toBe("From,2026-02-01,To,2026-03-16");
    expect(lines).toContain("March 2026 (part),0,350,-350");
    expect(lines).toContain("Summary,This period,19 Dec 2025 – 31 Jan 2026");
  });
});

describe("net worth drawn through a period", () => {
  const series = [
    { date: "2026-02-20", netWorth: 900 },
    { date: "2026-03-05", netWorth: 1000 },
    { date: "2026-03-20", netWorth: 1100 },
  ];

  it("opens on the first day at the value it started from", () => {
    expect(netWorthLine(series, { from: "2026-03-01", to: "2026-03-31" })).toEqual([
      { date: "2026-03-01", value: 900 },
      { date: "2026-03-05", value: 1000 },
      { date: "2026-03-20", value: 1100 },
    ]);
  });

  it("draws nothing without a point inside, rather than an old figure as if it were this period's", () => {
    expect(netWorthLine(series, { from: "2026-04-01", to: "2026-04-30" })).toEqual([]);
  });

  it("matches the start and end the report states", () => {
    const report = buildReport({ kind: "month", key: "2026-03", rows, netWorthSeries: series });
    expect(report.netWorth).toEqual({ start: 900, end: 1100, change: 200 });
    expect(report.netWorthLine[0].value).toBe(report.netWorth!.start);
    expect(report.netWorthLine.at(-1)!.value).toBe(report.netWorth!.end);
  });
});
