import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountConnections, investmentActivities } from "@/db/schema";

const fake = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>() }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: (table: unknown) => {
    const rows = Promise.resolve(fake.rows.get(table) ?? []);
    return Object.assign(rows, { orderBy: () => rows });
  } }) },
}));
vi.mock("../session", () => ({ hasSession: async () => true }));
vi.mock("../dashboard", () => ({ getPortfolioItems: async () => ({ items: [] }) }));
vi.mock("../fx", () => ({ getRates: async () => [] }));
vi.mock("../settings", () => ({ getBaseCurrency: async () => "EUR" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getRealisedTrades } from "../investmentActivity";

const activity = (id: string, currency: string, type = "SELL") => ({
  id, accountId: "account", connectionId: null, date: new Date("2026-09-01T12:00:00Z"),
  type, symbol: "TEST", quantity: "1", amount: "20", fees: null,
  realizedPnl: "5", currency, description: null, brokerOpenedAt: null,
});

describe("the realised total carries what exchange rates left out", () => {
  beforeEach(() => fake.rows.clear());

  it("reports a missing trade currency alongside the known result", async () => {
    fake.rows.set(investmentActivities, [activity("known", "EUR"), activity("missing", "XYZ")]);
    expect(await getRealisedTrades()).toMatchObject({ total: 5, known: true, unconverted: 1 });
  });

  it("does not claim that nothing was omitted when every trade lacks a rate", async () => {
    fake.rows.set(investmentActivities, [activity("missing", "XYZ")]);
    expect(await getRealisedTrades()).toMatchObject({ known: false, unconverted: 1 });
  });

  it("does not count a dividend or FX conversion as a missing instrument trade", async () => {
    fake.rows.set(investmentActivities, [
      activity("income", "XYZ", "DIVIDEND"),
      { ...activity("conversion", "XYZ"), symbol: "EUR.USD" },
    ]);
    fake.rows.set(accountConnections, [{ accountId: "account", platform: "test", lastRealizedPnl: "7", reportingCurrency: "EUR" }]);
    expect(await getRealisedTrades()).toMatchObject({ total: 7, unconverted: 0 });
  });
});
