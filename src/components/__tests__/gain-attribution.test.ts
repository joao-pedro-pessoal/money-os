import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { attribute } from "@/lib/portfolio/attribution";

vi.mock("@/actions/dividends", () => ({
  getGainAttribution: async () => ({
    attribution: attribute({ unrealised: 20, realisedTrades: 5, dividends: 0, interest: 0 }),
    currency: "GBP", costUnknown: 50, unconverted: 1, silentPlatforms: [],
  }),
}));
vi.mock("@/components/PrivacyContext", () => ({
  Money: ({ value, currency }: { value: number; currency: string }) => `${value} ${currency}`,
}));

import GainAttribution from "../GainAttribution";

describe("the gains panel uses the currency its figures were computed in", () => {
  it("renders pounds and the missing-data notes from the action", async () => {
    const html = renderToStaticMarkup(await GainAttribution());
    expect(html).toContain("25 GBP");
    expect(html).toContain("50 GBP");
    expect(html).toContain("whose cost is unknown");
    expect(html).toContain("1 movement left out of what was realised: no exchange rate");
    expect(html).not.toContain("EUR");
  });
});
