import { describe, expect, it } from "vitest";
import { knownPlaylistIds, MAX_PLAYLISTS_PER_ITEM, playlistGroups, playlistIdsFrom, playlistNamesOf, playlistsText } from "../playlists";
import { applyFilters, filterOptions, groupItems, NO_FILTERS, UNTAGGED, type PositionItem } from "../positionView";
import { classifiedPerformance } from "../classifiedPerformance";

const item = (id: string, value: number, playlistNames: string[]): PositionItem => ({
  id, symbol: id, side: null, accountId: null, accountName: "A", platform: "manual", assetType: "crypto",
  playlistNames, playlistIds: playlistNames.map((n) => n.toLowerCase()), riskLevel: null, timeHorizon: null,
  value, notional: value, leverage: null, pnl: 0, source: "manual", insideBalance: false, apr: null,
});

describe("a form's playlists", () => {
  it("are the ticked ids, each once, blanks dropped", () => {
    expect(playlistIdsFrom(["a", " b ", "", "a", 7, null])).toEqual(["a", "b"]);
    expect(() => playlistIdsFrom(Array.from({ length: MAX_PLAYLISTS_PER_ITEM + 1 }, (_, i) => `p${i}`))).toThrow();
  });

  it("keep only playlists that exist, and name them in order", () => {
    expect(knownPlaylistIds(["a", "gone", "b"], new Set(["a", "b"]))).toEqual(["a", "b"]);
    const names = new Map([["a", "Long Term"], ["b", "Crypto"]]);
    expect(playlistNamesOf(["b", "gone", "a"], names)).toEqual(["Crypto", "Long Term"]);
    expect(playlistsText(["Crypto", "Long Term"])).toBe("Crypto, Long Term");
    expect(playlistsText([])).toBe("—");
    expect(playlistGroups([], UNTAGGED)).toEqual([UNTAGGED]);
  });
});

describe("a position in two playlists", () => {
  const items = [item("BTC", 100, ["Long Term", "Crypto"]), item("VWCE", 300, ["Long Term"]), item("CASH", 50, [])];

  it("is in both groups of the holdings table, whole, and the untagged group keeps the rest", () => {
    const groups = groupItems(items, "playlist");
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.value]));
    expect(byKey).toEqual({ "Long Term": 400, Crypto: 100, [UNTAGGED]: 50 });
  });

  it("matches a filter on either playlist, and both are offered as filters", () => {
    expect(applyFilters(items, { ...NO_FILTERS, playlist: "Crypto" }).map((i) => i.id)).toEqual(["BTC"]);
    expect(applyFilters(items, { ...NO_FILTERS, playlist: "Long Term" }).map((i) => i.id)).toEqual(["BTC", "VWCE"]);
    expect(applyFilters(items, { ...NO_FILTERS, playlist: UNTAGGED }).map((i) => i.id)).toEqual(["CASH"]);
    expect(filterOptions(items).playlists).toEqual(["Crypto", "Long Term", UNTAGGED]);
  });

  it("counts whole in each Analysis group, while its share of the portfolio counts it once", () => {
    const groups = classifiedPerformance(items, [], "playlist");
    const longTerm = groups.find((g) => g.key === "Long Term")!;
    const crypto = groups.find((g) => g.key === "Crypto")!;
    expect(longTerm.value).toBe(400);
    expect(crypto.value).toBe(100);
    // Of 450 held: 400 and 100, which add up to more than 100% because BTC is in both.
    expect(longTerm.percent).toBeCloseTo(88.89, 1);
    expect(crypto.percent).toBeCloseTo(22.22, 1);
    expect(groups.find((g) => g.key === "Unset")!.value).toBe(50);
  });
});
