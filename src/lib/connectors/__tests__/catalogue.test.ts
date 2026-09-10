import { describe, it, expect } from "vitest";
import { platformOptions, matchPlatform, normaliseInstitution } from "../catalogue";
import { PLATFORM_LABELS } from "../constants";

const options = platformOptions([]);

describe("what can be connected", () => {
  it("offers every supported platform", () => {
    expect(options.map((o) => o.platform).sort()).toEqual(Object.keys(PLATFORM_LABELS).sort());
  });

  it("says what each one costs you in setup", () => {
    for (const o of options) {
      expect(o.requirement, `${o.platform} explains nothing`).toBeTruthy();
    }
  });

  it("distinguishes a platform needing only a public address", () => {
    const hyperliquid = options.find((o) => o.platform === "hyperliquid")!;
    expect(hyperliquid.requirement).toMatch(/only/i);
    expect(hyperliquid.requirement).not.toMatch(/secret/i);
  });

  it("says a key platform needs a secret too", () => {
    const t212 = options.find((o) => o.platform === "trading212")!;
    expect(t212.requirement).toMatch(/secret/i);
  });

  it("marks nothing as connected when nothing is", () => {
    expect(options.every((o) => !o.connected)).toBe(true);
  });
});

describe("what is already connected", () => {
  const withBybit = platformOptions([{ platform: "bybit", accountName: "Bybit Main" }]);

  it("names the account a platform feeds", () => {
    const bybit = withBybit.find((o) => o.platform === "bybit")!;
    expect(bybit.connected).toBe(true);
    expect(bybit.connectedTo).toEqual(["Bybit Main"]);
  });

  it("lists every account when a platform feeds more than one", () => {
    const two = platformOptions([
      { platform: "ibkr", accountName: "IB EUR" },
      { platform: "ibkr", accountName: "IB USD" },
    ]);
    expect(two.find((o) => o.platform === "ibkr")!.connectedTo).toEqual(["IB EUR", "IB USD"]);
  });

  it("puts what you could still add before what you already have", () => {
    // The list exists to show you the option you didn't know about.
    const connectedIndex = withBybit.findIndex((o) => o.connected);
    expect(connectedIndex).toBe(withBybit.length - 1);
  });

  it("ignores a connection for a platform that no longer exists", () => {
    const stale = platformOptions([{ platform: "some-dead-exchange", accountName: "Old" }]);
    expect(stale.map((o) => o.platform)).not.toContain("some-dead-exchange");
  });
});

describe("recognising what you're typing", () => {
  it("matches the platform name exactly", () => {
    expect(matchPlatform("Bybit", options)?.platform).toBe("bybit");
  });

  it("ignores case, spaces and punctuation", () => {
    expect(matchPlatform("trading 212", options)?.platform).toBe("trading212");
    expect(matchPlatform("TRADING-212", options)?.platform).toBe("trading212");
    expect(matchPlatform("  bybit  ", options)?.platform).toBe("bybit");
  });

  it("matches a longer name that contains the platform", () => {
    expect(matchPlatform("Bybit savings", options)?.platform).toBe("bybit");
  });

  it("stays quiet for an ordinary bank", () => {
    // A warning that fires when it shouldn't is one people learn to click past.
    for (const name of ["Revolut", "Caixa Geral", "Trade Republic", "Savings", "Wallet"]) {
      expect(matchPlatform(name, options), `${name} triggered a false warning`).toBeNull();
    }
  });

  it("says nothing while you've barely started typing", () => {
    expect(matchPlatform("", options)).toBeNull();
    expect(matchPlatform("b", options)).toBeNull();
    expect(matchPlatform("by", options)).toBeNull();
  });

  it("doesn't match a short name by containment", () => {
    // "ibkr" is four characters; requiring five stops it matching inside
    // unrelated words and nagging about them.
    expect(matchPlatform("Fibkrown Bank", options)).toBeNull();
  });

  it("squashes accents and punctuation the same way on both sides", () => {
    expect(normaliseInstitution("Trádìng 212!")).toBe("trading212");
    expect(normaliseInstitution("BYBIT")).toBe(normaliseInstitution("bybit"));
  });
});
