import { describe, expect, it } from "vitest";
import { ATTEMPT_LIMITS, clientAddress, originOf, overLimit } from "../attempts";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("attempts per connection", () => {
  it("reads the address the host wrote, the first of a forwarded chain, or none", () => {
    expect(clientAddress(headers({ "x-real-ip": " 203.0.113.7 " }))).toBe("203.0.113.7");
    expect(clientAddress(headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientAddress(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.2" }))).toBe("203.0.113.7");
    expect(clientAddress(headers({}))).toBeNull();
    expect(clientAddress(headers({ "x-forwarded-for": " , " }))).toBeNull();
  });

  it("keeps a fingerprint, never the address, and one that depends on the app's secret", () => {
    const a = originOf("203.0.113.7", "secret-one");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(originOf("203.0.113.7", "secret-one"));
    expect(a).not.toBe(originOf("203.0.113.8", "secret-one"));
    expect(a).not.toBe(originOf("203.0.113.7", "secret-two"));
    expect(a).not.toContain("203");
  });

  it("refuses the attempt that would go over any window", () => {
    expect(overLimit("sign-in", [ATTEMPT_LIMITS["sign-in"][0].max - 1])).toBe(false);
    expect(overLimit("sign-in", [ATTEMPT_LIMITS["sign-in"][0].max])).toBe(true);
    expect(overLimit("sign-up", [4, 9])).toBe(false);
    expect(overLimit("sign-up", [5, 5])).toBe(true);
    expect(overLimit("sign-up", [0, 10])).toBe(true);
    expect(overLimit("recover", [])).toBe(false);
  });
});
