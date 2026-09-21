import { describe, expect, it } from "vitest";
import { indexProxyFor, indexSource, isIndexSource } from "../indexProxy";

describe("a synthetic fund's companies", () => {
  it("are read from a physical fund tracking the same index", () => {
    const proxy = indexProxyFor("LU1681048804");
    expect(proxy?.index).toBe("S&P 500");
    expect(proxy?.proxyIsin).toBe("IE00B5BMR087");
    expect(indexProxyFor(" lu1681048804 ")?.proxyIsin).toBe("IE00B5BMR087");
  });

  /**
   * A fund that holds its own shares is read from its own file. Only a fund
   * someone has checked is a swap gets a stand-in, never one whose name
   * merely mentions an index.
   */
  it("are nobody else's for a fund that holds its own shares", () => {
    expect(indexProxyFor("IE00B5BMR087")).toBeNull();
    expect(indexProxyFor("LU0322253906")).toBeNull();
    expect(indexProxyFor(null)).toBeNull();
  });

  it("say where they came from in the source they are saved under", () => {
    const proxy = indexProxyFor("LU1681048804")!;
    expect(indexSource(proxy)).toBe("index:IE00B5BMR087");
    expect(isIndexSource(indexSource(proxy))).toBe(true);
    expect(isIndexSource("ishares")).toBe(false);
    expect(isIndexSource(null)).toBe(false);
  });
});
