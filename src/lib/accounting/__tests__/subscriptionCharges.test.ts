import { describe, expect, it } from "vitest";
import {
  chargeDays,
  likelyMatch,
  pendingCharges,
  type ChargeSubscription,
  type LedgerExpense,
} from "../subscriptionCharges";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("chargeDays", () => {
  it("keeps the anchor's day through a short month", () => {
    expect(chargeDays(day(2026, 1, 31), "monthly", day(2026, 1, 1), day(2026, 4, 30))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("steps weekly and quarterly from the anchor", () => {
    expect(chargeDays(day(2026, 9, 1), "weekly", day(2026, 9, 1), day(2026, 9, 20))).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
    ]);
    expect(chargeDays(day(2026, 1, 15), "quarterly", day(2026, 1, 1), day(2026, 12, 31))).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
  });

  it("includes only days inside the window", () => {
    expect(chargeDays(day(2025, 3, 10), "monthly", day(2026, 9, 1), day(2026, 9, 17))).toEqual(["2026-09-10"]);
    expect(chargeDays(day(2026, 10, 10), "monthly", day(2026, 9, 1), day(2026, 9, 17))).toEqual([]);
  });
});

describe("pendingCharges", () => {
  const netflix: ChargeSubscription = {
    id: "n",
    name: "Netflix",
    amount: 12.99,
    currency: "EUR",
    cadence: "monthly",
    active: true,
    nextChargeAt: day(2026, 1, 5),
    createdAt: day(2026, 1, 1),
  };
  const today = day(2026, 9, 17);

  it("proposes the charges that have arrived within the last month, and none older", () => {
    // 31 days back from 17 September is 17 August, so 5 August is left alone.
    expect(pendingCharges([netflix], new Set(), today)).toEqual([{ subscriptionId: "n", dueOn: "2026-09-05" }]);
    expect(pendingCharges([netflix], new Set(), today, 60)).toEqual([
      { subscriptionId: "n", dueOn: "2026-08-05" },
      { subscriptionId: "n", dueOn: "2026-09-05" },
    ]);
  });

  it("does not propose a charge already answered", () => {
    expect(pendingCharges([netflix], new Set(["n|2026-09-05"]), today)).toEqual([]);
  });

  it("does not propose a charge again after its day was edited", () => {
    // Answered on the 5th, then the date moved to the 7th: the same charge.
    const moved = { ...netflix, nextChargeAt: day(2026, 1, 7) };
    expect(pendingCharges([moved], new Set(["n|2026-09-05"]), today)).toEqual([]);
    // Last month's answer does not hide this month's charge.
    expect(pendingCharges([netflix], new Set(["n|2026-08-05"]), today, 60)).toEqual([
      { subscriptionId: "n", dueOn: "2026-09-05" },
    ]);
  });

  it("proposes nothing for a cancelled subscription, one with no date, or before it existed", () => {
    expect(pendingCharges([{ ...netflix, active: false }], new Set(), today)).toEqual([]);
    expect(pendingCharges([{ ...netflix, nextChargeAt: null }], new Set(), today)).toEqual([]);
    expect(pendingCharges([{ ...netflix, createdAt: day(2026, 9, 10) }], new Set(), today)).toEqual([]);
  });

  it("proposes a charge due today", () => {
    expect(pendingCharges([{ ...netflix, nextChargeAt: day(2026, 9, 17) }], new Set(), today)).toEqual([
      { subscriptionId: "n", dueOn: "2026-09-17" },
    ]);
  });
});

describe("likelyMatch", () => {
  const charge = { name: "Spotify", amount: 10.99, currency: "EUR", accountId: "card", dueOn: "2026-09-10" };
  const expense = (over: Partial<LedgerExpense>): LedgerExpense => ({
    id: "t",
    date: day(2026, 9, 11),
    amount: -10.99,
    currency: "EUR",
    accountId: "card",
    type: "expense",
    description: null,
    merchant: null,
    ...over,
  });

  it("finds an imported expense a day after the due day", () => {
    expect(likelyMatch(charge, [expense({})], new Set())?.id).toBe("t");
  });

  it("prefers the one that names the subscription, then the nearest", () => {
    const ledger = [
      expense({ id: "near", date: day(2026, 9, 10) }),
      expense({ id: "named", date: day(2026, 9, 13), merchant: "SPOTIFY AB" }),
    ];
    expect(likelyMatch(charge, ledger, new Set())?.id).toBe("named");
  });

  it("ignores other currencies, other accounts, far dates, different amounts and claimed rows", () => {
    expect(likelyMatch(charge, [expense({ currency: "USD" })], new Set())).toBeNull();
    expect(likelyMatch(charge, [expense({ accountId: "cash" })], new Set())).toBeNull();
    expect(likelyMatch(charge, [expense({ date: day(2026, 9, 20) })], new Set())).toBeNull();
    expect(likelyMatch(charge, [expense({ amount: -25 })], new Set())).toBeNull();
    expect(likelyMatch(charge, [expense({ type: "income", amount: 10.99 })], new Set())).toBeNull();
    expect(likelyMatch(charge, [expense({})], new Set(["t"]))).toBeNull();
  });

  it("accepts a small price change", () => {
    expect(likelyMatch(charge, [expense({ amount: -11.99 })], new Set())?.id).toBe("t");
  });

  it("looks on any account when the subscription names none", () => {
    expect(likelyMatch({ ...charge, accountId: null }, [expense({ accountId: "cash" })], new Set())?.id).toBe("t");
  });
});
