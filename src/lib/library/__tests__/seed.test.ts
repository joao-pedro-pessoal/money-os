import { describe, it, expect } from "vitest";
import {
  SEED_CATEGORIES,
  SEED_BOOKS,
  SEED_COURSES,
  SEED_RESOURCES,
  BOOK_TOPICS,
  COURSE_VIDEOS,
  GREATEST_BOOK_BADGE,
  GREATEST_BOOK_SUBTITLE,
  parseSubtagRef,
  type SeedResource,
} from "../seed";
import { isSafeUrl, sourceKind, sourceLabel } from "../links";
import { isResourceType, isLevel, isProgressUnit, compareLevel } from "../types";
import { progressView } from "../progress";
import { heroResource, sortForDisplay, hasSingleTopRank, isEditorialFirst } from "../ranking";
import { BACKUP_TABLES } from "@/lib/backup";
import { learningResources, learningResourceMeta } from "@/db/schema";

/** Turns seed data into something the ranking module can order. */
const rankable = (r: SeedResource, i = 0) => ({
  slug: r.slug,
  title: r.title,
  type: r.type,
  editorialRank: r.editorialRank ?? null,
  heroFeatured: r.heroFeatured ?? false,
  featured: r.featured ?? false,
  // Distinct timestamps, so any accidental reliance on insertion order shows up.
  updatedAt: new Date(2026, 0, 1 + i),
});

describe("seed taxonomy", () => {
  it("has a unique slug per category", () => {
    const slugs = SEED_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique subtag slugs inside each category", () => {
    for (const c of SEED_CATEGORIES) {
      const slugs = c.subtags.map((s) => s.slug);
      expect(new Set(slugs).size, `duplicate subtag in ${c.slug}`).toBe(slugs.length);
    }
  });

  it("allows the same subtag name under two categories", () => {
    // Free Will is a theological question and a philosophical one, and they are
    // not the same tag. Uniqueness is per category, deliberately.
    const theology = SEED_CATEGORIES.find((c) => c.slug === "theology")!;
    const philosophy = SEED_CATEGORIES.find((c) => c.slug === "philosophy")!;
    expect(theology.subtags.some((s) => s.slug === "free-will")).toBe(true);
    expect(philosophy.subtags.some((s) => s.slug === "free-will")).toBe(true);
  });

  it("carries every category the spec names", () => {
    const required = ["theology", "philosophy", "history", "literature", "personal-development"];
    const slugs = SEED_CATEGORIES.map((c) => c.slug);
    for (const r of required) expect(slugs, `missing category ${r}`).toContain(r);
  });
});

describe("subtag references", () => {
  it("splits a qualified reference", () => {
    expect(parseSubtagRef("theology/free-will")).toEqual({
      category: "theology",
      subtag: "free-will",
    });
  });

  it("rejects a bare slug — it would be ambiguous", () => {
    expect(parseSubtagRef("free-will")).toBeNull();
    expect(parseSubtagRef("a/b/c")).toBeNull();
    expect(parseSubtagRef("/b")).toBeNull();
  });

  it("only ever references categories and subtags that exist", () => {
    const subsByCat = new Map(
      SEED_CATEGORIES.map((c) => [c.slug, new Set(c.subtags.map((s) => s.slug))])
    );

    for (const item of SEED_RESOURCES) {
      for (const cat of item.categories) {
        expect(subsByCat.has(cat), `${item.slug} references missing category ${cat}`).toBe(true);
      }
      for (const ref of item.subtags) {
        const parsed = parseSubtagRef(ref);
        expect(parsed, `${item.slug}: malformed subtag reference ${ref}`).not.toBeNull();
        // The subtag must exist AND its category must be one the resource is in,
        // or the detail page would group it under a heading it never renders.
        expect(
          subsByCat.get(parsed!.category)?.has(parsed!.subtag),
          `${item.slug}: ${ref} doesn't exist`
        ).toBe(true);
        expect(
          item.categories.includes(parsed!.category),
          `${item.slug}: ${ref} hangs under a category it isn't in`
        ).toBe(true);
      }
    }
  });
});

