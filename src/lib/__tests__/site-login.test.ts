import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterFailedLogin, lockedUntil, MAX_FAILED_LOGINS } from "../accounts/limits";

/**
 * Passwords are only ever checked through the limit on guessing, and sessions
 * only ever handed out after one.
 *
 * `ownerPassword` hands the owner's password to whoever asks, and the sign-in
 * actions count wrong attempts against the account. The protection holds only
 * while nothing else asks and nothing else hands out a session — a second
 * sign-in route, or a settings screen issuing a cookie, would be an unlimited
 * way round. Nothing in a review makes that visible, so this test does.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "__tests__") out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe("the site's login", () => {
  it("checks the password only inside the limited login", () => {
    const callers = sourceFiles(SRC)
      .filter((file) => /\bownerPassword\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).replace(/\\/g, "/"))
      .sort();
    expect(callers).toEqual(["actions/auth.ts", "lib/auth.ts"]);
  });

  /**
   * A session is handed out in three places: the sign-in actions after the
   * password or the recovery code, the proxy renewing one it has just checked,
   * and "Log out other devices" re-signing the device that pressed it. Every
   * export of a "use server" module is an endpoint anyone can call, so a
   * fourth — or the helper in auth.ts becoming an export — would give a
   * session to whoever asked for one.
   */
  it("issues a session only after a password or an existing session", () => {
    const issuers = sourceFiles(SRC)
      .filter((file) => /\.set\(\s*SESSION_COOKIE_NAME/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).replace(/\\/g, "/"))
      .sort();
    expect(issuers).toEqual(["actions/auth.ts", "actions/session.ts", "proxy.ts"]);
    const auth = readFileSync(join(SRC, "actions/auth.ts"), "utf8");
    expect(auth).not.toMatch(/export\s+(async\s+)?function\s+startSession/);
  });

  it("counts wrong attempts and honours a lockout in every sign-in action", () => {
    const auth = readFileSync(join(SRC, "actions/auth.ts"), "utf8");
    for (const action of ["claimOwner", "signIn", "recoverAccount", "replaceRecoveryCode"]) {
      const body = auth.slice(auth.indexOf(`function ${action}(`));
      const end = body.indexOf("\n}\n");
      expect(body.slice(0, end), action).toContain("lockedUntil(");
      expect(body.slice(0, end), action).toContain("countFailure(");
    }
  });

  /** The two facts the sign-in page relies on. */
  it("locks on the tenth wrong password, and opens again after the lockout", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    let failed = 0;
    let lock: Date | null = null;
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      expect(lock).toBeNull();
      ({ failedLogins: failed, lockedUntil: lock } = afterFailedLogin(failed, now));
    }
    expect(lock).not.toBeNull();
    expect(lockedUntil({ lockedUntil: lock }, now)).toEqual(lock);
    expect(lockedUntil({ lockedUntil: lock }, new Date(lock!.getTime() + 1))).toBeNull();
  });
});
