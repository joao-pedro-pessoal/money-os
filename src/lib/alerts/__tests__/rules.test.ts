import { describe, expect, it } from "vitest";
import {
  budgetAlerts,
  subscriptionAlerts,
  accountAlerts,
  connectionAlerts,
  watchlistAlerts,
  portfolioAlerts,
  sortAlerts,
} from "../rules";

/**
 * The rule that matters most across all of these: silence is the normal state.
 * A panel with something in it every day is a panel nobody opens, so most of
 * these tests are about what does *not* fire.
 */

describe("budgets", () => {
  const budget = (over: Partial<Parameters<typeof budgetAlerts>[0][number]> = {}) => ({
    id: "1",
    category: "Food",
    currency: "EUR",
    spent: 50,
    available: 200,
    progress: 0.5,
    ...over,
  });

  it("says nothing while spending tracks the month", () => {
    expect(budgetAlerts([budget({ spent: 100, progress: 0.5 })])).toEqual([]);
  });

  it("reports going over", () => {
    const [a] = budgetAlerts([budget({ spent: 250, available: 200 })]);
    expect(a.severity).toBe("critical");
    expect(a.title).toContain("over budget");
  });

  it("warns while there is still time to act", () => {
    // Half the month gone, four fifths of the budget spent.
    const [a] = budgetAlerts([budget({ spent: 160, available: 200, progress: 0.5 })]);
    expect(a.severity).toBe("warning");
    expect(a.detail).toContain("50% of the period left");
  });

  it("stays quiet in the first fifth of a period", () => {
    // A single large shop on day two is not evidence of anything, and an alert
    // that fires every month at the same point is one you stop reading.
    expect(budgetAlerts([budget({ spent: 120, available: 200, progress: 0.1 })])).toEqual([]);
  });

  it("does not report a budget of nothing", () => {
    expect(budgetAlerts([budget({ available: 0, spent: 10 })])).toEqual([]);
  });

  it("reports over-budget once, not twice", () => {
    // Being over is also ahead of pace; saying both would be the same news.
    expect(budgetAlerts([budget({ spent: 500, available: 200, progress: 0.5 })])).toHaveLength(1);
  });
});

describe("subscriptions", () => {
  const sub = (daysUntil: number | null) => ({
    id: "1",
    name: "Netflix",
    amount: 12.99,
    currency: "EUR",
    daysUntil,
  });

  it("warns with room to cancel, not on the morning", () => {
    expect(subscriptionAlerts([sub(3)])).toHaveLength(1);
    expect(subscriptionAlerts([sub(0)])[0].title).toContain("charges today");
  });

  it("stays quiet while the charge is far off", () => {
    expect(subscriptionAlerts([sub(4)])).toEqual([]);
    expect(subscriptionAlerts([sub(30)])).toEqual([]);
  });

  it("says nothing about a subscription with no date", () => {
    // Guessing a schedule would be inventing a fact about your money.
    expect(subscriptionAlerts([sub(null)])).toEqual([]);
  });

  it("ignores a date already past", () => {
    expect(subscriptionAlerts([sub(-2)])).toEqual([]);
  });
});

describe("accounts", () => {
  const account = (over: Partial<Parameters<typeof accountAlerts>[0][number]> = {}) => ({
    id: "a1",
    name: "Revolut",
    daysSinceUpdate: 10,
    overAllocated: false,
    ...over,
  });

  it("treats promising more than you hold as critical", () => {
    // Every figure resting on it is wrong until it is fixed.
    const [a] = accountAlerts([account({ overAllocated: true })]);
    expect(a.severity).toBe("critical");
  });

  it("leaves a recently updated balance alone", () => {
    expect(accountAlerts([account({ daysSinceUpdate: 59 })])).toEqual([]);
  });

  it("mentions a balance nobody has confirmed in two months", () => {
    const [a] = accountAlerts([account({ daysSinceUpdate: 60 })]);
    expect(a.severity).toBe("warning");
    expect(a.detail).toContain("net worth");
  });

  it("says nothing about a synced account", () => {
    // Nothing to confirm by hand; the connection rules cover those.
    expect(accountAlerts([account({ daysSinceUpdate: null })])).toEqual([]);
  });
});

describe("connections", () => {
  const conn = (freshness: Parameters<typeof connectionAlerts>[0][number]["freshness"]) => ({
    id: "c1",
    platform: "Bybit",
    freshness,
    lastError: null,
  });

  it("quotes the platform's own error rather than saying 'sync failed'", () => {
    const [a] = connectionAlerts([{ ...conn("ERROR"), lastError: "Unmatched IP" }]);
    expect(a.severity).toBe("critical");
    expect(a.detail).toBe("Unmatched IP");
  });

  it("says nothing about a connection that has never synced", () => {
    // A connection you just created is a normal state, not a problem, and
    // saying otherwise on the setup screen is noise at the worst moment.
    expect(connectionAlerts([conn("NEVER")])).toEqual([]);
  });

  it("leaves a healthy connection alone", () => {
    expect(connectionAlerts([conn("LIVE"), conn("FRESH")])).toEqual([]);
  });
});

describe("watchlist", () => {
  const item = (currentPrice: number | null, targetPrice: number | null) => ({
    id: "w1",
    symbol: "SXR8",
    currentPrice,
    targetPrice,
  });

  it("fires when the price you were waiting for arrives", () => {
    expect(watchlistAlerts([item(95, 100)])).toHaveLength(1);
  });

  it("stays quiet above the target", () => {
    expect(watchlistAlerts([item(105, 100)])).toEqual([]);
  });

  it("says nothing when a price is missing", () => {
    // Treating an absent price as zero would report every target as hit.
    expect(watchlistAlerts([item(null, 100)])).toEqual([]);
    expect(watchlistAlerts([item(95, null)])).toEqual([]);
  });
});

describe("portfolio", () => {
  it("reports holdings left out of the total", () => {
    const [a] = portfolioAlerts({ unpricedCount: 3, untaggedValue: 0, currency: "EUR" });
    expect(a.title).toContain("3 holdings");
    expect(a.detail).toContain("rather than counted as zero");
  });

  it("says nothing when everything is priced and tagged", () => {
    expect(portfolioAlerts({ unpricedCount: 0, untaggedValue: 0, currency: "EUR" })).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts what breaks a number above what merely needs doing", () => {
    const sorted = sortAlerts([
      { id: "1", severity: "info", title: "a", href: "/", kind: "subscription" },
      { id: "2", severity: "critical", title: "b", href: "/", kind: "budget" },
      { id: "3", severity: "warning", title: "c", href: "/", kind: "account" },
    ]);
    expect(sorted.map((a) => a.severity)).toEqual(["critical", "warning", "info"]);
  });
});
