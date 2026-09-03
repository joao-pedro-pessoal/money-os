import { describe, it, expect } from "vitest";
import { emptyReadScope } from "../scope";
import { PLATFORM_SETUP, PLATFORM_LABELS } from "../constants";

const SPOT = {
  wallet: "Spot wallet",
  elsewhere: "Futures is a separate API.",
};

/**
 * The reading this exists for: MEXC synced, reported `ok`, found
 * 0.0000000024 USDT in the Spot wallet and stored an equity of 0. The screen
 * showed a green connection beside `0,00 US$`, which reads as "MEXC holds
 * nothing" when what was measured is "the one wallet this can see holds
 * nothing". The money was in another wallet the whole time.
 */
describe("a successful zero on a connector that sees part of a venue", () => {
  it("explains itself", () => {
    expect(
      emptyReadScope({ status: "ok", equity: 0, spotValue: 0, readsOnly: SPOT })
    ).toEqual(SPOT);
  });

  /**
   * 2.4 nano-USDT is what MEXC actually returned. An exact `=== 0` test would
   * have missed it and left the screen saying 0,00 with nothing to explain it,
   * which is the entire failure this guards against.
   */
  it("treats the dust MEXC really returned as nothing", () => {
    expect(
      emptyReadScope({ status: "ok", equity: 0.0000000024, spotValue: 0, readsOnly: SPOT })
    ).toEqual(SPOT);
  });

  it("says nothing once the wallet holds something", () => {
    expect(
      emptyReadScope({ status: "ok", equity: 41.2, spotValue: 0, readsOnly: SPOT })
    ).toBeNull();
    // Value in coins counts too — a spot-only venue reports it there.
    expect(
      emptyReadScope({ status: "ok", equity: 0, spotValue: 12.5, readsOnly: SPOT })
    ).toBeNull();
  });

  /** A failure already says so in red; a second explanation would bury it. */
  it("stays quiet when the sync did not succeed", () => {
    expect(
      emptyReadScope({ status: "error", equity: 0, spotValue: 0, readsOnly: SPOT })
    ).toBeNull();
    expect(
      emptyReadScope({ status: null, equity: null, spotValue: null, readsOnly: SPOT })
    ).toBeNull();
  });

  /**
   * An empty account on a connector that sees everything is just an empty
   * account, and telling someone their zero might be hiding money would be
   * inventing a doubt.
   */
  it("stays quiet for a connector that reads the whole venue", () => {
    expect(emptyReadScope({ status: "ok", equity: 0, spotValue: 0 })).toBeNull();
    expect(
      emptyReadScope({ status: "ok", equity: 0, spotValue: 0, readsOnly: null })
    ).toBeNull();
  });

  /** Never measured is not the same as measured and empty, but both are zero
      here — and for a partial connector both deserve the same explanation. */
  it("handles a connection that has stored no figures yet", () => {
    expect(
      emptyReadScope({ status: "ok", equity: null, spotValue: null, readsOnly: SPOT })
    ).toEqual(SPOT);
  });
});

/**
 * The three connectors known to see only part of their venue must declare it,
 * or the explanation above never fires for them.
 */
describe("every partial-scope platform declares its scope", () => {
  for (const platform of ["mexc", "binance", "okx"]) {
    it(`${platform} says which wallet it reads`, () => {
      const scope = PLATFORM_SETUP[platform]?.readsOnly;
      expect(scope, `${platform} has no readsOnly`).toBeDefined();
      expect(scope?.wallet.length ?? 0).toBeGreaterThan(0);
      expect(scope?.elsewhere.length ?? 0).toBeGreaterThan(0);
    });
  }

  /**
   * And a declared scope must belong to a real platform — a typo'd key would
   * sit there declaring a limit nothing ever reads.
   */
  it("declares a scope only for platforms that exist", () => {
    const declared = Object.entries(PLATFORM_SETUP)
      .filter(([, setup]) => setup.readsOnly !== undefined)
      .map(([platform]) => platform);
    const unknown = declared.filter((p) => PLATFORM_LABELS[p] === undefined);
    expect(unknown, "readsOnly on a platform that is not in PLATFORM_LABELS").toEqual([]);
  });
});
