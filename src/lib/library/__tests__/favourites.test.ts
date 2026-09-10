import { describe, it, expect } from "vitest";
import {
  toggleFavouriteState,
  sortByFavourited,
  favouriteCount,
  isFavourite,
} from "../favourites";
import { SEED_RESOURCES } from "../seed";
import { learningResources } from "@/db/schema";

const at = (iso: string) => new Date(iso);

const row = (favourite: boolean, favouritedAt: Date | null = null) => ({
  favourite,
  favouritedAt,
});

describe("starring and unstarring", () => {
  it("stars an unstarred resource and stamps the time", () => {
    const now = at("2026-08-15T10:00:00Z");
    expect(toggleFavouriteState(row(false), now)).toEqual({
      favourite: true,
      favouritedAt: now,
    });
  });

  it("clears the timestamp when you unstar", () => {
    // Keeping the old date would say "you liked this on the 3rd" about
    // something you no longer like, and would misorder it if you starred it
    // again later.
    const previous = row(true, at("2026-03-03T00:00:00Z"));
    expect(toggleFavouriteState(previous)).toEqual({ favourite: false, favouritedAt: null });
  });

  it("round-trips: two clicks leave you where you started", () => {
    const start = row(false);
    const there = toggleFavouriteState(start, at("2026-08-15T10:00:00Z"));
    const back = toggleFavouriteState(there);
    expect(back.favourite).toBe(start.favourite);
    expect(back.favouritedAt).toBeNull();
  });

  it("doesn't mutate the row it's given", () => {
    const original = row(false);
    toggleFavouriteState(original);
    expect(original.favourite).toBe(false);
  });
});

describe("the favourites list", () => {
  it("keeps only what you starred", () => {
    const items = [row(true, at("2026-01-01T00:00:00Z")), row(false), row(false)];
    expect(sortByFavourited(items)).toHaveLength(1);
    expect(favouriteCount(items)).toBe(1);
  });

  it("puts the most recently starred first", () => {
    const older = { id: "older", ...row(true, at("2026-01-01T00:00:00Z")) };
    const newer = { id: "newer", ...row(true, at("2026-08-01T00:00:00Z")) };
    expect(sortByFavourited([older, newer]).map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("keeps a favourite that has no date, at the end", () => {
    // Possible after restoring a backup taken before the column existed.
    // Dropping the row would be the worst outcome of a restore.
    const dated = { id: "dated", ...row(true, at("2026-01-01T00:00:00Z")) };
    const undated = { id: "undated", ...row(true, null) };
    expect(sortByFavourited([undated, dated]).map((r) => r.id)).toEqual(["dated", "undated"]);
  });

  it("leaves the input array alone", () => {
    const input = [
      { id: "a", ...row(true, at("2026-01-01T00:00:00Z")) },
      { id: "b", ...row(true, at("2026-09-01T00:00:00Z")) },
    ];
    sortByFavourited(input);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("is empty when nothing is starred", () => {
    expect(sortByFavourited([row(false), row(false)])).toEqual([]);
    expect(favouriteCount([row(false)])).toBe(0);
  });

  it("reads the flag, not the timestamp", () => {
    // A row that was starred and unstarred keeps favourite: false; a stray
    // timestamp must not resurrect it.
    expect(isFavourite(row(false, at("2026-01-01T00:00:00Z")))).toBe(false);
  });
});

describe("favourites belong to the reader", () => {
  it("is never set by the seed", () => {
    // The app takes an editorial position on one book. It does not get to
    // decide what you like — including about that book.
    for (const r of SEED_RESOURCES) {
      expect(r, `${r.slug} arrives pre-starred`).not.toHaveProperty("favourite");
    }
  });

  it("is a different column from featured and editorialRank", () => {
    const columns = Object.keys(learningResources);
    for (const c of ["favourite", "favouritedAt", "featured", "editorialRank"]) {
      expect(columns, `${c} missing`).toContain(c);
    }
  });

  it("survives a backup, because it lives on the row", () => {
    expect(Object.keys(learningResources)).toContain("favourite");
    expect(Object.keys(learningResources)).toContain("favouritedAt");
  });
});
