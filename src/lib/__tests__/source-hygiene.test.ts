import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * Things that make a source file stop being a source file.
 *
 * A literal NUL byte reached `lib/portfolio/dividendSource.ts` — written as a
 * map-key separator, which it does perfectly well. It compiled, 1 911 tests
 * passed, eslint was clean, and the app ran. What it broke was everything
 * *around* the code: git called the file binary and stopped producing diffs
 * and blame, and grep skipped it. The defect was invisible in every tool that
 * looks at behaviour, because behaviour was fine.
 *
 * It came from an escape that did not survive being written through a shell —
 * `\\u0000` arriving as the byte rather than as the six characters. That is a
 * mistake a person can make once and a script can make silently, which is
 * exactly what a cheap check is for.
 */

const root = path.resolve(__dirname, "../../..");
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "coverage"]);
const TEXT = /\.(ts|tsx|css|json|md|mjs|cjs|yml|yaml)$/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (TEXT.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

const files = sourceFiles(root);

describe("source files are text", () => {
  it("finds files to check, or this test is proving nothing", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /**
   * The one that actually happened. A NUL is legal inside a string literal and
   * works, so nothing that runs the code objects — only the tools that read it.
   */
  it("contains no NUL bytes", () => {
    const offenders = files.filter((file) => readFileSync(file).includes(0));
    expect(
      offenders.map((f) => path.relative(root, f)),
      "git treats a file with a NUL as binary: no diff, no blame, and grep skips it"
    ).toEqual([]);
  });

  /**
   * A stray control character is the same class of problem — invisible in an
   * editor, load-bearing at runtime if it landed inside a string. Tab, newline
   * and carriage return are ordinary and allowed; nothing else below space is.
   */
  it("contains no other invisible control characters", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const bytes = readFileSync(file);
      for (const byte of bytes) {
        if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
          offenders.push(`${path.relative(root, file)} (byte 0x${byte.toString(16)})`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
