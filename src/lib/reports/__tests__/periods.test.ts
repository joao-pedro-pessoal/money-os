import { describe, expect, it } from "vitest";
import {
  isPeriodKey,
  isoWeek,
  monthsOfYear,
  periodBounds,
  periodLabel,
  periodOf,
  periodsBetween,
  previousPeriod,
} from "../periods";

describe("ISO weeks", () => {
  it("run Monday to Sunday", () => {
    expect(periodOf("week", "2026-09-21")).toBe("2026-W39"); // a Monday
    expect(periodOf("week", "2026-09-27")).toBe("2026-W39"); // the Sunday after
    expect(periodOf("week", "2026-09-28")).toBe("2026-W40");
    expect(periodBounds("week", "2026-W39")).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });

  /** The week belongs to the year its Thursday is in. */
  it("put the last days of December in the next year's first week, and the first of January in the last year's", () => {
    expect(isoWeek("2025-12-29")).toEqual({ year: 2026, week: 1 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(periodBounds("week", "2026-W01")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
  });

  it("have a week 53 only in the years that do", () => {
    expect(isPeriodKey("week", "2026-W53")).toBe(true);
    expect(isPeriodKey("week", "2025-W53")).toBe(false);
    expect(isPeriodKey("week", "2026-W00")).toBe(false);
    expect(isPeriodKey("week", "2026-38")).toBe(false);
  });

  /** Every day of a long stretch falls in exactly the week whose bounds hold it. */
  it("agree with their own bounds on every day for years, across clock changes", () => {
    let time = Date.UTC(2024, 0, 1);
    const end = Date.UTC(2028, 11, 31);
    for (; time <= end; time += 86_400_000) {
      const day = new Date(time).toISOString().slice(0, 10);
      const { from, to } = periodBounds("week", periodOf("week", day));
      expect(from <= day && day <= to).toBe(true);
    }
  });
});

describe("months and years", () => {
  it("have their first and last days", () => {
    expect(periodBounds("month", "2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodBounds("month", "2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds("year", "2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("read from a stored timestamp as well as a day", () => {
    expect(periodOf("month", "2026-09-17T12:00:00.000Z")).toBe("2026-09");
    expect(periodOf("year", "2026-09-17T12:00:00.000Z")).toBe("2026");
    expect(periodOf("week", "2026-09-17T12:00:00.000Z")).toBe("2026-W38");
  });

  it("list a year's twelve months", () => {
    expect(monthsOfYear("2026")).toHaveLength(12);
    expect(monthsOfYear("2026")[0]).toBe("2026-01");
    expect(monthsOfYear("2026")[11]).toBe("2026-12");
  });
});

describe("stepping between periods", () => {
  it("steps back one of each, across the turn of a year", () => {
    expect(previousPeriod("week", "2026-W01")).toBe("2025-W52");
    expect(previousPeriod("week", "2027-W01")).toBe("2026-W53");
    expect(previousPeriod("month", "2026-01")).toBe("2025-12");
    expect(previousPeriod("year", "2026")).toBe("2025");
  });

  it("counts the periods between two, backwards as negative", () => {
    expect(periodsBetween("week", "2026-W39", "2026-W37")).toBe(-2);
    expect(periodsBetween("week", "2025-W52", "2026-W02")).toBe(2);
    expect(periodsBetween("month", "2026-09", "2025-11")).toBe(-10);
    expect(periodsBetween("year", "2026", "2023")).toBe(-3);
  });

  it("sorts keys in time order as text", () => {
    expect(["2026-W09", "2025-W52", "2026-W10"].sort()).toEqual(["2025-W52", "2026-W09", "2026-W10"]);
  });
});

describe("labels", () => {
  it("name a week by its days, a month by name and a year by number", () => {
    expect(periodLabel("week", "2026-W39")).toBe("21–27 Sep 2026");
    expect(periodLabel("week", "2026-W40")).toBe("28 Sep – 4 Oct 2026");
    expect(periodLabel("week", "2026-W01")).toBe("29 Dec 2025 – 4 Jan 2026");
    expect(periodLabel("month", "2026-09")).toBe("September 2026");
    expect(periodLabel("year", "2026")).toBe("2026");
  });
});
