import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ reads:0,actor:"other" as string|null }));
vi.mock("@/db/client",()=>({get db(){ boundary.reads++; throw new Error("Database must not be reached"); }}));
vi.mock("@/actions/session",()=>({currentUserId:async(required?:string)=>required&&boundary.actor!==required?null:boundary.actor,hasSession:async()=>boundary.actor!==null}));
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
      const form=new FormData();form.set("userId","owner");form.set("edition","full");
      await expect((action as (form:FormData)=>Promise<unknown>)(form),module+"."+name).rejects.toThrow("Investments are not available");
    }
    expect(boundary.reads).toBe(0);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
});

describe("C2 edition follows the server identity",()=>{
  it("grants the exact owner and refuses lookalikes, ordinary accounts and anonymous requests",async()=>{
    const {investmentsFor}=await import("../releaseEdition");
    expect(investmentsFor("owner")).toBe(true);
    for(const id of [null,"other","owner-other","OWNER"])expect(investmentsFor(id)).toBe(false);
  });
  it("does not share the edition between consecutive people",async()=>{
    const {currentInvestments}=await import("../releaseEdition");
    for(const [actor,expected] of [["owner",true],["other",false],[null,false],["owner",true]] as const){boundary.actor=actor;expect(await currentInvestments()).toBe(expected);}
  });
  it("allows the owner's action to reach its owned-data check",async()=>{
    boundary.actor="owner";const {setSymbolName}=await import("../symbolNames");const data=new FormData();data.set("symbol","TEST");data.set("name","Synthetic name");
    await expect(setSymbolName(data)).rejects.toThrow("Database must not be reached");
  });
  it("keeps the full build's existing feature availability",async()=>{
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION","full");vi.resetModules();boundary.actor=null;
    const {investmentsFor,requireInvestments}=await import("../releaseEdition");
    expect(investmentsFor(null)).toBe(true);expect(investmentsFor("other")).toBe(true);await expect(requireInvestments()).resolves.toBeUndefined();
  });
});
