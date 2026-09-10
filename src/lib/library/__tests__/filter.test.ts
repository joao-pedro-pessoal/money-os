import { describe, it, expect } from "vitest";
import {
  filterResources,
  countsByType,
  NO_LIBRARY_FILTERS,
  type FilterableResource,
} from "../filter";
import { RESOURCE_TYPES, isResourceType, requiresUrl, isRelevant, defaultUnitFor } from "../types";

const r = (o: Partial<FilterableResource> & { id: string }): FilterableResource => ({
  type: "BOOK",
  title: o.id,
  creator: "Someone",
  status: "SAVED",
  level: "BEGINNER",
  featured: false,
  categorySlugs: [],
  subtagSlugs: [],
  ...o,
});

const items: FilterableResource[] = [
  r({
    id: "brothers",
    type: "BOOK",
    title: "The Brothers Karamazov",
    creator: "Fyodor Dostoevsky",
    categorySlugs: ["philosophy", "literature"],
    subtagSlugs: ["free-will", "russian-literature"],
    status: "IN_PROGRESS",
  }),
  r({
    id: "death",
    type: "COURSE",
    title: "Death",
    creator: "Shelly Kagan — Yale University",
    categorySlugs: ["philosophy"],
    subtagSlugs: ["mortality"],
  }),
  r({
    id: "sapolsky-lecture",
    type: "VIDEO",
    title: "Introduction to Human Behavioral Biology",
    creator: "Stanford",
    categorySlugs: ["psychology"],
    status: "COMPLETED",
  }),
  r({
    id: "some-episode",
    type: "PODCAST",
    title: "On Stoicism",
    creator: "A Host",
    categorySlugs: ["philosophy"],
    subtagSlugs: ["stoicism"],
  }),
];

describe("the four types", () => {
  it("has exactly four, and no separate ones for series or playlists", () => {
    expect(RESOURCE_TYPES.map((t) => t.value)).toEqual(["BOOK", "VIDEO", "PODCAST", "COURSE"]);
  });

  it("rejects the types the spec ruled out", () => {
    for (const bad of ["PODCAST_EPISODE", "PODCAST_SERIES", "LECTURE", "LECTURE_SERIES", "PLAYLIST"]) {
      expect(isResourceType(bad)).toBe(false);
    }
  });

  it("requires a link for everything the app doesn't hold in its hand", () => {
    // A book on your shelf needs no URL; a video, podcast or course IS the URL.
    expect(requiresUrl("BOOK")).toBe(false);
    expect(requiresUrl("VIDEO")).toBe(true);
    expect(requiresUrl("PODCAST")).toBe(true);
    expect(requiresUrl("COURSE")).toBe(true);
  });

  it("tracks each type in the unit that suits it", () => {
    expect(defaultUnitFor("BOOK")).toBe("PAGES");
    expect(defaultUnitFor("VIDEO")).toBe("MINUTES");
    expect(defaultUnitFor("PODCAST")).toBe("MINUTES");
    expect(defaultUnitFor("COURSE")).toBe("LESSONS");
  });

  it("never shows an ISBN or a page count on a podcast", () => {
    // The spec's own example of a field that must stay hidden.
    expect(isRelevant("PODCAST", "isbn13")).toBe(false);
    expect(isRelevant("PODCAST", "pageCount")).toBe(false);
    expect(isRelevant("BOOK", "isbn13")).toBe(true);
  });

  it("keeps book fields off videos and course fields off books", () => {
    expect(isRelevant("VIDEO", "translator")).toBe(false);
    expect(isRelevant("BOOK", "lessonCount")).toBe(false);
    expect(isRelevant("COURSE", "lessonCount")).toBe(true);
    expect(isRelevant("PODCAST", "guestName")).toBe(true);
    expect(isRelevant("VIDEO", "guestName")).toBe(false);
  });
});

describe("filterResources", () => {
  it("shows everything by default", () => {
    expect(filterResources(items, NO_LIBRARY_FILTERS)).toHaveLength(4);
  });

  it("filters to one type", () => {
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, type: "COURSE" })).toHaveLength(1);
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, type: "BOOK" })[0].id).toBe("brothers");
  });

  it("puts every medium under one category", () => {
    // The point of a shared taxonomy: Philosophy holds a book, a course and a
    // podcast at once.
    const philosophy = filterResources(items, { ...NO_LIBRARY_FILTERS, category: "philosophy" });
    expect(philosophy.map((x) => x.type).sort()).toEqual(["BOOK", "COURSE", "PODCAST"]);
  });

  it("combines type and category", () => {
    const out = filterResources(items, {
      ...NO_LIBRARY_FILTERS,
      type: "COURSE",
      category: "philosophy",
    });
    expect(out.map((x) => x.id)).toEqual(["death"]);
  });

  it("filters by subtag", () => {
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, subtag: "stoicism" })).toHaveLength(1);
  });

  it("filters by status and level", () => {
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, status: "COMPLETED" })).toHaveLength(1);
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, level: "BEGINNER" })).toHaveLength(4);
  });

  it("searches title and creator", () => {
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, search: "dostoevsky" })).toHaveLength(1);
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, search: "  KAGAN " })).toHaveLength(1);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(filterResources(items, { ...NO_LIBRARY_FILTERS, category: "nope" })).toHaveLength(0);
  });
});

describe("countsByType", () => {
  it("counts every type against the other filters", () => {
    const counts = countsByType(items, NO_LIBRARY_FILTERS);
    expect(counts).toEqual({ BOOK: 1, VIDEO: 1, PODCAST: 1, COURSE: 1 });
  });

  it("ignores the type filter, so the other tabs still show a number", () => {
    // Counting with the type applied would put 0 next to every tab you aren't
    // on, which is useless and quietly discouraging.
    const counts = countsByType(items, { ...NO_LIBRARY_FILTERS, type: "BOOK" });
    expect(counts.COURSE).toBe(1);
  });

  it("respects the category filter", () => {
    const counts = countsByType(items, { ...NO_LIBRARY_FILTERS, category: "philosophy" });
    expect(counts).toEqual({ BOOK: 1, VIDEO: 0, PODCAST: 1, COURSE: 1 });
  });
});
