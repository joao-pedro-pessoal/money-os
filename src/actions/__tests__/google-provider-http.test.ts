import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import * as oidc from "openid-client";
import { googleAuthorizationUrl, googleCodeIdentity, googleTokenVerifier } from "../googleProvider";
import { GOOGLE_ISSUER, type GoogleConfiguration } from "@/lib/accounts/google";

let server: Server, origin: string, pair: Awaited<ReturnType<typeof generateKeyPair>>, verify: ReturnType<typeof googleTokenVerifier>, config: oidc.Configuration;
let tokenClaims: JWTPayload = {}, failKeys = false;
const requests: { path: string; body: string }[] = [];
const settings: GoogleConfiguration = { origin: "https://money.example.test", clientId: "web.apps.googleusercontent.com", clientSecret: "synthetic-only", androidClients: ["android.apps.googleusercontent.com"] };
async function token(extra: JWTPayload = {}) {
  return new SignJWT({ sub: "googleperson", email: "a@example.test", email_verified: true, nonce: "nonce-for-this-attempt", azp: settings.androidClients[0], ...extra })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(GOOGLE_ISSUER).setAudience(settings.clientId).setIssuedAt().setExpirationTime("5m").sign(pair.privateKey);
}
beforeAll(async () => {
  pair = await generateKeyPair("RS256", { extractable: true });
  const key = { ...await exportJWK(pair.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
  server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url!, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/keys") { res.statusCode = failKeys ? 503 : 200; res.end(JSON.stringify({ keys: [key] })); }
    else if (req.url === "/token") res.end(JSON.stringify({ token_type: "Bearer", access_token: "synthetic-unused-access-token", expires_in: 300, id_token: await token({ azp: settings.clientId, ...tokenClaims }) }));
    else { res.statusCode = 501; res.end("{}"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
  verify = googleTokenVerifier(createRemoteJWKSet(new URL(origin + "/keys"), { timeoutDuration: 500 }));
  config = new oidc.Configuration({ issuer: GOOGLE_ISSUER, authorization_endpoint: origin + "/authorize", token_endpoint: origin + "/token", jwks_uri: origin + "/keys", response_types_supported: ["code"], id_token_signing_alg_values_supported: ["RS256"] }, settings.clientId, settings.clientSecret);
  oidc.allowInsecureRequests(config); // Local stand-in only; production adapter has a fixed HTTPS Google issuer.
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("Google protocol against a local HTTP identity provider", () => {
  it("validates a signed native assertion by fetching JWKS over HTTP", async () => {
    expect(await verify(settings, await token(), "nonce-for-this-attempt")).toEqual({ subject: "googleperson", email: "a@example.test" });
    expect(requests.some(x => x.path === "/keys")).toBe(true);
  });
  it.each([
    { aud: "another.apps.googleusercontent.com" }, { iss: "https://attacker.example.test" }, { exp: 1 }, { iat: 1 },
    { nonce: "another-attempt" }, { azp: "another-android-client" }, { email_verified: false }, { sub: "" },
  ])("rejects invalid native claims %j", async extra => {
    // Explicit setters in token() establish normal iss/aud/time; replace them in the final signed payload here.
    const good = { sub: "googleperson", email: "a@example.test", email_verified: true, nonce: "nonce-for-this-attempt", iss: GOOGLE_ISSUER, aud: settings.clientId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...extra };
    const invalid = await new SignJWT(good).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(pair.privateKey);
    await expect(verify(settings, invalid, "nonce-for-this-attempt")).rejects.toThrow();
  });
  it("rejects a valid-looking token signed with another private key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ sub: "googleperson", email: "a@example.test", email_verified: true, nonce: "nonce-for-this-attempt" }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(GOOGLE_ISSUER).setAudience(settings.clientId).setIssuedAt().setExpirationTime("5m").sign(other.privateKey);
    await expect(verify(settings, forged, "nonce-for-this-attempt")).rejects.toThrow();
  });
  it("refuses an unavailable key service without accepting the token", async () => {
    failKeys = true;
    try { await expect(googleTokenVerifier(createRemoteJWKSet(new URL(origin + "/keys")))(settings, await token(), "nonce-for-this-attempt")).rejects.toThrow(); }
    finally { failKeys = false; }
  });
  it("requests only identity/email with state, nonce and S256 PKCE", async () => {
    const url = new URL(await googleAuthorizationUrl(settings, "request-state", "nonce-for-this-attempt", "v".repeat(64), config));
    expect(url.searchParams.get("scope")).toBe("openid email"); expect(url.searchParams.get("state")).toBe("request-state");
    expect(url.searchParams.get("nonce")).toBe("nonce-for-this-attempt"); expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBeNull(); expect(url.searchParams.has("client_secret")).toBe(false);
  });
  it("exchanges the web code with PKCE through the actual HTTP adapter", async () => {
    tokenClaims = {};
    expect(await googleCodeIdentity(settings, new URL(settings.origin + "/api/auth/google/callback?code=synthetic-code&state=request-state"), "request-state", "nonce-for-this-attempt", "v".repeat(64), config)).toEqual({ subject: "googleperson", email: "a@example.test" });
    const request = requests.filter(x => x.path === "/token").at(-1)!;
    expect(new URLSearchParams(request.body).get("code_verifier")).toBe("v".repeat(64));
  });
  it("rejects web state substitution before token exchange", async () => {
    const before = requests.filter(x => x.path === "/token").length;
    await expect(googleCodeIdentity(settings, new URL(settings.origin + "/api/auth/google/callback?code=x&state=attacker"), "request-state", "nonce-for-this-attempt", "v".repeat(64), config)).rejects.toThrow();
    expect(requests.filter(x => x.path === "/token")).toHaveLength(before);
  });
  it("rejects a token response with the wrong nonce", async () => {
    tokenClaims = { nonce: "wrong-nonce" };
    try { await expect(googleCodeIdentity(settings, new URL(settings.origin + "/api/auth/google/callback?code=x&state=request-state"), "request-state", "nonce-for-this-attempt", "v".repeat(64), config)).rejects.toThrow(); }
    finally { tokenClaims = {}; }
  });
});
