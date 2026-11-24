import { describe, expect, it } from "vitest";
import { authBody } from "../authHttp";
import { GOOGLE_ERRORS, googleConfiguration, safeGoogleError } from "@/lib/accounts/google";
const origin = "https://money.example.test";
const request = (body: string, headers: Record<string, string> = {}) => new Request(origin + "/api/auth/google/start", { method: "POST", headers: { origin, "Content-Type": "application/json", ...headers }, body });
describe("Google HTTP boundaries", () => {
  it("accepts bounded same-origin JSON", async () => { expect(await authBody(request('{"intent":"login"}'), origin)).toEqual({ intent: "login" }); });
  it.each(["null", "https://attacker.example.test", "https://money.example.test.attacker.test"])("refuses Origin %s", async supplied => { await expect(authBody(request("{}", { origin: supplied }), origin)).rejects.toThrow(); });
  it("refuses cross-site navigation and wrong content type", async () => {
    await expect(authBody(request("{}", { "sec-fetch-site": "cross-site" }), origin)).rejects.toThrow();
    await expect(authBody(request("{}", { "Content-Type": "text/plain" }), origin)).rejects.toThrow();
  });
  it("bounds the streamed body even with no Content-Length", async () => {
    await expect(authBody(request(JSON.stringify({ value: "a".repeat(17000) })), origin)).rejects.toThrow("large");
  });
  it("allows opaque native POST origins only on the capability-checked native protocol", async () => {
    const native = request("id=public-correlation&verifier=synthetic-proof", { origin: "null", "Content-Type": "application/x-www-form-urlencoded" });
    expect(await authBody(native, origin, true, true)).toEqual({ id: "public-correlation", verifier: "synthetic-proof" });
    await expect(authBody(request("{}", { origin: "https://attacker.example.test" }), origin, false, true)).rejects.toThrow();
  });
  it("does not expose provider, database or token diagnostics", () => {
    expect(safeGoogleError(new Error("id_token=private; postgres password=private"))).toBe(GOOGLE_ERRORS.failed);
    expect(safeGoogleError(new Error(GOOGLE_ERRORS.conflict))).toBe(GOOGLE_ERRORS.conflict);
  });
  it("requires complete, explicitly enabled canonical configuration", () => {
    const env = { GOOGLE_LOGIN_ENABLED: "true", GOOGLE_AUTH_ORIGIN: origin, GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "synthetic-only" };
    expect(googleConfiguration(env)?.origin).toBe(origin);
    for (const value of [origin + "/", origin + "/path", "http://remote.example.test", "https://user:pass@money.example.test"]) expect(googleConfiguration({ ...env, GOOGLE_AUTH_ORIGIN: value })).toBeNull();
    expect(googleConfiguration({ ...env, GOOGLE_LOGIN_ENABLED: "false" })).toBeNull();
    expect(googleConfiguration({ ...env, GOOGLE_CLIENT_SECRET: "" })).toBeNull();
    expect(googleConfiguration({ ...env, GOOGLE_AUTH_ORIGIN: "http://localhost:3000", VERCEL: "1" })).toBeNull();
  });
});
