import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const init=vi.hoisted(()=>vi.fn());
vi.mock("botid/client/core",()=>({initBotId:init}));
beforeEach(()=>{vi.resetModules();init.mockClear();});
afterEach(()=>vi.unstubAllEnvs());
describe("registration-only BotID client",()=>{
  it("protects only the dedicated registration POST with Basic",async()=>{
    vi.stubEnv("NEXT_PUBLIC_REGISTRATION_BOT_PROTECTION","1");await import("../../../instrumentation-client");
    expect(init).toHaveBeenCalledExactlyOnceWith({protect:[{path:"/api/register",method:"POST",advancedOptions:{checkLevel:"basic"}}]});
  });
  it("does not initialise challenges in a home/local build",async()=>{
    vi.stubEnv("NEXT_PUBLIC_REGISTRATION_BOT_PROTECTION","0");await import("../../../instrumentation-client");expect(init).not.toHaveBeenCalled();
  });
  it.each(["1", ""])("derives the public activation flag from the build host (%s)",async marker=>{
    vi.stubEnv("VERCEL",marker);const config=(await import("../../../../next.config")).default;
    expect(config.env?.NEXT_PUBLIC_REGISTRATION_BOT_PROTECTION).toBe(marker==="1"?"1":"0");
  });
});
