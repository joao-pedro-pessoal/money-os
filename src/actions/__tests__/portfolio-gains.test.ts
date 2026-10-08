import { beforeEach, describe, expect, it, vi } from "vitest";
import { holdings, playlists } from "@/db/schema";
import { portfolioSummary, type PositionItem } from "@/lib/portfolio/positionView";

const fake = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), items: [] as PositionItem[] }));
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: async (table: unknown) => fake.rows.get(table) ?? [] }) } }));
vi.mock("../dashboard", () => ({ getPortfolioItems: async () => ({ items: fake.items, baseCurrency: "GBP" }) }));
vi.mock("../fx", () => ({ getRates: async () => ({ GBP: 1 }) }));
vi.mock("../settings", () => ({ getBaseCurrency: async () => "GBP" }));
vi.mock("../exposure", () => ({ getAnnouncedDividends: vi.fn(), heldSymbols: vi.fn() }));
vi.mock("../investmentActivity", () => ({
  getRealisedTrades: async () => ({ known: false, reported: 0, derived: 0, total: 0, unconverted: 0, silentPlatforms: [] }),
  getTradeAnalysis: async () => ({ rows: [], unconvertibleTrades: 0 }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getGainAttribution } from "../dividends";
import { listPlaylistsWithTotals } from "../playlists";

function position(extra: Partial<PositionItem> = {}): PositionItem {
  return {
    id: "manual", symbol: "TEST", side: "long", accountId: "account", accountName: "Test",
    platform: "manual", assetType: "stock", playlistName: null, riskLevel: null, timeHorizon: null,
    value: 120, notional: 120, leverage: null, pnl: 20, source: "manual", insideBalance: false, apr: null,
    ...extra,
  };
}

beforeEach(() => { fake.rows.clear(); fake.items = []; });

describe("gain attribution uses the portfolio's own source selection", () => {
  it("includes manual gains and names market exposure with no measured cost", async () => {
    fake.items = [position(), position({ id: "unknown", value: 50, notional: 50, pnl: 0, costUnknown: true })];
    const result = await getGainAttribution();
    expect(result.attribution.unrealised).toBe(portfolioSummary(fake.items).pnl);
    expect(result).toMatchObject({ currency: "GBP", costUnknown: 50 });
  });
});

describe("manual playlist sales without an exchange rate", () => {
  it("keeps the convertible result and reports the sale it could not include", async () => {
    fake.rows.set(playlists, [{ id: "list", name: "Test" }]);
    fake.rows.set(holdings, [
      { playlistId: "list", realizedPnl: "10", currency: "GBP" },
      { playlistId: "list", realizedPnl: "5", currency: "XYZ" },
      { playlistId: "list", realizedPnl: null, currency: "XYZ" },
    ]);
    const [result] = await listPlaylistsWithTotals();
    expect(result).toMatchObject({ realized: 10, unconverted: 1 });
  });
});
