import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Money that has not arrived is in no total.
 *
 * The whole value of "Coming in" is saying *1 240 EUR is on its way* beside
 * what you have rather than inside it. A total that includes money you cannot
 * spend is worse than no total, because it gets acted on — and it would be an
 * easy mistake to make, since the rows look exactly like income.
 *
 * A comment saying so is not enough. This fails if the table is read anywhere
 * that computes a balance, a net worth, or a spending or income figure.
 *
 * Same shape of guard as `budgets`, which moves no money, and `subscriptions`,
 * which forecasts charges without counting them — both of which state the rule
 * in prose and neither of which has a test holding them to it.
 */

const SRC = join(process.cwd(), "src");

/** Files allowed to touch the table: its own action, its own page, its lib. */
const OWNERS = [
  join("src", "actions", "expected.ts"),
  join("src", "lib", "accounting", "expected.ts"),
  join("src", "app", "(app)", "expected", "page.tsx"),
  join("src", "db", "schema.ts"),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !path.includes("__tests__")) out.push(path);
  }
  return out;
}

describe("expected money reaches no total", () => {
  it("is read only by the feature that owns it", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relative = file.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "");
      if (OWNERS.some((owner) => relative === owner)) continue;

      const source = readFileSync(file, "utf8");
      if (/\bexpectedMoney\b/.test(source)) {
        offenders.push(relative);
      }
    }

    expect(
      offenders,
      "expected_money is being read outside its own feature — if that is a total, it is counting money that has not arrived"
    ).toEqual([]);
  });

  /**
   * The arbiters by name. If one of them ever imports the feature's action,
   * the rule is gone whatever the table check above says.
   */
  it("is imported by no arbiter of a real figure", () => {
    const arbiters = [
      join(SRC, "actions", "networth.ts"),
      join(SRC, "actions", "accounts.ts"),
      join(SRC, "actions", "dashboard.ts"),
      join(SRC, "actions", "spending.ts"),
      join(SRC, "lib", "accounting", "networth.ts"),
      join(SRC, "lib", "accounting", "unallocated.ts"),
    ];

    for (const file of arbiters) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} reads expected money`).not.toMatch(/expectedMoney|actions\/expected/);
    }
  });
});
