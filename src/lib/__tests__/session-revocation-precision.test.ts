import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endedBy, newSessionValue, readSession } from "../auth";

const secret = "synthetic-secret-for-precision-regressions";
beforeEach(() => vi.stubEnv("APP_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());

describe("password recovery revokes earlier sessions with millisecond precision", () => {
  it("ends a session issued earlier in the same second", () => {
    expect(endedBy(new Date("2026-11-11T12:00:00.900Z"), new Date("2026-11-11T12:00:00.000Z"))).toBe(true);
  });
  it("preserves the exact issue time in a freshly signed cookie", async () => {
    const issued = new Date("2026-11-11T12:00:00.900Z");
    const checked = await readSession(await newSessionValue("tester", issued), new Date("2026-11-11T12:00:01Z"));
    expect(checked).toMatchObject({ valid: true, userId: "tester", issuedAt: issued });
  });
  it("keeps the session issued at the cutoff valid while ending a predecessor", async () => {
    const cutoff = new Date("2026-11-11T12:00:00.900Z");
    const checked = await readSession(await newSessionValue("tester", cutoff), new Date("2026-11-11T12:00:01Z"));
    expect(checked.valid).toBe(true);
    if (checked.valid) expect(endedBy(cutoff, checked.issuedAt)).toBe(false);
    expect(endedBy(cutoff, new Date(cutoff.getTime() - 1))).toBe(true);
  });
  it("still accepts an unrevoked v3 cookie without forcing an unrelated logout", async () => {
    const issued = new Date("2026-11-11T12:00:00Z");
    const body = `v3.tester.${issued.getTime() / 1000}.${"0".repeat(32)}`;
    const signature = createHmac("sha256", secret).update(`session|${body}`).digest("hex");
    expect(await readSession(`${body}.${signature}`, new Date("2026-11-11T12:01:00Z"))).toMatchObject({ valid: true, userId: "tester", issuedAt: issued });
  });
});
