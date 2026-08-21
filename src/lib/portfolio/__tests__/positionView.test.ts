import { describe, it, expect } from "vitest";
import {
  groupItems,
  applyFilters,
  filterOptions,
  allocationOf,
  groupValueOf,
  UNTAGGED,
  NO_FILTERS,
  type PositionItem,
} from "../positionView";

const p = (o: Partial<PositionItem> & { id: string }): PositionItem => ({
  symbol: o.id,
  side: "long",
  accountName: "Interactive Brokers",
  platform: "ibkr",
  assetType: "stock",
  playlistName: null,
  riskLevel: null,
  timeHorizon: null,
  value: 100,
  notional: o.notional ?? o.value ?? 100,
  leverage: null,
  pnl: 0,
  source: "synced",
  insideBalance: false,
  apr: null,
  ...o,
});

const items = [
  p({ id: "CCI", playlistName: "Div RSI", value: 8.97, pnl: -0.12 }),
  p({ id: "FEMY", playlistName: "Insider Trading", value: 8.05, pnl: -1.04 }),
  p({ id: "AVBC", playlistName: "Insider Trading", value: 4.96, pnl: -0.09 }),
  p({
    id: "xyz:GOLD",
    side: "short",
    accountName: "Hyperliquid",
    platform: "hyperliquid",
    assetType: null,
    playlistName: "Div Commodities",
    value: 228.27,
    pnl: -0.13,
  }),
];

describe("groupValueOf", () => {
  it("names the untagged bucket instead of leaving it blank", () => {
    expect(groupValueOf(items[3], "assetType")).toBe(UNTAGGED);
  });

  it("reads each grouping key", () => {
    expect(groupValueOf(items[0], "playlist")).toBe("Div RSI");
    expect(groupValueOf(items[0], "account")).toBe("Interactive Brokers");
    expect(groupValueOf(items[3], "side")).toBe("short");
    expect(groupValueOf(items[0], "none")).toBe("");
  });
});

describe("groupItems", () => {
  it("puts everything in one group when not grouping", () => {
    const g = groupItems(items, "none");
    expect(g).toHaveLength(1);
    expect(g[0].items).toHaveLength(4);
    expect(g[0].percent).toBe(100);
  });

  it("groups by playlist and totals each", () => {
    const g = groupItems(items, "playlist");
    const insider = g.find((x) => x.key === "Insider Trading")!;
    expect(insider.items).toHaveLength(2);
    expect(insider.value).toBe(13.01);
    expect(insider.pnl).toBe(-1.13);
  });

  it("orders groups by value", () => {
    const g = groupItems(items, "playlist");
    expect(g[0].key).toBe("Div Commodities");
  });

  it("puts the untagged group last however big it is", () => {
    // The Hyperliquid position is by far the largest and has no asset type.
    // It's a to-do, not a category, so it doesn't get to head the list.
    const g = groupItems(items, "assetType");
    expect(g[g.length - 1].key).toBe(UNTAGGED);
  });

  it("reports each group's share of the total", () => {
    const g = groupItems(items, "assetType");
    const sum = g.reduce((s, x) => s + x.percent, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it("does not divide by zero when everything is worthless", () => {
    const g = groupItems([p({ id: "X", value: 0 })], "assetType");
    expect(g[0].percent).toBe(0);
  });

  it("is empty for nothing", () => {
    expect(groupItems([], "playlist")).toEqual([]);
  });

  it("sorts positions inside a group by value", () => {
    const g = groupItems(items, "account");
    const ibkr = g.find((x) => x.key === "Interactive Brokers")!;
    expect(ibkr.items[0].symbol).toBe("CCI");
  });
});

describe("applyFilters", () => {
  it("shows everything with no filters", () => {
    expect(applyFilters(items, NO_FILTERS)).toHaveLength(4);
  });

  it("filters by playlist", () => {
    expect(applyFilters(items, { ...NO_FILTERS, playlist: "Insider Trading" })).toHaveLength(2);
  });

  it("filters to what has no tag at all", () => {
    // "Show me what I haven't classified" is a real request, so the untagged
    // bucket is selectable rather than only being a leftover.
    const out = applyFilters(items, { ...NO_FILTERS, assetType: UNTAGGED });
    expect(out.map((i) => i.symbol)).toEqual(["xyz:GOLD"]);
  });

  it("searches symbol, account and playlist", () => {
    expect(applyFilters(items, { ...NO_FILTERS, search: "gold" })).toHaveLength(1);
    expect(applyFilters(items, { ...NO_FILTERS, search: "hyperliquid" })).toHaveLength(1);
    expect(applyFilters(items, { ...NO_FILTERS, search: "insider" })).toHaveLength(2);
  });

  it("combines filters", () => {
    const out = applyFilters(items, {
      ...NO_FILTERS,
      account: "Interactive Brokers",
      playlist: "Div RSI",
    });
    expect(out).toHaveLength(1);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(applyFilters(items, { ...NO_FILTERS, playlist: "Nope" })).toHaveLength(0);
  });
});

describe("filterOptions", () => {
  it("lists what is actually present", () => {
    const o = filterOptions(items);
    expect(o.playlists).toContain("Div RSI");
    expect(o.accounts).toEqual(["Hyperliquid", "Interactive Brokers"]);
  });

  it("puts the untagged option last", () => {
    const o = filterOptions(items);
    expect(o.assetTypes[o.assetTypes.length - 1]).toBe(UNTAGGED);
  });
});

describe("allocationOf", () => {
  it("falls back to asset type when nothing is grouped", () => {
    // An allocation chart of one slice called "All" would be useless.
    const a = allocationOf(items, "none");
    expect(a.length).toBeGreaterThan(1);
  });

  it("shows the positions themselves when the grouping gives one slice", () => {
    // Filtering to one playlist and grouping by asset type would otherwise
    // draw a ring that is 100% one colour: correct, and useless. At that point
    // the question is "what's inside this".
    const oneGroup = applyFilters(items, { ...NO_FILTERS, playlist: "Insider Trading" });
    const a = allocationOf(oneGroup, "assetType");
    expect(a.map((x) => x.name).sort()).toEqual(["AVBC", "FEMY"]);
  });

  it("does the same for a single commodity playlist", () => {
    const commodities = [
      p({ id: "xyz:GOLD", assetType: "commodity", playlistName: "Div Commodities", value: 7.68 }),
      p({ id: "xyz:SILVER", assetType: "commodity", playlistName: "Div Commodities", value: 12.9 }),
    ];
    const a = allocationOf(commodities, "assetType");
    expect(a).toHaveLength(2);
    expect(a[0].name).toBe("xyz:SILVER");
  });

  it("follows the chosen grouping", () => {
    const a = allocationOf(items, "playlist");
    expect(a.map((x) => x.name)).toContain("Insider Trading");
  });

  it("reflects the filters, not the whole portfolio", () => {
    const filtered = applyFilters(items, { ...NO_FILTERS, account: "Interactive Brokers" });
    const a = allocationOf(filtered, "playlist");
    expect(a.reduce((s, x) => s + x.value, 0)).toBeCloseTo(21.98, 2);
  });

  it("leaves out worthless slices", () => {
    const a = allocationOf([p({ id: "X", value: 0 })], "assetType");
    expect(a).toEqual([]);
  });
});
