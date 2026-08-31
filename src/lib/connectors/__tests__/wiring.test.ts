import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { PLATFORM_LABELS, PLATFORM_SETUP } from "../constants";
import { platformOptions } from "../catalogue";

/**
 * A platform is wired in four places, and being in three of them is worse than
 * being in none.
 *
 * `PLATFORM_LABELS` puts it in the picker, `PLATFORM_SETUP` tells you what it
 * needs, `NEEDS_SECRET` decides whether the credential is encrypted, and the
 * `switch` in `actions/connections.ts` is what actually builds the connector.
 * Miss the last one and the platform is offered, accepted, saved — and throws
 * "No connector for platform" on the first sync, long after the point where
 * anyone could tell what went wrong.
 *
 * Missing `NEEDS_SECRET` is worse still: the secret is then stored without
 * being encrypted, which is a silent downgrade of the one promise this app
 * makes about credentials.
 */

const root = path.resolve(__dirname, "../../../..");
const connections = readFileSync(path.join(root, "src/actions/connections.ts"), "utf8");

const platforms = Object.keys(PLATFORM_LABELS);

/** The set is a module-private const, so it is read from the source. */
function needsSecretSet(): Set<string> {
  const match = connections.match(/const NEEDS_SECRET = new Set\(\[([^\]]*)\]\)/);
  if (match === null) throw new Error("NEEDS_SECRET is no longer where this test looks for it");
  return new Set([...match[1].matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]));
}

describe("every platform offered is a platform that works", () => {
  it("has more than one, or this test is proving nothing", () => {
    expect(platforms.length).toBeGreaterThan(1);
  });

  it("explains what each one needs before you fill the form in", () => {
    const undocumented = platforms.filter((p) => PLATFORM_SETUP[p] === undefined);
    expect(undocumented, "offered in the picker with no setup instructions").toEqual([]);
  });

  it("builds a connector for each one", () => {
    const unbuilt = platforms.filter((p) => !connections.includes(`case "${p}":`));
    expect(
      unbuilt,
      'offered and saveable, but `connectorFor` has no case — the first sync throws "No connector for platform"'
    ).toEqual([]);
  });

  /**
   * The two lists that decide credential handling must agree. If a platform
   * declares `needsSecret` and is absent from `NEEDS_SECRET`, its secret is
   * stored in plaintext.
   */
  it("encrypts the secret of every platform that needs one", () => {
    const needsSecret = needsSecretSet();
    const unprotected = platforms.filter(
      (p) => PLATFORM_SETUP[p]?.needsSecret && !needsSecret.has(p)
    );
    expect(unprotected, "declares a secret but is not in NEEDS_SECRET").toEqual([]);
  });

  it("does not demand encryption for a platform that stores nothing", () => {
    const needsSecret = needsSecretSet();
    const overprotected = [...needsSecret].filter((p) => PLATFORM_SETUP[p]?.needsSecret !== true);
    expect(overprotected, "in NEEDS_SECRET but declares no secret").toEqual([]);
  });

  it("gives each one steps someone could actually follow", () => {
    for (const p of platforms) {
      expect(PLATFORM_SETUP[p].steps.length, p).toBeGreaterThan(0);
      expect(PLATFORM_SETUP[p].help.length, p).toBeGreaterThan(20);
    }
  });

  it("shows every platform in the picker, connected or not", () => {
    expect(platformOptions([]).map((o) => o.platform).sort()).toEqual([...platforms].sort());
  });
});
