import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieOptions } from "../auth";

afterEach(() => vi.unstubAllEnvs());

describe("session transport on the hosted site", () => {
  it("always requires HTTPS on Vercel even when COOKIE_SECURE is missing", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("COOKIE_SECURE", undefined);
    expect(sessionCookieOptions()).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  });

  it("cannot disable HTTPS cookies on Vercel through a copied home configuration", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it("keeps the home copy usable over local HTTP", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("supports HTTPS when self hosted", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("COOKIE_SECURE", "true");
    expect(sessionCookieOptions().secure).toBe(true);
  });
});
