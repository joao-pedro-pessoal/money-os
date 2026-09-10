import { describe, it, expect } from "vitest";
import { hashString, paletteFor, coverLines, coverByline } from "../cover";
import { SEED_BOOKS, SEED_RESOURCES } from "../seed";

describe("the colour of a cover", () => {
  it("is the same every time for the same slug", () => {
    // Covers are drawn on every render, on every machine. If this wandered,
    // a book would change colour when you reloaded the page.
    const first = paletteFor("the-brothers-karamazov");
    const second = paletteFor("the-brothers-karamazov");
    expect(first).toEqual(second);
    expect(hashString("abc")).toBe(hashString("abc"));
  });

  it("differs between slugs often enough to be useful", () => {
    // Not a guarantee of uniqueness — eight palettes, fifty books — but a
    // shelf that came out all one colour would mean the hash is broken.
    const used = new Set(SEED_BOOKS.map((b) => JSON.stringify(paletteFor(b.slug))));
    expect(used.size).toBeGreaterThan(3);
  });

  it("always returns a real palette, even for odd input", () => {
    for (const seed of ["", "a", "—", "x".repeat(500)]) {
      const p = paletteFor(seed);
      expect(p.from).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.ink).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("stays within 32 bits", () => {
    // Math.imul without the >>> 0 would drift negative and index out of range.
    for (const seed of SEED_RESOURCES.map((r) => r.slug)) {
      const h = hashString(seed);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe("breaking a title onto a cover", () => {
  it("keeps a short title on one line", () => {
    expect(coverLines("Meditations", 15, 5)).toEqual(["Meditations"]);
  });

  it("wraps at word boundaries", () => {
    expect(coverLines("The Brothers Karamazov", 12, 5)).toEqual(["The Brothers", "Karamazov"]);
  });

  it("never hyphenates a long word — that looks like a bug", () => {
    const lines = coverLines("Antidisestablishmentarianism", 10, 3);
    expect(lines).toEqual(["Antidisestablishmentarianism"]);
  });

  it("elides rather than overflowing", () => {
    const lines = coverLines("A very long title that simply will not fit on a book cover", 10, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("…")).toBe(true);
  });

  it("handles an empty title without throwing", () => {
    expect(coverLines("", 15, 5)).toEqual([]);
    expect(coverLines("   ", 15, 5)).toEqual([]);
  });

  it("fits every starter title in five lines", () => {
    for (const r of SEED_RESOURCES) {
      const lines = coverLines(r.title, 15, 5);
      expect(lines.length, `${r.slug} needs more room`).toBeLessThanOrEqual(5);
      expect(lines.length).toBeGreaterThan(0);
    }
  });
});

describe("the byline", () => {
  it("uses the surname", () => {
    expect(coverByline("Fyodor Dostoevsky")).toBe("Dostoevsky");
    expect(coverByline("C. S. Lewis")).toBe("Lewis");
  });

  it("takes the first of several authors", () => {
    expect(coverByline("Karl Marx and Friedrich Engels")).toBe("Marx");
    expect(coverByline("Victor Haghani and James White")).toBe("Haghani");
  });

  it("drops the institution from a course creator", () => {
    expect(coverByline("Robert J. Shiller — Yale University")).toBe("Shiller");
  });

  it("keeps a single-word creator whole", () => {
    expect(coverByline("Aristotle")).toBe("Aristotle");
    expect(coverByline("Various Authors")).toBe("Authors");
  });

  it("produces something for every starter resource", () => {
    for (const r of SEED_RESOURCES) {
      expect(coverByline(r.creator), `${r.slug} has an empty byline`).toBeTruthy();
    }
  });
});