describe("the master list", () => {
  it("has a unique slug per resource, so re-seeding adds nothing", () => {
    const slugs = SEED_RESOURCES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("holds fifty books and ten courses", () => {
    expect(SEED_BOOKS).toHaveLength(50);
    expect(SEED_COURSES).toHaveLength(10);
  });

  it("uses valid enum values throughout", () => {
    for (const r of SEED_RESOURCES) {
      expect(isResourceType(r.type), `${r.slug} type`).toBe(true);
      expect(isLevel(r.level), `${r.slug} level`).toBe(true);
      expect(isProgressUnit(r.progressUnit), `${r.slug} unit`).toBe(true);
    }
  });

  it("gives no book an external link", () => {
    // The app hosts nothing and endorses no seller. An invented shop URL would
    // be worse than none; a real one would be a recommendation we didn't make.
    for (const b of SEED_BOOKS) {
      expect(b.externalUrl, `${b.slug} has a link it shouldn't`).toBeUndefined();
    }
  });

  it("invents no page counts or durations", () => {
    for (const r of SEED_RESOURCES) {
      expect(r.meta ?? {}).not.toHaveProperty("durationMinutes");
      expect(r.meta ?? {}).not.toHaveProperty("pageCount");
    }
  });

  it("only claims a lesson count where a playlist was counted", () => {
    // Lesson counts used to be forbidden outright, because there was no way to
    // know them. Now seven playlists have been opened on the institutions' own
    // channels, so the count is a fact about a real playlist — and it may only
    // ever come from there.
    for (const r of SEED_RESOURCES) {
      const count = r.meta?.lessonCount;
      if (count === undefined) continue;
      expect(COURSE_VIDEOS[r.slug], `${r.slug} claims a count with no playlist`).toBeDefined();
      expect(count, `${r.slug} disagrees with its playlist`).toBe(COURSE_VIDEOS[r.slug].lessons);
    }
  });

  it("tracks books by percentage, because editions differ", () => {
    for (const b of SEED_BOOKS) expect(b.progressUnit).toBe("PERCENTAGE");
  });

  it("says what every book is about, in points", () => {
    for (const b of SEED_BOOKS) {
      const points = (b.lessons ?? "").split("\n").filter(Boolean);
      expect(points.length, `${b.slug} has no topic list`).toBeGreaterThanOrEqual(4);
      for (const p of points) {
        expect(p.trim(), `${b.slug} has a blank point`).toBeTruthy();
      }
    }
  });

  it("keeps the topic lists about ideas, not editions", () => {
    // A page count or a publication year in here would be invention: both vary
    // by printing, and neither is something the book argues.
    for (const b of SEED_BOOKS) {
      expect(b.lessons ?? "", `${b.slug} cites a number that depends on the edition`).not.toMatch(
        /\b\d{3,4}\s*(pages|pp)\b|\bpublished in \d{4}\b/i
      );
    }
  });

  it("has a topic list for every book and no orphans", () => {
    const bookSlugs = new Set(SEED_BOOKS.map((b) => b.slug));
    for (const slug of Object.keys(BOOK_TOPICS)) {
      expect(bookSlugs, `BOOK_TOPICS has ${slug}, which isn't a book`).toContain(slug);
    }
  });

  it("gives nothing a rating on the reader's behalf", () => {
    for (const r of SEED_RESOURCES) {
      expect(r).not.toHaveProperty("personalRating");
    }
  });
});

describe("the editorial first position", () => {
  const ranked = SEED_RESOURCES.map(rankable);
  const top = SEED_RESOURCES.find((r) => r.editorialRank === 1)!;

  it("belongs to exactly one resource", () => {
    expect(SEED_RESOURCES.filter((r) => r.editorialRank === 1)).toHaveLength(1);
    expect(hasSingleTopRank(ranked)).toBe(true);
  });

  it("is the first entry in the master book list", () => {
    expect(SEED_BOOKS[0].slug).toBe(top.slug);
  });

  it("leads the whole library however the rows arrive", () => {
    const shuffled = [...ranked].reverse();
    expect(sortForDisplay(shuffled)[0].slug).toBe(top.slug);
  });

  it("leads the Books section specifically", () => {
    const books = SEED_BOOKS.map(rankable).reverse();
    expect(sortForDisplay(books)[0].slug).toBe(top.slug);
  });

  it("takes the hero slot", () => {
    expect(heroResource(ranked)?.slug).toBe(top.slug);
    expect(top.heroFeatured).toBe(true);
  });

  it("carries the exact badge and subtitle, weakened nowhere", () => {
    expect(top.specialBadge).toBe(GREATEST_BOOK_BADGE);
    expect(top.specialBadge).toBe("#1 — The Greatest Book of All Time");
    expect(top.specialDescription).toBe(GREATEST_BOOK_SUBTITLE);
    // "one of the greatest" would be a different, weaker claim.
    expect(top.specialDescription).not.toMatch(/one of the/i);
  });

  it("is the only holder of that badge", () => {
    const badged = SEED_RESOURCES.filter((r) => r.specialBadge !== undefined);
    expect(badged).toHaveLength(1);
    expect(badged[0].slug).toBe(top.slug);
  });

  it("does not depend on its own title", () => {
    // Rename it and nothing about its standing moves. If this ever fails, some
    // string comparison has crept in.
    const renamed = SEED_RESOURCES.map((r, i) =>
      r.slug === top.slug ? { ...rankable(r, i), title: "Untitled" } : rankable(r, i)
    );
    expect(sortForDisplay(renamed)[0].slug).toBe(top.slug);
    expect(heroResource(renamed)?.slug).toBe(top.slug);
    expect(isEditorialFirst(renamed.find((r) => r.slug === top.slug)!)).toBe(true);
  });

  it("keeps its editorial standing out of the personal rating", () => {
    expect(top).not.toHaveProperty("personalRating");
    expect(isEditorialFirst(rankable(top))).toBe(true);
  });

  it("does not break progress without a page count", () => {
    // Editions differ, so there is no total. Progress must still work.
    const view = progressView({
      progress: 37,
      totalUnits: null,
      progressUnit: top.progressUnit,
      status: "IN_PROGRESS",
    });
    expect(view.done).toBe(37);
    expect(view.percent).toBe(37);
    expect(view.label).toBeTruthy();
  });

  it("is assigned every category and subtag the spec lists", () => {
    expect(top.categories).toEqual([
      "theology",
      "philosophy",
      "history",
      "literature",
      "personal-development",
    ]);

    const expected: Record<string, string[]> = {
      theology: [
        "christianity", "revelation", "faith-and-reason", "existence-of-god",
        "problem-of-evil", "sin", "redemption", "salvation", "free-will", "prayer", "prophecy",
      ],
      philosophy: ["ethics", "morality", "meaning-of-life", "free-will", "human-nature", "good-and-evil"],
      history: [
        "ancient-israel", "early-christianity", "ancient-world",
        "religious-history", "historical-context",
      ],
      literature: [
        "wisdom-literature", "poetry", "historical-narrative", "prophecy",
        "parables", "apocalyptic-literature", "classic",
      ],
      "personal-development": [
        "wisdom", "discipline", "purpose", "relationships", "suffering", "hope", "character",
      ],
    };

    for (const [category, subtags] of Object.entries(expected)) {
      for (const subtag of subtags) {
        expect(top.subtags, `Bible is missing ${category}/${subtag}`).toContain(
          `${category}/${subtag}`
        );
      }
    }
  });

  it("lists the key lessons the spec names", () => {
    const lessons = top.lessons ?? "";
    expect(lessons).toMatch(/Faith and trust in God/);
    expect(lessons).toMatch(/Salvation and eternal life/);
    expect(lessons.split("\n")).toHaveLength(10);
  });
});

describe("seed courses", () => {
  it("is entirely COURSE — a lecture series is not ten videos", () => {
    expect(SEED_COURSES.every((c) => c.type === "COURSE")).toBe(true);
  });

  it("has a safe, absolute URL for every one", () => {
    for (const c of SEED_COURSES) {
      expect(isSafeUrl(c.externalUrl), `${c.slug} has an unusable URL`).toBe(true);
    }
  });

  it("points only at the institutions' own domains", () => {
    const allowed = ["oyc.yale.edu", "ocw.mit.edu", "sandel.scholars.harvard.edu", "www.youtube.com"];
    for (const c of SEED_COURSES) {
      const host = new URL(c.externalUrl!).hostname;
      expect(allowed, `${c.slug} points at ${host}`).toContain(host);
    }
  });

  it("says whether each one is a site or YouTube", () => {
    for (const c of SEED_COURSES) {
      expect(sourceKind(c.externalUrl), `${c.slug} has no source kind`).not.toBeNull();
      expect(sourceLabel(c.externalUrl), `${c.slug} has no source label`).toBeTruthy();
    }
    const sapolsky = SEED_COURSES.find((c) => c.slug === "stanford-human-behavioral-biology-sapolsky")!;
    expect(sourceKind(sapolsky.externalUrl)).toBe("YOUTUBE");
    expect(sourceLabel(sapolsky.externalUrl)).toBe("YouTube");

    const shiller = SEED_COURSES.find((c) => c.slug === "yale-financial-markets-shiller")!;
    expect(sourceKind(shiller.externalUrl)).toBe("WEBSITE");
    expect(sourceLabel(shiller.externalUrl)).toBe("oyc.yale.edu");
  });

  it("names an institution for every university course", () => {
    const universities = SEED_COURSES.filter((c) => c.slug !== "mit-introduction-probability-statistics");
    for (const c of universities) {
      expect(c.meta?.institution, `${c.slug} has no institution`).toBeTruthy();
    }
  });

  it("claims no editorial rank", () => {
    for (const c of SEED_COURSES) expect(c.editorialRank).toBeUndefined();
  });

  it("describes each one in two sentences", () => {
    const courses = SEED_RESOURCES.filter((r) => r.type === "COURSE");
    for (const c of courses) {
      expect(c.description.split(/\.\s/).filter(Boolean).length, `${c.slug}`).toBeGreaterThanOrEqual(2);
      expect(c.whyLearn, `${c.slug} has no reason to watch it`).toBeTruthy();
    }
  });
});

describe("course playlists", () => {
  it("links only to playlists on the institution's own channel", () => {
    // Every one of these was opened and its owning channel read. YouTube is
    // full of complete re-uploads under official-looking names; two of the
    // Yale courses have nothing *but* re-uploads, which is why they're absent.
    const official = ["YaleCourses", "Stanford", "Harvard University"];
    for (const [slug, v] of Object.entries(COURSE_VIDEOS)) {
      expect(official, `${slug} points at ${v.channel}`).toContain(v.channel);
    }
  });

  it("uses a real YouTube playlist URL each time", () => {
    for (const [slug, v] of Object.entries(COURSE_VIDEOS)) {
      expect(isSafeUrl(v.url), `${slug}`).toBe(true);
      expect(sourceKind(v.url), `${slug} isn't on YouTube`).toBe("YOUTUBE");
      expect(new URL(v.url).searchParams.get("list"), `${slug} has no playlist id`).toBeTruthy();
    }
  });

  it("names only courses that exist", () => {
    const slugs = new Set(SEED_COURSES.map((c) => c.slug));
    for (const slug of Object.keys(COURSE_VIDEOS)) {
      expect(slugs, `${slug} isn't a course here`).toContain(slug);
    }
  });

  it("leaves the three unverified courses without a link", () => {
    for (const slug of [
      "yale-new-testament-martin",
      "yale-old-testament-hayes",
      "mit-introduction-probability-statistics",
    ]) {
      expect(COURSE_VIDEOS[slug], `${slug} gained an unverified link`).toBeUndefined();
    }
  });

  it("still keeps the course's own site as the main link", () => {
    // The playlist is where you watch; the site has the syllabus, the readings
    // and the transcripts. Replacing one with the other would lose half of it.
    const courses = SEED_RESOURCES.filter((r) => r.type === "COURSE");
    for (const c of courses) {
      expect(c.externalUrl, `${c.slug} lost its site`).toBeTruthy();
      if (c.meta?.videoUrl) {
        expect(c.meta.videoUrl, `${c.slug} points both links at the same place`).not.toBe(
          c.externalUrl
        );
      }
    }
  });
});

describe("levels", () => {
  it("gives every resource one", () => {
    for (const r of SEED_RESOURCES) expect(isLevel(r.level), `${r.slug}`).toBe(true);
  });

  it("marks the Bible as open to everyone rather than rating its difficulty", () => {
    const bible = SEED_BOOKS.find((b) => b.slug === "the-holy-bible")!;
    expect(bible.level).toBe("EVERYONE");
  });

  it("reserves that level for the one book that earns it", () => {
    const everyone = SEED_RESOURCES.filter((r) => r.level === "EVERYONE");
    expect(everyone.map((r) => r.slug)).toEqual(["the-holy-bible"]);
  });

  it("orders levels from open to demanding", () => {
    expect(compareLevel("EVERYONE", "BEGINNER")).toBeLessThan(0);
    expect(compareLevel("BEGINNER", "ADVANCED")).toBeLessThan(0);
    expect(compareLevel("ADVANCED", "INTERMEDIATE")).toBeGreaterThan(0);
    expect(compareLevel("BEGINNER", "BEGINNER")).toBe(0);
  });

  it("spreads the fifty books across the difficulty levels", () => {
    // All fifty at one level would mean the field carries no information.
    const used = new Set(SEED_BOOKS.map((b) => b.level));
    expect(used.size).toBeGreaterThanOrEqual(3);
  });
});

describe("backup coverage", () => {
  it("includes every library table", () => {
    for (const table of [
      "resourceCategories",
      "resourceSubtags",
      "learningResources",
      "learningResourceMeta",
      "learningResourceCategories",
      "learningResourceSubtags",
    ]) {
      expect(BACKUP_TABLES, `${table} would be lost on backup`).toContain(table);
    }
  });

  it("orders the taxonomy before the things that reference it", () => {
    const at = (t: string) => (BACKUP_TABLES as readonly string[]).indexOf(t);
    expect(at("resourceCategories")).toBeLessThan(at("resourceSubtags"));
    expect(at("resourceSubtags")).toBeLessThan(at("learningResourceSubtags"));
    expect(at("learningResources")).toBeLessThan(at("learningResourceMeta"));
    expect(at("learningResources")).toBeLessThan(at("learningResourceCategories"));
    expect(at("resourceCategories")).toBeLessThan(at("learningResourceCategories"));
  });

  it("carries the editorial fields, so a restore doesn't demote the first book", () => {
    // Backup copies whole rows, so this is really a check that the columns
    // exist on the table the backup reads — the failure mode is silent.
    for (const column of ["editorialRank", "heroFeatured", "specialBadge", "specialDescription"]) {
      expect(Object.keys(learningResources), `${column} missing`).toContain(column);
    }
  });

  it("carries the edition fields, so your copy survives a restore", () => {
    for (const column of ["translation", "edition", "publisher", "isbn13", "coverUrl"]) {
      expect(Object.keys(learningResourceMeta), `${column} missing`).toContain(column);
    }
  });

  it("has no per-medium category tables", () => {
    for (const forbidden of ["bookCategories", "videoCategories", "podcastCategories", "courseCategories"]) {
      expect(BACKUP_TABLES).not.toContain(forbidden);
    }
  });
});
