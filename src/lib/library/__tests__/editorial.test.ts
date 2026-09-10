import { describe, it, expect } from "vitest";
import {
  EDITORIAL_ORDER,
  BOOK_DESCRIPTIONS,
  BOOK_WHY_LEARN,
  HANDOFF_CATEGORIES,
} from "../editorial";
import { SEED_BOOKS, SEED_RESOURCES, SEED_CATEGORIES, GREATEST_BOOK_BADGE } from "../seed";
import { sortForDisplay, hasSingleTopRank, heroResource } from "../ranking";

const rankable = (r: (typeof SEED_BOOKS)[number], i = 0) => ({
  slug: r.slug,
  editorialRank: r.editorialRank ?? null,
  heroFeatured: r.heroFeatured ?? false,
  featured: r.featured ?? false,
  updatedAt: new Date(2026, 0, 1 + i),
});

describe("the shelf order", () => {
  it("covers all fifty books and nothing else", () => {
    expect(EDITORIAL_ORDER).toHaveLength(50);
    const bookSlugs = new Set(SEED_BOOKS.map((b) => b.slug));
    for (const slug of EDITORIAL_ORDER) {
      expect(bookSlugs, `${slug} is in the order but isn't a book`).toContain(slug);
    }
    for (const b of SEED_BOOKS) {
      expect(EDITORIAL_ORDER, `${b.slug} has no place in the order`).toContain(b.slug);
    }
  });

  it("lists each book once", () => {
    expect(new Set(EDITORIAL_ORDER).size).toBe(EDITORIAL_ORDER.length);
  });

  it("gives every book a unique rank from 1 to 50", () => {
    const ranks = SEED_BOOKS.map((b) => b.editorialRank);
    expect(new Set(ranks).size).toBe(50);
    expect(Math.min(...(ranks as number[]))).toBe(1);
    expect(Math.max(...(ranks as number[]))).toBe(50);
  });

  it("still leaves rank 1 to one book alone", () => {
    expect(hasSingleTopRank(SEED_BOOKS.map(rankable))).toBe(true);
    expect(SEED_BOOKS.filter((b) => b.editorialRank === 1)).toHaveLength(1);
  });

  it("puts the Bible first and keeps it there", () => {
    expect(EDITORIAL_ORDER[0]).toBe("the-holy-bible");
    const shuffled = SEED_BOOKS.map(rankable).reverse();
    expect(sortForDisplay(shuffled)[0].slug).toBe("the-holy-bible");
    expect(heroResource(shuffled)?.slug).toBe("the-holy-bible");
  });

  it("leaves the courses unranked, behind the books", () => {
    // Ranked beats unranked, so the shelf reads: fifty books in order, then
    // everything else by how recently you touched it.
    const courses = SEED_RESOURCES.filter((r) => r.type === "COURSE");
    for (const c of courses) expect(c.editorialRank).toBeUndefined();
  });
});

describe("the delivered copy", () => {
  it("describes forty-nine books — the Bible keeps its own text", () => {
    expect(Object.keys(BOOK_DESCRIPTIONS)).toHaveLength(49);
    expect(BOOK_DESCRIPTIONS).not.toHaveProperty("the-holy-bible");
    expect(BOOK_WHY_LEARN).not.toHaveProperty("the-holy-bible");
  });

  it("reached every book", () => {
    for (const b of SEED_BOOKS) {
      expect(b.description.trim().length, `${b.slug} has no description`).toBeGreaterThan(60);
      expect(b.whyLearn, `${b.slug} has no reason to read it`).toBeTruthy();
    }
  });

  it("keeps the Bible's specified text word for word", () => {
    const bible = SEED_BOOKS.find((b) => b.slug === "the-holy-bible")!;
    expect(bible.description).toMatch(/^The Holy Bible is the central sacred text of Christianity/);
    expect(bible.whyLearn).toMatch(/^The Bible does not address only one area of life/);
    expect(bible.specialBadge).toBe(GREATEST_BOOK_BADGE);
  });

  it("names no slug that isn't a book", () => {
    const bookSlugs = new Set(SEED_BOOKS.map((b) => b.slug));
    for (const map of [BOOK_DESCRIPTIONS, BOOK_WHY_LEARN, HANDOFF_CATEGORIES]) {
      for (const slug of Object.keys(map)) {
        expect(bookSlugs, `${slug} isn't in the library`).toContain(slug);
      }
    }
  });

  it("cites no page count, year or ISBN", () => {
    // The hand-off's own rule, checked rather than trusted.
    for (const b of SEED_BOOKS) {
      const text = `${b.description} ${b.whyLearn ?? ""}`;
      expect(text, `${b.slug} cites an edition detail`).not.toMatch(
        /\b\d{3,4}\s*(pages|pp)\b|\bISBN\b|\bpublished in \d{4}\b/i
      );
    }
  });

  it("says something in two sentences, not one clause", () => {
    for (const slug of Object.keys(BOOK_DESCRIPTIONS)) {
      const sentences = BOOK_DESCRIPTIONS[slug].split(/\.\s/).filter(Boolean);
      expect(sentences.length, `${slug} is a single sentence`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("merged categories", () => {
  it("only names categories the taxonomy actually has", () => {
    const known = new Set(SEED_CATEGORIES.map((c) => c.slug));
    for (const [slug, cats] of Object.entries(HANDOFF_CATEGORIES)) {
      for (const c of cats) {
        expect(known, `${slug} references unknown category ${c}`).toContain(c);
      }
    }
  });

  it("adds without removing", () => {
    for (const b of SEED_BOOKS) {
      for (const c of HANDOFF_CATEGORIES[b.slug] ?? []) {
        expect(b.categories, `${b.slug} lost ${c}`).toContain(c);
      }
    }
  });

  it("leaves no duplicates behind", () => {
    for (const b of SEED_BOOKS) {
      expect(new Set(b.categories).size, `${b.slug} lists a category twice`).toBe(
        b.categories.length
      );
    }
  });

  it("keeps every subtag under a category the book is still in", () => {
    // Merging categories mustn't orphan a subtag that was already attached.
    for (const b of SEED_BOOKS) {
      for (const ref of b.subtags) {
        expect(b.categories, `${b.slug}: ${ref} hangs loose`).toContain(ref.split("/")[0]);
      }
    }
  });
});
