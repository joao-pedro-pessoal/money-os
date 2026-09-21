import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterFailedLogin, lockedUntil, MAX_FAILED_LOGINS } from "../vault/protocol";

/**
 * The site's password is only ever checked through the limit on guessing.
 *
 * `checkPassword` answers as fast as it is asked. `attemptSiteLogin` wraps it
 * with the vault's lockout, and the protection holds only while nothing else
 * calls it — a second login route, or a settings screen asking for the
 * password again, would be an unlimited way round. Nothing in a review makes
 * that visible, so this test does.
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
      .filter((file) => /\bcheckPassword\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).replace(/\\/g, "/"))
      .sort();
    expect(callers).toEqual(["actions/siteLogin.ts", "lib/auth.ts"]);
  });

  it("goes through the limited login from the form", () => {
    const form = readFileSync(join(SRC, "app/login/actions.ts"), "utf8");
    expect(form).toContain("attemptSiteLogin(");
  });

  /** The policy is the vault's; these are the two facts the login page relies on. */
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
