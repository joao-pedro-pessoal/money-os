import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "pt" }) }) }));
import CurrencySwitch from "../CurrencySwitch";

describe("dashboard currency switch", () => {
  it("keeps the URL callback on the server while translating its explanation", async () => {
    expect(readFileSync("src/components/CurrencySwitch.tsx", "utf8")).not.toMatch(/["']use client["']/);
    const html = renderToStaticMarkup(await CurrencySwitch({
      favourites: ["EUR", "USD"], display: "USD", base: "EUR",
      hrefFor: currency => `/?currency=${currency}`,
    }));
    expect(html).toContain('href="/?currency=USD"');
    expect(html).toContain("EUR");
    expect(html).not.toContain("converted from");
  });
});
