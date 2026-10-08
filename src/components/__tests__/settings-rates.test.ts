import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/settings", () => ({ getBaseCurrency: async () => "USD" }));
vi.mock("@/actions/fx", () => ({
  listRates: async () => [{ id: "usd", quote: "USD", rate: "1.25", fetchedAt: "2026-10-08", manual: false }],
  refreshRatesAction: async () => {}, setManualRate: async () => {}, unpinRate: async () => {},
}));
import SettingsRatesPage from "@/app/(app)/settings/rates/page";

describe("the rates editor labels the unit stored by its action", () => {
  it("keeps rates and manual input per euro when display totals are in dollars", async () => {
    const html = renderToStaticMarkup(await SettingsRatesPage());
    expect(html).toContain("Per 1 EUR");
    expect(html).toContain('placeholder="Units per 1 EUR"');
    expect(html).not.toContain("Per 1 USD");
  });
});
