import { afterEach, describe, expect, it, vi } from "vitest";
import { availablePath, productEdition } from "../edition";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("first release edition", () => {
  it.each([undefined,"","full","money"])("accepts only explicit known editions (%s)",value => {
    expect(productEdition(value)).toBe(value === "money" ? "money" : "full");
  });
  it.each(["Money","cash","false"])("refuses an invalid build edition (%s)",value => {
    expect(() => productEdition(value)).toThrow("APP_EDITION");
  });
  // Its shared secret decides; the owner's prices are refreshed through it (route.ts).
  it("leaves the scheduled sync reachable in the money edition", () => { expect(availablePath("/api/sync", "money")).toBe(true); });
  it.each(["/investments","/investments/asset/AAPL","/investments/history?year=2026","/positions","/connections","/settings/names","/statistics","/library"])("blocks deferred destinations in the money edition (%s)",path => {
    expect(availablePath(path,"money")).toBe(false);
    expect(availablePath(path,"full")).toBe(true);
  });
  it.each(["/","/accounts","/transactions","/budgets","/buckets","/subscriptions","/expected","/analytics/report?scope=money","/api/widget","/privacy","/investments-other"])("keeps supported and similarly named paths (%s)",path => {
    expect(availablePath(path,"money")).toBe(true);
  });
  it("uses the same filtered destinations in menus, search and tabs",async () => {
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION","money");
    vi.resetModules();
    const nav = await import("@/lib/navigation");
    const links = [...nav.navGroups(false).flatMap(group=>group.links),...nav.searchablePages(false),...nav.settingsTabs(false),...nav.analyticsTabs(false)];
    expect(links.every(link=>availablePath(link.href,"money"))).toBe(true);
    expect(nav.investmentTabs(false)).toEqual([]);
    expect(nav.navGroups(false).every(group=>group.links.length>0)).toBe(true);
    expect(links.some(link=>link.href==="/buckets")).toBe(true);
    expect(links.some(link=>link.href==="/analytics/report")).toBe(true);
  });
});
