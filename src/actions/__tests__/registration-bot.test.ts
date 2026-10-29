import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  check: vi.fn(), admitted: vi.fn(), select: vi.fn(() => { throw new Error("account lookup reached"); }),
}));
vi.mock("botid/server", () => ({ checkBotId: fake.check }));
vi.mock("@/db/client", () => ({ db: { select: fake.select }, asUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../session", () => ({ currentUserId: vi.fn() }));
vi.mock("../fx", () => ({ refreshRates: vi.fn() }));
vi.mock("../attemptGate", () => ({ admitted: fake.admitted }));
import { registrationBotRefusal } from "../registrationBot";
import { signUp } from "../auth";
import { REGISTRATION_BOT_REFUSED } from "@/lib/accounts/botProtection";

const human = { isHuman: true, isBot: false, isVerifiedBot: false, bypassed: false };
beforeEach(() => {
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("REGISTRATION_MODE", "open");
  fake.check.mockReset().mockResolvedValue(human); fake.admitted.mockReset().mockResolvedValue(true); fake.select.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("hosted registration BotID verification", () => {
  it("accepts a human proof and explicitly requests Basic", async () => {
    expect(await registrationBotRefusal()).toBeNull();
    expect(fake.check).toHaveBeenCalledWith({ advancedOptions: { checkLevel: "basic" } });
  });
  it.each([
    { ...human, isHuman: false, isBot: true }, { ...human, isVerifiedBot: true },
    { ...human, bypassed: true }, { ...human, isHuman: false },
    { ...human, isBot: undefined }, {}, null,
  ])("refuses bots, bypassed or malformed verification results %j", async result => {
    fake.check.mockResolvedValue(result);
    expect(await registrationBotRefusal()).toBe(REGISTRATION_BOT_REFUSED);
  });
  it("refuses service/OIDC failures without returning diagnostic details", async () => {
    fake.check.mockRejectedValue(new Error("private-OIDC-diagnostic"));
    expect(await registrationBotRefusal()).toBe(REGISTRATION_BOT_REFUSED);
  });
  it.each(["", "0"])("does not contact BotID for the home installation (%s)", async marker => {
    vi.stubEnv("VERCEL",marker); expect(await registrationBotRefusal()).toBeNull();
    expect(fake.check).not.toHaveBeenCalled();
  });
  it("rejects a direct signUp action call before looking up accounts", async () => {
    fake.check.mockResolvedValue({...human,isHuman:false,isBot:true});
    expect(await signUp({email:"tester@example.test",signInKey:"a".repeat(64)})).toEqual({kind:"refused",reason:REGISTRATION_BOT_REFUSED});
    expect(fake.select).not.toHaveBeenCalled();
    expect(fake.admitted).toHaveBeenCalledWith("sign-up");
  });
  it("continues to normal account checks after a valid proof", async () => {
    await expect(signUp({email:"tester@example.test",signInKey:"a".repeat(64)})).rejects.toThrow("account lookup reached");
    expect(fake.check).toHaveBeenCalledTimes(1); expect(fake.select).toHaveBeenCalledTimes(1);
  });
  it("enforces invitations before asking the verification service", async () => {
    vi.stubEnv("REGISTRATION_MODE","invite"); vi.stubEnv("REGISTRATION_INVITE_CODE","0123456789abcdef".repeat(3));
    expect((await signUp({email:"tester@example.test",signInKey:"a".repeat(64)})).kind).toBe("refused");
    expect(fake.check).not.toHaveBeenCalled(); expect(fake.select).not.toHaveBeenCalled();
  });
  it("enforces the per-origin rate limit before BotID or account lookup", async () => {
    fake.admitted.mockResolvedValue(false);
    expect((await signUp({email:"tester@example.test",signInKey:"a".repeat(64)})).kind).toBe("refused");
    expect(fake.check).not.toHaveBeenCalled(); expect(fake.select).not.toHaveBeenCalled();
  });
  it("keeps the honeypot rejection before any BotID or account lookup", async () => {
    expect((await signUp({email:"tester@example.test",signInKey:"a".repeat(64),website:"robot"})).kind).toBe("refused");
    expect(fake.check).not.toHaveBeenCalled(); expect(fake.select).not.toHaveBeenCalled();
  });
});
