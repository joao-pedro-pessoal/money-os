import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkPassword, newSessionValue, readSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "../auth";

/**
 * The gate itself, which had no tests at all while it was the one module in the
 * app that preferred a default to a failure.
 *
 * `APP_SECRET` fell back to `"dev-secret-change-me"` and `APP_PASSWORD` to
 * `"changeme"`. Both are in a public AGPL repository, so an instance started
 * without a `.env` was open to anyone who found it — and the session cookie,
 * signed with the secret, was one line of code away for them.
 */

const saved = { secret: process.env.APP_SECRET, password: process.env.APP_PASSWORD };

beforeEach(() => {
  process.env.APP_SECRET = "a-secret-for-tests";
  process.env.APP_PASSWORD = "a-password-for-tests";
});

afterEach(() => {
  if (saved.secret === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = saved.secret;
  if (saved.password === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = saved.password;
});

describe("a missing secret is refused, never defaulted", () => {
  it("refuses to issue a session without APP_SECRET", async () => {
    delete process.env.APP_SECRET;
    await expect(newSessionValue()).rejects.toThrow(/APP_SECRET is not set/);
  });

  it("refuses to check a password without APP_PASSWORD", async () => {
    delete process.env.APP_PASSWORD;
    await expect(checkPassword("anything")).rejects.toThrow(/APP_PASSWORD is not set/);
  });

  /**
   * An empty string is what `${APP_SECRET:-}` in a compose file leaves behind,
   * and it is not a secret. Treating it as one would put the old hole back
   * through the one route that still reaches this code.
   */
  it("treats an empty or blank value as missing", async () => {
    process.env.APP_SECRET = "";
    await expect(newSessionValue()).rejects.toThrow(/APP_SECRET is not set/);

    process.env.APP_SECRET = "   ";
    await expect(newSessionValue()).rejects.toThrow(/APP_SECRET is not set/);
  });

  /**
   * The specific values that used to be the fallbacks. If either ever works
   * again without being set in the environment, this fails.
   */
  it("does not accept the old hard-coded defaults", async () => {
    delete process.env.APP_PASSWORD;
    await expect(checkPassword("changeme")).rejects.toThrow();

    delete process.env.APP_SECRET;
    await expect(newSessionValue()).rejects.toThrow();
  });
});

describe("a session", () => {
  const issued = new Date("2026-09-21T12:00:00Z");
  const later = (seconds: number) => new Date(issued.getTime() + seconds * 1000);

  it("is accepted as issued, and keeps working across restarts: nothing but the secret is needed", async () => {
    const value = await newSessionValue(issued);
    expect(await readSession(value, later(60))).toEqual({ valid: true, issuedAt: issued, renew: false });
  });

  /**
   * The old cookie was HMAC(secret, "authenticated"): one value for every
   * device and every login, so copying it once opened the site for good.
   */
  it("is different on every login", async () => {
    expect(await newSessionValue(issued)).not.toBe(await newSessionValue(issued));
  });

  it("is refused once it is older than the longest a session lasts", async () => {
    const value = await newSessionValue(issued);
    expect((await readSession(value, later(SESSION_MAX_AGE_SECONDS))).valid).toBe(true);
    expect((await readSession(value, later(SESSION_MAX_AGE_SECONDS + 1))).valid).toBe(false);
  });

  it("asks to be renewed after a day, so a session in use never runs out", async () => {
    const value = await newSessionValue(issued);
    expect(await readSession(value, later(24 * 3600 + 1))).toMatchObject({ valid: true, renew: true });
  });

  it("is refused when issued before every session was ended, and stands when issued in that second or after", async () => {
    const value = await newSessionValue(issued);
    expect((await readSession(value, later(10), later(5))).valid).toBe(false);
    expect((await readSession(value, later(10), issued)).valid).toBe(true);
  });

  it("is refused from a clock far in the future, and after the secret changes", async () => {
    const value = await newSessionValue(later(3600));
    expect((await readSession(value, issued)).valid).toBe(false);
    const good = await newSessionValue(issued);
    process.env.APP_SECRET = "a-different-secret-entirely";
    expect((await readSession(good, later(60))).valid).toBe(false);
  });

  it("is refused when any part is changed, including its date", async () => {
    const value = await newSessionValue(issued);
    const [version, when, nonce, signature] = value.split(".");
    const moved = [version, String(Number(when) + 86_400), nonce, signature].join(".");
    expect((await readSession(moved, later(60))).valid).toBe(false);
    expect((await readSession(value.slice(0, -1) + (value.endsWith("0") ? "1" : "0"), later(60))).valid).toBe(false);
  });

  /** The value every browser holds from before this change is no longer a session. */
  it("does not accept the old fixed value, or nothing", async () => {
    expect((await readSession("a".repeat(64), issued)).valid).toBe(false);
    expect((await readSession(undefined, issued)).valid).toBe(false);
    expect((await readSession("", issued)).valid).toBe(false);
  });

  it("never contains the secret", async () => {
    expect(await newSessionValue(issued)).not.toContain("a-secret-for-tests");
  });
});

describe("checkPassword", () => {
  it("accepts the configured password", async () => {
    expect(await checkPassword("a-password-for-tests")).toBe(true);
  });

  it("rejects a wrong one", async () => {
    expect(await checkPassword("not-it")).toBe(false);
  });

  /**
   * The comparison hashes both sides before comparing, and a prefix of the
   * right password must not be treated as the password.
   */
  it("rejects a prefix, a suffix and the empty string", async () => {
    expect(await checkPassword("a-password-for-test")).toBe(false);
    expect(await checkPassword("a-password-for-tests-and-more")).toBe(false);
    expect(await checkPassword("")).toBe(false);
  });
});

describe("SESSION_COOKIE_NAME", () => {
  /**
   * Changing this logs the user out with no explanation, so it is pinned
   * rather than left to a rename.
   */
  it("is moneyos_session", () => {
    expect(SESSION_COOKIE_NAME).toBe("moneyos_session");
  });
});
