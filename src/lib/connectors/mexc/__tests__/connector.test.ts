import { describe, it, expect } from "vitest";
import { createMexcConnector } from "../index";

/**
 * The parts all passed on their own; the assembly was what was wrong.
 *
 * MEXC synced, wrote a balance of 36.06 and appeared in Net Worth — and in no
 * chart at all. The portfolio view is built from holdings, open positions and
 * balances, and the futures collateral was none of the three: it reached the
 * total through `equity` alone, so 36.06 USDT of real money at a venue was
 * counted and invisible in every breakdown of that count.
 *
 * These drive the whole connector against canned replies, which is the only
 * level at which that gap was visible.
 */

const SPOT_ACCOUNT = {
  balances: [{ asset: "USDT", free: "0.0000000024", locked: "0" }],
};

const FUTURES_ASSETS = {
  success: true,
  code: 0,
  data: [
    {
      currency: "USDT",
      positionMargin: 0,
      availableBalance: 36.06,
      cashBalance: 36.06,
      frozenBalance: 0,
      equity: 36.06,
      unrealized: 0,
      bonus: 0,
    },
  ],
};

const CONTRACT_DETAIL = { code: 0, data: [{ symbol: "BTC_USDT", contractSize: 0.0001 }] };
const NO_POSITIONS = { code: 0, data: [] };

function connectorWith(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    "/api/v3/account": SPOT_ACCOUNT,
    "/api/v3/ticker/price": [{ symbol: "BTCUSDT", price: "80000" }],
    "/api/v1/private/account/assets": FUTURES_ASSETS,
    "/api/v1/contract/detail": CONTRACT_DETAIL,
    "/api/v1/private/position/open_positions": NO_POSITIONS,
    "/api/v1/private/position/list/history_positions": NO_POSITIONS,
    ...overrides,
  };

  return createMexcConnector({ apiKey: "mx0key", apiSecret: "secret" }, async (url) => {
    const path = Object.keys(routes).find((p) => url.includes(p));
    if (path === undefined) throw new Error(`unexpected call: ${url}`);
    const reply = routes[path];
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

describe("a futures account with no open position", () => {
  it("reports the collateral as the account's equity", async () => {
    const state = await connectorWith().getAccountState("");
    expect(state.equity).toBe(36.06);
    expect(state.withdrawable).toBe(36.06);
  });

  /**
   * The bug this file exists for. Without a balance row the money is in Net
   * Worth and in nothing else — no allocation chart, no breakdown, no
   * Investments row.
   */
  it("lists the collateral as a holding, so it can appear in a chart", async () => {
    const state = await connectorWith().getAccountState("");
    const usdt = state.balances.find((b) => b.coin === "USDT" && b.total === 36.06);
    expect(usdt, "the futures collateral is not among the balances").toBeDefined();
    expect(usdt?.usdValue).toBe(36.06);
  });

  /**
   * And the row that makes it visible must not also make it count twice.
   * `countsInPortfolio: false` says this is `equity` itemised, not money
   * beside it — the same thing IBKR does with the euros inside its
   * `netliquidationvalue`.
   */
  it("marks that row as inside the equity rather than beside it", async () => {
    const state = await connectorWith().getAccountState("");
    const usdt = state.balances.find((b) => b.total === 36.06);
    expect(usdt?.countsInPortfolio).toBe(false);
  });

  /**
   * `spotValue` is what the connections screen adds to the account value. With
   * the collateral counted in it the screen read "36.06 + 36.06 = 72.12".
   */
  it("keeps the collateral out of spotValue, which is money on top", async () => {
    const state = await connectorWith().getAccountState("");
    expect(state.spotValue).toBe(0);
    expect(state.equity + state.spotValue).toBe(36.06);
  });

  /** The spot dust is still separate money and still says so. */
  it("leaves the spot coins counting on top", async () => {
    const state = await connectorWith().getAccountState("");
    expect(state.balancesAreSeparatePool).toBe(true);
    const dust = state.balances.find((b) => b.total < 1);
    expect(dust?.countsInPortfolio).toBeUndefined();
  });
});

describe("when futures cannot be reached", () => {
  const REFUSED = { success: false, code: 401, message: "Not logged in or login has expired" };

  /**
   * MEXC has restricted futures API access for years. A refusal there must not
   * kill the whole sync, or an account would show nothing at all rather than
   * the half that could be read.
   */
  it("still reports the spot wallet", async () => {
    const state = await connectorWith({
      "/api/v1/private/account/assets": REFUSED,
    }).getAccountState("");
    expect(state.equity).toBe(0);
    expect(state.balances.some((b) => b.coin === "USDT")).toBe(true);
  });

  /** Not measured is not the same as measured and free. */
  it("reports withdrawable as unknown rather than zero", async () => {
    const state = await connectorWith({
      "/api/v1/private/account/assets": REFUSED,
    }).getAccountState("");
    expect(state.withdrawable).toBeNull();
    expect(state.totalMarginUsed).toBeNull();
  });

  it("keeps the balance when only the history is refused", async () => {
    const state = await connectorWith({
      "/api/v1/private/position/list/history_positions": REFUSED,
    }).getAccountState("");
    expect(state.equity).toBe(36.06);
    // History accumulates and can be caught up next sync; the balance cannot.
    expect(state.activity).toBeUndefined();
  });
});

describe("open positions", () => {
  it("converts contracts to coins and leaves the profit inside equity", async () => {
    const state = await connectorWith({
      "/api/v1/private/position/open_positions": {
        code: 0,
        data: [
          {
            positionId: 7,
            symbol: "BTC_USDT",
            positionType: 1,
            openType: 2,
            state: 1,
            holdVol: 500,
            holdAvgPrice: 60000,
            leverage: 10,
            realised: 1.5,
          },
        ],
      },
    }).getAccountState("");

    expect(state.positions).toHaveLength(1);
    expect(state.positions[0].size).toBeCloseTo(0.05, 10);
    expect(state.positions[0].coin).toBe("BTC");
    // MEXC's `equity` already contains this position's floating result, so the
    // account value must not have grown by it.
    expect(state.equity).toBe(36.06);
  });
});
