import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { endedBy, newSessionValue, readSession, SESSION_COOKIE_NAME } from "../auth";
const race = vi.hoisted(() => ({ recoverWhileReading: true }));
vi.mock("@/actions/session", () => ({ currentUserId: async () => null, hasSession: async () => false }));
vi.mock("@/actions/sessionRevocation", () => ({ sessionsNotBefore: async () => {
  if (race.recoverWhileReading) vi.setSystemTime(new Date("2026-11-11T12:00:01Z"));
  return null; // Snapshot read just before a concurrent recovery committed.
} }));
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.stubEnv("APP_SECRET", "synthetic-secret-for-proxy-race");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  race.recoverWhileReading = true;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function renew() {
  const value = await newSessionValue("tester", new Date("2026-11-09T12:00:00Z"));
  const response = await proxy(new NextRequest("http://synthetic.invalid/accounts", { headers: { cookie: `${SESSION_COOKIE_NAME}=${value}` } }));
  const renewed = response.cookies.get(SESSION_COOKIE_NAME)?.value;
  expect(renewed).toBeTruthy();
  return readSession(renewed);
}
describe("proxy renewal cannot revive a session during recovery", () => {
  it("keeps a renewal older than a cutoff committed while the request was waiting", async () => {
    const session = await renew();
    expect(session.valid).toBe(true);
    if (session.valid) expect(endedBy(new Date("2026-11-11T12:00:00.900Z"), session.issuedAt)).toBe(true);
  });
  it("continues to renew a valid session when no recovery happens", async () => {
    race.recoverWhileReading = false;
    const session = await renew();
    expect(session).toMatchObject({ valid: true, userId: "tester", issuedAt: new Date("2026-11-11T12:00:00Z") });
  });
});
