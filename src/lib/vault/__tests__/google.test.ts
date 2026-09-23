import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  googleConfig,
  GoogleSignInError,
  identityFrom,
  idTokenPayload,
  startValues,
  tokenRequestBody,
} from "../google";

const config = { clientId: "id.apps.googleusercontent.com", clientSecret: "secret", redirectUri: "https://money.example/api/vault/google/callback" };
const now = new Date("2026-09-23T12:00:00Z");
const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: config.clientId,
  nonce: "n1",
  sub: "1234567890",
  email: "Alguem@Gmail.com",
  email_verified: true,
  exp: Math.floor(now.getTime() / 1000) + 300,
  ...over,
});

describe("starting a sign-in", () => {
  it("asks only who the person is, and ties the answer to this request", async () => {
    const values = await startValues((n) => crypto.getRandomValues(new Uint8Array(n)));
    const url = new URL(authorizeUrl(config, values));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(values.state);
    expect(url.searchParams.get("nonce")).toBe(values.nonce);
    // The verifier stays here: only its hash travels.
    expect(url.toString()).not.toContain(values.verifier);
  });

  it("exchanges the code with the secret and the verifier", () => {
    const body = new URLSearchParams(tokenRequestBody(config, "the-code", "the-verifier"));
    expect(Object.fromEntries(body)).toMatchObject({
      code: "the-code",
      code_verifier: "the-verifier",
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });
  });

  it("is off until this server is given a client", () => {
    expect(googleConfig({}, "https://money.example")).toBeNull();
    const ready = googleConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }, "https://money.example");
    expect(ready?.redirectUri).toBe("https://money.example/api/vault/google/callback");
  });
});

describe("what Google answers", () => {
  const token = (payload: Record<string, unknown>) =>
    `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

  it("takes the person's stable id and address", () => {
    expect(identityFrom(idTokenPayload(token(claims())), { clientId: config.clientId, nonce: "n1" }, now)).toEqual({
      subject: "1234567890",
      email: "alguem@gmail.com",
    });
  });

  it("refuses a token for another application, another sign-in, or one out of date", () => {
    const check = (payload: Record<string, unknown>, nonce = "n1") =>
      identityFrom(payload, { clientId: config.clientId, nonce }, now);
    expect(() => check(claims({ aud: "someone-else" }))).toThrow(/another application/);
    expect(() => check(claims(), "other")).toThrow(/does not answer/);
    expect(() => check(claims({ exp: Math.floor(now.getTime() / 1000) - 1 }))).toThrow(/expired/);
    expect(() => check(claims({ iss: "https://evil.example" }))).toThrow(/did not come from Google/);
    expect(() => check(claims({ email_verified: false }))).toThrow(/confirmed email/);
    expect(() => check(claims({ sub: undefined }))).toThrow(GoogleSignInError);
  });

  it("refuses something that is not a token at all", () => {
    expect(() => idTokenPayload("not-a-token")).toThrow(GoogleSignInError);
  });
});
