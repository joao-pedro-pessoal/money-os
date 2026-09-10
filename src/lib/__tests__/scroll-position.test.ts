import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A control that changes the current view must not scroll it away.
 *
 * Next resets scroll on every navigation. That is right when you are going
 * somewhere and wrong when you are staying put, and the pages driven by search
 * params express sorting, filtering and opening a row *as* navigation — so
 * every filter threw the reader back to the top of a page they had scrolled
 * down. Sorting a table meant scrolling back down to see what the sort did.
 *
 * `FilterLink` is `<Link scroll={false}>` and nothing else. The value of this
 * test is that the next same-page link cannot quietly be a plain `<Link>`:
 * the bug is invisible in review, invisible in a screenshot, and only shows up
 * when someone scrolls before clicking.
 */

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * Code only, comments removed.
 *
 * Every file here explains what it replaced, and a comment describing the old
 * `<form method="GET">` is not one — the first run of this test failed on the
 * paragraph in FilterSelect.tsx that exists to explain why GET forms are gone.
 *
 * `//` is only treated as a comment when it does not follow a colon, so the
 * `https://` in a link is left alone.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The JSX tag an `href={...}` belongs to.
 *
 * Found by walking back to the nearest unclosed `<Tag`, rather than by a
 * regex over the whole element: attributes span lines and contain `>` in arrow
 * functions and comparisons, so anything trying to match a whole opening tag
 * either misses elements or swallows the next one.
 */
function tagOwning(source: string, hrefIndex: number): string | null {
  for (let i = hrefIndex; i >= 0; i--) {
    if (source[i] !== "<") continue;
    const match = /^<([A-Za-z][\w.]*)/.exec(source.slice(i, i + 40));
    if (match) return match[1];
  }
  return null;
}

/** Every `href` that lands on the page it was clicked from. */
function samePageHrefs(source: string): { tag: string | null; href: string }[] {
  const found: { tag: string | null; href: string }[] = [];
  // `href={qs(...)}` — the query builder these pages share — and `href={`?...`}`,
  // a bare query string, which by definition keeps the current path.
  const pattern = /href=\{(qs\(|`\?)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(source)) !== null) {
    found.push({ tag: tagOwning(source, m.index), href: m[1] });
  }
  return found;
}

const files = tsxFiles(SRC);

describe("a filter keeps your place on the page", () => {
  it("finds the same-page links it is meant to be guarding", () => {
    // Guards the guard: a rename that made `samePageHrefs` match nothing would
    // otherwise leave this whole file passing while checking nothing at all.
    const total = files.reduce((n, f) => n + samePageHrefs(code(readFileSync(f, "utf8"))).length, 0);
    expect(total).toBeGreaterThan(5);
  });

  it("routes every same-page link through FilterLink", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = code(readFileSync(file, "utf8"));
      for (const { tag, href } of samePageHrefs(source)) {
        if (tag === "FilterLink") continue;
        // A helper that takes an href and renders it is fine as long as the
        // element it renders is a FilterLink; those are caught by their own
        // occurrence rather than at the call site.
        if (tag === null) continue;
        if (tag === "Link") {
          offenders.push(
            `${file.replace(SRC, "src")}: <Link href={${href}…}> scrolls the page to the top — use FilterLink`
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * A native GET form is a full document navigation: it reloads the page, loses
   * the scroll position, and carries only the parameters written into it as
   * hidden inputs. The grouping form on the analysis page listed `sort` and
   * `dir` and stopped there, so changing the grouping also turned the
   * "Cash & stablecoins" toggle back on — its absence reads as on — and closed
   * whichever group was open.
   */
  it("has no GET forms left to reload a page for one parameter", () => {
    const offenders = files.filter((f) => /<form\s[^>]*method=["']GET["']/i.test(code(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.replace(SRC, "src"))).toEqual([]);
  });
});
