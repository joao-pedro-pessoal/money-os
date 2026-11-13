import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("session endpoint boundaries", () => {
  it("does not expose the arbitrary-account revocation reader as a Server Action", () => {
    const source = readFileSync("src/actions/session.ts", "utf8");
    expect(source).not.toMatch(/export\s+async\s+function\s+sessionsNotBefore\s*\(/);
    const helper = readFileSync("src/actions/sessionRevocation.ts", "utf8");
    expect(helper).not.toMatch(/^\s*["']use server["'];/m);
  });

  it("keeps the internal balance snapshot writer out of the public action surface", () => {
    const source = readFileSync("src/actions/snapshots.ts", "utf8");
    expect(source).not.toMatch(/^\s*["']use server["'];/m);
  });
});
