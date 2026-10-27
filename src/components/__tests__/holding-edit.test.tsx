import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({ holding: {
  id: "synthetic-holding", symbol: "TEST", name: "Synthetic", accountId: "synthetic-account",
  quantity: "2", avgEntryPrice: "10", currentPrice: "12", currency: "EUR", direction: "long",
  assetType: "stock", riskLevel: "high", expectedReturn: "aggressive", timeHorizon: "long",
  liquidity: "low", playlistIds: [], apr: "3", rewardsEarned: "4", lastPriceUpdate: new Date(),
} }));
vi.mock("@/actions/investments", () => ({
  getHolding: async () => fixture.holding, getHoldingSnapshots: async () => [],
  listAccountsForHoldings: async () => [{ id: "synthetic-account", name: "Synthetic broker" }],
  updateHolding: async () => {}, updateHoldingPrice: async () => {}, deleteHolding: async () => {},
  addRewards: async () => {}, reinforceHolding: async () => {}, sellHolding: async () => {},
}));
vi.mock("@/actions/playlists", () => ({ listPlaylists: async () => [] }));
vi.mock("@/actions/pageLanguage", () => ({ textForRequest: async () => (text: string) => text }));
vi.mock("@/components/useText", () => ({ useText: () => (text: string) => text }));
vi.mock("@/components/Section", () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/PrivacyContext", () => ({ Money: ({ value }: { value: number }) => String(value) }));
vi.mock("@/components/HoldingPurposes", () => ({ default: () => null }));
vi.mock("@/components/HoldingTags", () => ({ default: () => null }));
vi.mock("@/components/SymbolName", () => ({ default: () => "TEST" }));
vi.mock("@/components/ResponsiveTable", () => ({ default: () => null }));
vi.mock("@/components/ConfirmSubmitButton", () => ({ default: () => null }));
import HoldingDetailPage from "@/app/(app)/investments/[id]/page";
import HoldingFormFields from "../HoldingFormFields";

describe("holding edit form", () => {
  it.each(["stock", "staking", "cash", "stablecoin"])("renders one entry-price field and no current-price mutation for %s", async assetType => {
    fixture.holding.assetType = assetType;
    const html = renderToStaticMarkup(await HoldingDetailPage({ params: Promise.resolve({ id: fixture.holding.id }) }));
    const edit = html.match(/<form\b[\s\S]*?<\/form>/g)?.find(form => form.includes('name="symbol"'));
    expect(edit).toBeDefined();
    expect(edit?.match(/name="avgEntryPrice"/g)).toHaveLength(1);
    expect(edit).toContain('name="avgEntryPrice"');
    expect(edit).not.toContain('name="currentPrice"');
    for (const name of ["direction", "riskLevel", "timeHorizon", "expectedReturn", "liquidity"]) {
      expect(edit?.match(new RegExp(`name="${name}"`, "g")), name).toHaveLength(1);
    }
    if (assetType === "stock" || assetType === "staking") {
      for (const [name, value] of Object.entries({ riskLevel: "high", timeHorizon: "long", expectedReturn: "aggressive", liquidity: "low" })) {
        const select = edit?.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`))?.[1];
        expect(select).toContain(`value="${value}" selected=""`);
      }
    }
  });
  it("still supplies the fixed 1:1 prices when creating a stablecoin", () => {
    const html = renderToStaticMarkup(<HoldingFormFields defaultAssetType="stablecoin" />);
    expect(html).toContain('name="avgEntryPrice" value="1"');
    expect(html).toContain('name="currentPrice" value="1"');
  });
});
