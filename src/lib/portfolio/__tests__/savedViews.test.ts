import { describe, it, expect } from "vitest";
import {
  serialiseView,
  parseView,
  sameView,
  suggestName,
  cleanName,
} from "../savedViews";

const allowed = {
  groupBy: ["playlist", "riskLevel", "assetType"],
  sort: ["value", "pnlPercent"],
};

describe("serialiseView", () => {
  it("writes keys in a fixed order regardless of input order", () => {
    // Stable output is what makes "you already saved this view" detectable.
    const a = serialiseView({ sort: "value", groupBy: "playlist" });
    const b = serialiseView({ groupBy: "playlist", sort: "value" });
    expect(a).toBe(b);
    expect(a).toBe("groupBy=playlist&sort=value");
  });

  it("drops empty values instead of writing groupBy=", () => {
    expect(serialiseView({ groupBy: "playlist", sort: "" })).toBe("groupBy=playlist");
    expect(serialiseView({})).toBe("");
  });
});

describe("parseView", () => {
  it("keeps values the screen accepts", () => {
    const c = parseView("groupBy=riskLevel&sort=pnlPercent&dir=asc&synced=off", allowed);
    expect(c).toEqual({ groupBy: "riskLevel", sort: "pnlPercent", dir: "asc", synced: "off" });
  });

  it("drops a grouping that no longer exists", () => {
    // A view saved before an option was renamed must degrade, not produce a
    // URL that renders an empty screen.
    expect(parseView("groupBy=sector&sort=value", allowed)).toEqual({ sort: "value" });
  });

  it("drops an unknown sort column", () => {
    expect(parseView("groupBy=playlist&sort=sharpe", allowed)).toEqual({ groupBy: "playlist" });
  });

  it("rejects a direction that isn't asc or desc", () => {
    expect(parseView("dir=sideways", allowed).dir).toBeUndefined();
  });

  it("rejects a synced flag that isn't on or off", () => {
    expect(parseView("synced=maybe", allowed).synced).toBeUndefined();
  });

  it("ignores keys the screen knows nothing about", () => {
    // The config is a string in the database; treating it as trusted would be
    // careless.
    const c = parseView("groupBy=playlist&redirect=http://evil&admin=1", allowed);
    expect(c).toEqual({ groupBy: "playlist" });
  });

  it("survives junk", () => {
    expect(parseView("", allowed)).toEqual({});
    expect(parseView("%%%not a query%%%", allowed)).toEqual({});
  });

  it("round-trips a valid view unchanged", () => {
    const original = "groupBy=riskLevel&sort=value&dir=desc&synced=on";
    expect(serialiseView(parseView(original, allowed))).toBe(original);
  });
});

describe("sameView", () => {
  it("ignores key order", () => {
    expect(sameView({ groupBy: "playlist", sort: "value" }, { sort: "value", groupBy: "playlist" })).toBe(
      true
    );
  });

  it("distinguishes different directions", () => {
    expect(sameView({ sort: "value", dir: "asc" }, { sort: "value", dir: "desc" })).toBe(false);
  });
});

describe("suggestName", () => {
  const labels = {
    groupBy: { riskLevel: "Risco", playlist: "Playlist" },
    sort: { pnlPercent: "P&L %", value: "Valor" },
  };

  it("describes the grouping and the ranking", () => {
    const name = suggestName({ groupBy: "riskLevel", sort: "pnlPercent", dir: "desc" }, labels);
    expect(name).toBe("By risco, highest p&l %");
  });

  it("says lowest when sorted ascending", () => {
    expect(suggestName({ sort: "value", dir: "asc" }, labels)).toContain("lowest");
  });

  it("mentions when synced holdings are excluded", () => {
    expect(suggestName({ groupBy: "playlist", synced: "off" }, labels)).toContain("manual only");
  });

  it("falls back rather than returning an empty name", () => {
    expect(suggestName({}, labels)).toBe("Saved view");
  });

  it("uses the raw key when there is no label for it", () => {
    expect(suggestName({ groupBy: "mystery" }, labels)).toBe("By mystery");
  });
});

describe("cleanName", () => {
  it("collapses whitespace", () => {
    expect(cleanName("  Alto   ROI  ")).toBe("Alto ROI");
  });

  it("caps the length so the chip row stays readable", () => {
    const long = "a".repeat(60);
    expect(cleanName(long)).toHaveLength(40);
    expect(cleanName(long).endsWith("…")).toBe(true);
  });

  it("leaves an ordinary name alone", () => {
    expect(cleanName("Baixo risco")).toBe("Baixo risco");
  });
});
