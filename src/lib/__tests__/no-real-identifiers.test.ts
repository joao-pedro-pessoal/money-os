import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No real account identifier goes in the source.
 *
 * This repository is public. A real Interactive Brokers account number sat in
 * a test fixture for months, because it was the number in front of whoever
 * wrote the test and nothing objected. It is not a credential and cannot sign
 * anything in on its own — but it identifies a person to their broker, which is
 * exactly what a convincing phone call needs.
 *
 * The fixtures that matter here are about *shape*: seven digits, eight digits,
 * a `DU` prefix. Any number has those, so a real one buys nothing.
 *
 * Deliberately narrow. It checks the identifier formats this app actually
 * accepts rather than trying to detect "personal data" in general, because a
 * guard that fires on ordinary code gets switched off.
 */

const SRC = join(process.cwd(), "src");

/** The ids the fixtures are allowed to use. Invented, and obviously so. */
const ALLOWED = new Set([
  "U1234567",
  "U12345678",
  "DU1234567",
  "DU12345678",
  "u1234567",
  "U0000000",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe("no real identifier is committed", () => {
  /**
   * IBKR issues `U` followed by seven or eight digits, `DU` for paper. Matched
   * inside quotes only, so prose and a regex in the parser itself are left
   * alone.
   */
  it("uses invented Interactive Brokers account ids", () => {
    // `D?U` — optional D, mandatory U. Written `DU?` first, which demands the
    // D and so matched no live account at all; the guard passed against a real
    // id planted to test it, which is the only reason that was noticed.
    const pattern = /["'`](D?U\d{7,8})["'`]/gi;
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(source)) !== null) {
        if (ALLOWED.has(m[1])) continue;
        offenders.push(`${file.replace(SRC, "src")}: ${m[1]}`);
      }
    }

    expect(
      offenders,
      "an account id that is not one of the invented ones — if it is real, remove it"
    ).toEqual([]);
  });

  /**
   * A wallet address is worse than an account number: chains are public, so one
   * turns into every position and every trade that address has ever made,
   * permanently. The Hyperliquid fixtures use an invented address; this keeps it
   * that way by allowing exactly one.
   */
  it("uses only the invented wallet addresses in fixtures", () => {
    /**
     * Two, both plainly fake: the Hyperliquid fixture, and the counting
     * pattern the exchange key checks use to prove they reject a pasted
     * address. A third appearing is the thing worth stopping.
     */
    const invented = [
      "0x1234567890abcdef1234567890abcdef12345678",
      "0xb65822a30bbaaa68942d6f4c43d78704faeabbbb",
    ];
    const pattern = /0x[a-f0-9]{40}/gi;
    const found = new Set<string>();

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.match(pattern) ?? []) found.add(match.toLowerCase());
    }

    expect(
      [...found].sort().filter((a) => !invented.includes(a)),
      "a wallet address that is not one of the invented ones — if it is real, remove it"
    ).toEqual([]);
  });
});
