import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkPassword, expectedSessionValue, SESSION_COOKIE_NAME } from "../auth";

/**
 * The gate itself, which had no tests at all while it was the one module in the
 * app that preferred a default to a failure.
 *
 * `APP_SECRET` fell back to `"dev-secret-change-me"` and `APP_PASSWORD` to
 * `"changeme"`. Both are in a public AGPL repository, so an instance started
 * without a `.env` was open to anyone who found it — and the session cookie,
 * being a pure function of the secret, was one line of code away for them.
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
  it("refuses to derive a session value without APP_SECRET", async () => {
    delete process.env.APP_SECRET;
    await expect(expectedSessionValue()).rejects.toThrow(/APP_SECRET is not set/);
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
    await expect(expectedSessionValue()).rejects.toThrow(/APP_SECRET is not set/);

    process.env.APP_SECRET = "   ";
    await expect(expectedSessionValue()).rejects.toThrow(/APP_SECRET is not set/);
  });

  /**
   * The specific values that used to be the fallbacks. If either ever works
   * again without being set in the environment, this fails.
   */
  it("does not accept the old hard-coded defaults", async () => {
    delete process.env.APP_PASSWORD;
    await expect(checkPassword("changeme")).rejects.toThrow();

    delete process.env.APP_SECRET;
    await expect(expectedSessionValue()).rejects.toThrow();
  });
});

describe("expectedSessionValue", () => {
  it("is stable for one secret, so a cookie keeps working across restarts", async () => {
    expect(await expectedSessionValue()).toBe(await expectedSessionValue());
  });

  it("changes with the secret, so rotating APP_SECRET logs everyone out", async () => {
    const before = await expectedSessionValue();
    process.env.APP_SECRET = "a-different-secret-entirely";
    expect(await expectedSessionValue()).not.toBe(before);
  });

  it("is a hex digest, never the secret itself", async () => {
    const value = await expectedSessionValue();
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(value).not.toContain("a-secret-for-tests");
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
