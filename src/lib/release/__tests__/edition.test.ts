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
  it.each(["/investments","/investments/asset/AAPL","/investments/history?year=2026","/positions","/connections","/settings/names","/statistics","/library","/api/sync"])("blocks deferred destinations in the money edition (%s)",path => {
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
    const links = [...nav.NAV_GROUPS.flatMap(group=>group.links),...nav.SEARCHABLE_PAGES,...nav.SETTINGS_TABS,...nav.ANALYTICS_TABS];
    expect(links.every(link=>availablePath(link.href,"money"))).toBe(true);
    expect(nav.INVESTMENT_TABS).toEqual([]);
    expect(nav.NAV_GROUPS.every(group=>group.links.length>0)).toBe(true);
    expect(links.some(link=>link.href==="/buckets")).toBe(true);
    expect(links.some(link=>link.href==="/analytics/report")).toBe(true);
  });
});
