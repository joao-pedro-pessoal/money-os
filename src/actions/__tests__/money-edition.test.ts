import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ reads:0 }));
vi.mock("@/db/client",()=>({get db(){ boundary.reads++; throw new Error("Database must not be reached"); }}));
const mutations: [string,string,unknown[]][] = [];
beforeAll(async()=>{
  vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION","money");
  vi.resetModules();
  for(const [module,names] of [
    ["investments",["createHolding","setHoldingTags","updateHolding","updateHoldingPrice","deleteHolding","addRewards","reinforceHolding","sellHolding"]],
    ["connections",["setPositionTags","createConnection","deleteConnection","convertToManual","syncConnection","syncAllConnections"]],
    ["brokerImport",["previewBrokerStatement","importBrokerStatement","adoptStatementPositions","adoptAllStatements"]],
    ["playlists",["createPlaylist","updatePlaylist","deletePlaylist","addWatchlistItem","updateWatchlistItem","deleteWatchlistItem"]],
    ["benchmark",["setBenchmarkChoice","refreshBenchmark"]],
    ["quotes",["checkQuoteSymbol","fetchYahooQuote","setQuoteSymbol","refreshQuotedPrices","findSymbolForIsin","autoPriceHoldings","probeIbkrQuotes","forgetFoundPrices","autoRefreshPricesAction"]],
    ["purpose",["setHoldingAllocation","removeHoldingAllocation"]],
    ["assetInfo",["getAssetInfo","saveAssetNote"]],
    ["assetSearch",["searchAssets"]],
    ["export",["exportHoldingsCsv"]],
    ["symbolNames",["setSymbolName"]],
  ] as const) {
    const actions = await import(`../${module}.ts`);
    for(const name of names)mutations.push([module,name,[actions[name]]]);
  }
});
afterAll(()=>{vi.unstubAllEnvs();vi.resetModules();});
describe("money edition server boundary",()=>{
  it("refuses direct investment actions before accessing data or providers",async()=>{
    const fetch = vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("No network allowed"));
    expect(mutations).toHaveLength(42);
    for(const [module,name,[action]] of mutations) {
      await expect((action as (form:FormData)=>Promise<unknown>)(new FormData()),module+"."+name).rejects.toThrow("Investments are not available");
    }
    expect(boundary.reads).toBe(0);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
});
