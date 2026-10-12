import { describe, expect, it } from "vitest";
import { choiceText, cleanChoices, matchesAny, NONE, toggled } from "../multi";

describe("a field that takes several values", () => {
  it("lets everything through when nothing is chosen", () => {
    expect(matchesAny("BTC", [])).toBe(true);
    expect(matchesAny([], [])).toBe(true);
  });

  it("matches any chosen value, on one value or on several", () => {
    expect(matchesAny("BTC", ["ETH", "BTC"])).toBe(true);
    expect(matchesAny(["Crypto", "Sato"], ["Sato"])).toBe(true);
    expect(matchesAny(["Crypto"], ["Long Term"])).toBe(false);
  });

  it("matches what has no value only when none is chosen", () => {
    expect(matchesAny(null, ["BTC"])).toBe(false);
    expect(matchesAny([], [NONE])).toBe(true);
    expect(matchesAny("", [NONE, "x"])).toBe(true);
  });

  it("adds and removes a value, and reads as alternatives", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
    expect(choiceText(["a", NONE])).toBe("a or none");
  });

  it("keeps only allowed values, each once, from whatever was saved", () => {
    expect(cleanChoices(["a", "a", " b ", 3, "", "zz"], ["a", "b"])).toEqual(["a", "b"]);
    expect(cleanChoices([NONE], ["a"])).toEqual([NONE]);
    expect(cleanChoices("a")).toEqual(["a"]);
    expect(cleanChoices(null)).toEqual([]);
  });
});
