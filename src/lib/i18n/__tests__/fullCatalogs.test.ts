import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LANGUAGES } from "../languages";
import { translateText } from "../text";
import english from "../full/en.json";

describe("full page catalogs", () => {
  for (const { code } of LANGUAGES) it(`${code} covers every message and preserves variables`, () => {
    const catalog = JSON.parse(readFileSync(`src/lib/i18n/full/${code}.json`, "utf8"));
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
    for (const [source, value] of Object.entries(catalog)) {
      expect(typeof value, source).toBe("string");
      // Russian and Turkish do not use a definite article before a following node.
      if (!(source === "The " && ["ru", "tr"].includes(code))) expect(String(value).trim().length, source).toBeGreaterThan(0);
      expect(String(value).match(/\{\w+\}/g)?.sort() ?? [], source).toEqual(source.match(/\{\w+\}/g)?.sort() ?? []);
      expect(String(value), source).not.toMatch(/ZXQ\s*\d+/i);
    }
  });
  it("interpolates literal names and money without translating their contents", () => {
    expect(translateText({ "Account {name}: {amount}": "Conta {name}: {amount}" }, "Account {name}: {amount}", { name: "Income $& {amount}", amount: "12.34 USD" })).toBe("Conta Income $& {amount}: 12.34 USD");
  });
  it("translates an explicit dynamic error and leaves unknown diagnostics intact", () => {
    const catalog = { "Could not save {0}": "Não foi possível guardar {0}", "{0}": "Valor {0}" };
    expect(translateText(catalog, "Could not save My Account")).toBe("Não foi possível guardar My Account");
    expect(translateText(catalog, "Unknown diagnostic")).toBe("Unknown diagnostic");
  });
});
