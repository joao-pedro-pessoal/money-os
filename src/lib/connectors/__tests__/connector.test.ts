import { describe, it, expect, vi } from "vitest";
import { createHyperliquidConnector, HYPERLIQUID_INFO_URL } from "../hyperliquid";
import { freshnessOf, freshnessLabel } from "../freshness";
import { bybitBaseUrl } from "../constants";

const FIXTURE = {
  assetPositions: [
    {
      position: {
        coin: "BTC",
        szi: "-0.5",
        entryPx: "60000",
        positionValue: "29000",
        unrealizedPnl: "1000",
        returnOnEquity: "0.03",
        liquidationPx: "75000",
        marginUsed: "2900",
        leverage: { type: "cross", value: 10 },
        cumFunding: { allTime: "12.5" },
      },
      type: "oneWay",
    },
  ],
  marginSummary: { accountValue: "31000", totalMarginUsed: "2900", totalNtlPos: "29000" },
  withdrawable: "28100",
  time: 1708622398623,
};

describe("HyperliquidConnector", () => {
  it("calls the public info endpoint with clearinghouseState and the address", async () => {
    const httpPost = vi.fn().mockResolvedValue(FIXTURE);
    const connector = createHyperliquidConnector(httpPost);
    const address = "0xb65822a30bbaaa68942d6f4c43d78704faeabbbb";

    await connector.getAccountState(address);

    expect(httpPost).toHaveBeenCalledWith(HYPERLIQUID_INFO_URL, {
      type: "clearinghouseState",
      user: address,
    });
  });

  it("normalizes a short position", async () => {
    const connector = createHyperliquidConnector(vi.fn().mockResolvedValue(FIXTURE));
    const state = await connector.getAccountState("0xb65822a30bbaaa68942d6f4c43d78704faeabbbb");

    expect(state.equity).toBe(31000);
    expect(state.positions[0].side).toBe("short");
    expect(state.positions[0].size).toBe(0.5);
    expect(state.positions[0].leverageType).toBe("cross");
  });

  it("refuses an invalid address without hitting the network", async () => {
    const httpPost = vi.fn();
    const connector = createHyperliquidConnector(httpPost);

    await expect(connector.getAccountState("0xnope")).rejects.toThrow(/Invalid/);
    expect(httpPost).not.toHaveBeenCalled();
  });

  it("validates identifiers with a helpful reason", () => {
    const connector = createHyperliquidConnector(vi.fn());
    expect(connector.validateIdentifier("0xb65822a30bbaaa68942d6f4c43d78704faeabbbb")).toEqual({ ok: true });
    const bad = connector.validateIdentifier("abc");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/42-character/);
  });

  it("propagates a network failure instead of silently returning empty state", async () => {
    const connector = createHyperliquidConnector(vi.fn().mockRejectedValue(new Error("boom")));
    await expect(connector.getAccountState("0xb65822a30bbaaa68942d6f4c43d78704faeabbbb")).rejects.toThrow("boom");
  });
});

describe("freshnessOf", () => {
  const now = new Date("2026-08-07T12:00:00Z");

  it("is LIVE just after a sync", () => {
    expect(freshnessOf({ lastSyncAt: new Date("2026-08-07T11:58:00Z"), lastSyncStatus: "ok" }, now)).toBe("LIVE");
  });

  it("is FRESH within the hour", () => {
    expect(freshnessOf({ lastSyncAt: new Date("2026-08-07T11:20:00Z"), lastSyncStatus: "ok" }, now)).toBe("FRESH");
  });

  it("is STALE after an hour", () => {
    expect(freshnessOf({ lastSyncAt: new Date("2026-08-07T09:00:00Z"), lastSyncStatus: "ok" }, now)).toBe("STALE");
  });

  it("reports ERROR even when the data is recent", () => {
    expect(freshnessOf({ lastSyncAt: new Date("2026-08-07T11:59:00Z"), lastSyncStatus: "error" }, now)).toBe("ERROR");
  });

  it("reports NEVER when it has not synced", () => {
    expect(freshnessOf({ lastSyncAt: null, lastSyncStatus: null }, now)).toBe("NEVER");
    expect(freshnessLabel("NEVER")).toBe("Never synced");
  });
});

describe("bybitBaseUrl", () => {
  it("maps the two regions to their hosts", () => {
    expect(bybitBaseUrl("eu")).toBe("https://api.bybit.eu");
    expect(bybitBaseUrl("global")).toBe("https://api.bybit.com");
  });

  it("falls back to the EEA host for anything unrecognised", () => {
    // An EEA user is required to be on bybit.eu, so that is the safer default.
    expect(bybitBaseUrl(null)).toBe("https://api.bybit.eu");
    expect(bybitBaseUrl("nonsense")).toBe("https://api.bybit.eu");
  });
});
