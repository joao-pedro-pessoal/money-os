import { describe, it, expect } from "vitest";
import {
  compareEditorial,
  sortForDisplay,
  heroResource,
  isEditorialFirst,
  hasSingleTopRank,
  planRankUpdate,
  type Rankable,
} from "../ranking";

/**
 * Note what these fixtures do *not* have: a title.
 *
 * That's the point of the whole module. If any of this could be made to depend
 * on a book being called "The Holy Bible", these tests wouldn't compile.
 */
interface Item extends Rankable {
  id: string;
}

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  editorialRank: null,
  heroFeatured: false,
  featured: false,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("editorial order", () => {
  it("puts a ranked resource before an unranked one", () => {
    const ranked = item("ranked", { editorialRank: 1 });
    const plain = item("plain", { updatedAt: new Date("2030-01-01T00:00:00Z") });
    expect(sortForDisplay([plain, ranked]).map((r) => r.id)).toEqual(["ranked", "plain"]);
  });

  it("is not beaten by featured, however recent", () => {
    // "Featured" is a shelf you can put anything on; rank is a judgement.
    const ranked = item("ranked", { editorialRank: 1 });
    const shiny = item("shiny", { featured: true, updatedAt: new Date("2040-06-01T00:00:00Z") });
    expect(sortForDisplay([shiny, ranked])[0].id).toBe("ranked");
  });

  it("orders ranked resources by their rank", () => {
    const third = item("third", { editorialRank: 3 });
    const first = item("first", { editorialRank: 1 });
    const second = item("second", { editorialRank: 2 });
    expect(sortForDisplay([third, first, second]).map((r) => r.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("treats rank 0 as a rank, not as absent", () => {
    // A falsy check instead of a null check would push rank 0 to the bottom.
    const zero = item("zero", { editorialRank: 0 });
    const one = item("one", { editorialRank: 1 });
    expect(sortForDisplay([one, zero])[0].id).toBe("zero");
  });

  it("falls back to featured, then to most recently touched", () => {
    const old = item("old", { updatedAt: new Date("2020-01-01T00:00:00Z") });
    const recent = item("recent", { updatedAt: new Date("2026-08-01T00:00:00Z") });
    const featured = item("featured", {
      featured: true,
      updatedAt: new Date("2019-01-01T00:00:00Z"),
    });
    expect(sortForDisplay([old, recent, featured]).map((r) => r.id)).toEqual([
      "featured",
      "recent",
      "old",
    ]);
  });

  it("leaves the input array alone", () => {
    const input = [item("b", { editorialRank: 2 }), item("a", { editorialRank: 1 })];
    sortForDisplay(input);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("is a total order — no pair compares as both before and after", () => {
    const items = [
      item("a", { editorialRank: 1 }),
      item("b", { editorialRank: 2 }),
      item("c", { featured: true }),
      item("d"),
      item("e", { updatedAt: new Date("2027-01-01T00:00:00Z") }),
    ];
    for (const x of items) {
      for (const y of items) {
        // Summed rather than negated: Math.sign(0) is 0 and -0, and Object.is
        // tells those apart, which would fail for reasons nothing cares about.
        expect(Math.sign(compareEditorial(x, y)) + Math.sign(compareEditorial(y, x))).toBe(0);
      }
    }
  });

  it("survives a nonsense rank without reordering everything", () => {
    const broken = item("broken", { editorialRank: Number.NaN });
    const ranked = item("ranked", { editorialRank: 1 });
    expect(sortForDisplay([broken, ranked])[0].id).toBe("ranked");
  });
});

describe("the hero slot", () => {
  it("is empty when nothing is flagged for it", () => {
    expect(heroResource([item("a", { editorialRank: 1 })])).toBeNull();
  });

  it("ignores resources that aren't flagged, whatever their rank", () => {
    const hero = item("hero", { heroFeatured: true, editorialRank: 1 });
    const other = item("other", { editorialRank: 0, featured: true });
    expect(heroResource([other, hero])?.id).toBe("hero");
  });

  it("cannot be taken from rank 1 by a later hero-flagged resource", () => {
    // The rule the spec cares about: nothing displaces the top resource.
    const top = item("top", { heroFeatured: true, editorialRank: 1 });
    const challenger = item("challenger", {
      heroFeatured: true,
      featured: true,
      updatedAt: new Date("2099-01-01T00:00:00Z"),
    });
    expect(heroResource([challenger, top])?.id).toBe("top");
    expect(heroResource([top, challenger])?.id).toBe("top");
  });

  it("prefers a ranked hero over an unranked one", () => {
    const ranked = item("ranked", { heroFeatured: true, editorialRank: 4 });
    const unranked = item("unranked", { heroFeatured: true, featured: true });
    expect(heroResource([unranked, ranked])?.id).toBe("ranked");
  });
});

describe("renumbering the shelf", () => {
  const row = (id: string, editorialRank: number | null) => ({ id, editorialRank });

  it("frees every taken number before handing any out", () => {
    // The bug this exists for: rank is unique, so assigning book B rank 3
    // while book A still holds it fails — and which one is written first is
    // decided by whatever order the database returned the rows in.
    const plan = planRankUpdate(
      [row("a", 1), row("b", 3), row("c", null)],
      [
        { id: "a", rank: 3 },
        { id: "b", rank: 1 },
      ]
    );
    expect(plan.clear).toEqual(["a", "b"]);
    expect(plan.assign).toEqual([
      { id: "a", rank: 3 },
      { id: "b", rank: 1 },
    ]);
  });

  it("clears a ranked row even when nothing is reassigning it", () => {
    // That row may be sitting on a number about to be given to someone else.
    const plan = planRankUpdate([row("stranger", 5)], [{ id: "other", rank: 5 }]);
    expect(plan.clear).toContain("stranger");
  });

  it("leaves unranked rows alone", () => {
    expect(planRankUpdate([row("a", null)], []).clear).toEqual([]);
  });

  it("skips a resource the seed gives no rank", () => {
    const plan = planRankUpdate([row("a", 2)], [{ id: "a", rank: undefined }]);
    expect(plan.assign).toEqual([]);
    expect(plan.clear).toEqual(["a"]);
  });

  it("refuses to assign the same number twice", () => {
    // Two rows claiming rank 4 would fail the constraint just as surely. The
    // first keeps it and the second is left unranked, rather than the whole
    // refresh aborting over one bad row.
    const plan = planRankUpdate(
      [row("a", null), row("b", null)],
      [
        { id: "a", rank: 4 },
        { id: "b", rank: 4 },
      ]
    );
    expect(plan.assign).toEqual([{ id: "a", rank: 4 }]);
  });

  it("handles the real case: fifty books renumbered in place", () => {
    const current = Array.from({ length: 50 }, (_, i) => row(`b${i}`, i + 1));
    // Reversed: every single row wants a number another row currently holds.
    const desired = current.map((r, i) => ({ id: r.id, rank: 50 - i }));
    const plan = planRankUpdate(current, desired);
    expect(plan.clear).toHaveLength(50);
    expect(plan.assign).toHaveLength(50);
    expect(new Set(plan.assign.map((a) => a.rank)).size).toBe(50);
  });

  it("copes with a library that has no ranks at all yet", () => {
    const plan = planRankUpdate(
      [row("a", null), row("b", null)],
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
      ]
    );
    expect(plan.clear).toEqual([]);
    expect(plan.assign).toHaveLength(2);
  });
});

describe("the top position is exclusive", () => {
  it("recognises rank 1 and nothing else", () => {
    expect(isEditorialFirst(item("a", { editorialRank: 1 }))).toBe(true);
    expect(isEditorialFirst(item("b", { editorialRank: 2 }))).toBe(false);
    expect(isEditorialFirst(item("c"))).toBe(false);
  });

  it("accepts a set with one claim, or none", () => {
    expect(hasSingleTopRank([item("a", { editorialRank: 1 }), item("b", { editorialRank: 2 })])).toBe(
      true
    );
    expect(hasSingleTopRank([item("a"), item("b")])).toBe(true);
  });

  it("rejects a second claim — the database refuses it too", () => {
    expect(
      hasSingleTopRank([item("a", { editorialRank: 1 }), item("b", { editorialRank: 1 })])
    ).toBe(false);
  });
});
