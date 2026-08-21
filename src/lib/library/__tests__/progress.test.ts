import { describe, it, expect } from "vitest";
import { progressView, statusAfterProgress, libraryStats, slugify } from "../progress";
import type { StatInput } from "../progress";

describe("progressView", () => {
  it("reads a book in pages", () => {
    const v = progressView({
      progress: 120,
      totalUnits: 400,
      progressUnit: "PAGES",
      status: "IN_PROGRESS",
    });
    expect(v.label).toBe("120 of 400 pages");
    expect(v.percent).toBe(30);
  });

  it("reads a video in minutes", () => {
    const v = progressView({
      progress: 25,
      totalUnits: 60,
      progressUnit: "MINUTES",
      status: "IN_PROGRESS",
    });
    expect(v.label).toBe("25 of 60 minutes");
    expect(v.percent).toBeCloseTo(41.67, 1);
  });

  it("reads a podcast in minutes", () => {
    const v = progressView({
      progress: 45,
      totalUnits: 90,
      progressUnit: "MINUTES",
      status: "IN_PROGRESS",
    });
    expect(v.percent).toBe(50);
  });

  it("reads a course in lessons", () => {
    const v = progressView({
      progress: 8,
      totalUnits: 24,
      progressUnit: "LESSONS",
      status: "IN_PROGRESS",
    });
    expect(v.label).toBe("8 of 24 lessons");
    expect(v.percent).toBeCloseTo(33.33, 1);
  });

  it("needs no total for a percentage", () => {
    const v = progressView({
      progress: 40,
      totalUnits: null,
      progressUnit: "PERCENTAGE",
      status: "IN_PROGRESS",
    });
    expect(v.percent).toBe(40);
    expect(v.label).toBe("40%");
  });

  it("reports a raw count when no total is known", () => {
    // Inventing a denominator would produce a percentage of nothing.
    const v = progressView({
      progress: 30,
      totalUnits: null,
      progressUnit: "MINUTES",
      status: "IN_PROGRESS",
    });
    expect(v.percent).toBeNull();
    expect(v.label).toBe("30 minutes");
  });

  it("treats COMPLETED as finished even if the counter lags", () => {
    // A book marked done at page 380 of 400 is done; the counter is bookkeeping.
    const v = progressView({
      progress: 380,
      totalUnits: 400,
      progressUnit: "PAGES",
      status: "COMPLETED",
    });
    expect(v.percent).toBe(100);
    expect(v.complete).toBe(true);
    expect(v.label).toBe("400 of 400 pages");
  });

  it("never exceeds the total", () => {
    const v = progressView({
      progress: 500,
      totalUnits: 400,
      progressUnit: "PAGES",
      status: "IN_PROGRESS",
    });
    expect(v.done).toBe(400);
    expect(v.percent).toBe(100);
  });

  it("never goes below zero", () => {
    const v = progressView({
      progress: -20,
      totalUnits: 400,
      progressUnit: "PAGES",
      status: "SAVED",
    });
    expect(v.done).toBe(0);
  });

  it("caps a percentage at 100", () => {
    const v = progressView({
      progress: 150,
      totalUnits: null,
      progressUnit: "PERCENTAGE",
      status: "IN_PROGRESS",
    });
    expect(v.percent).toBe(100);
  });

  it("treats a zero total as no total, not as a divide by zero", () => {
    const v = progressView({
      progress: 10,
      totalUnits: 0,
      progressUnit: "PAGES",
      status: "IN_PROGRESS",
    });
    expect(v.percent).toBeNull();
    expect(Number.isFinite(v.done)).toBe(true);
  });
});

describe("marking something completed", () => {
  it("fills the bar for a percentage resource, whatever the counter says", () => {
    // The reported bug: status Completed, bar at 0%, which reads as a failed
    // save. The status check used to sit below the percentage branch's return.
    const view = progressView({
      progress: 0,
      totalUnits: null,
      progressUnit: "PERCENTAGE",
      status: "COMPLETED",
    });
    expect(view.percent).toBe(100);
    expect(view.done).toBe(100);
    expect(view.label).toBe("100%");
    expect(view.complete).toBe(true);
  });

  it("fills the bar for a counted resource too", () => {
    const view = progressView({
      progress: 12,
      totalUnits: 400,
      progressUnit: "PAGES",
      status: "COMPLETED",
    });
    expect(view.percent).toBe(100);
    expect(view.done).toBe(400);
  });

  it("leaves an unfinished percentage where it is", () => {
    const view = progressView({
      progress: 40,
      totalUnits: null,
      progressUnit: "PERCENTAGE",
      status: "IN_PROGRESS",
    });
    expect(view.percent).toBe(40);
    expect(view.complete).toBe(false);
  });

  it("still counts 100% as complete without the status", () => {
    const view = progressView({
      progress: 100,
      totalUnits: null,
      progressUnit: "PERCENTAGE",
      status: "SAVED",
    });
    expect(view.complete).toBe(true);
  });
});

describe("statusAfterProgress", () => {
  const view = (done: number, total: number) =>
    progressView({ progress: done, totalUnits: total, progressUnit: "PAGES", status: "IN_PROGRESS" });

  it("starts something when the first page is read", () => {
    expect(statusAfterProgress("SAVED", view(1, 400))).toBe("IN_PROGRESS");
  });

  it("completes it at the end", () => {
    expect(statusAfterProgress("IN_PROGRESS", view(400, 400))).toBe("COMPLETED");
  });

  it("leaves an abandoned resource abandoned", () => {
    // Giving up is a decision. Opening the book again shouldn't erase it.
    expect(statusAfterProgress("ABANDONED", view(50, 400))).toBe("ABANDONED");
    expect(statusAfterProgress("ABANDONED", view(400, 400))).toBe("ABANDONED");
  });

  it("leaves an untouched resource saved", () => {
    expect(statusAfterProgress("SAVED", view(0, 400))).toBe("SAVED");
  });

  it("reopens a completed resource when progress is wound back", () => {
    expect(statusAfterProgress("COMPLETED", view(100, 400))).toBe("IN_PROGRESS");
  });
});

describe("libraryStats", () => {
  const items: StatInput[] = [
    {
      type: "BOOK",
      status: "COMPLETED",
      progress: 400,
      totalUnits: 400,
      progressUnit: "PAGES",
      categories: ["Philosophy"],
    },
    {
      type: "BOOK",
      status: "IN_PROGRESS",
      progress: 120,
      totalUnits: 400,
      progressUnit: "PAGES",
      categories: ["Philosophy", "Psychology"],
    },
    {
      type: "VIDEO",
      status: "COMPLETED",
      progress: 60,
      totalUnits: 60,
      progressUnit: "MINUTES",
      categories: ["Philosophy"],
    },
    {
      type: "PODCAST",
      status: "IN_PROGRESS",
      progress: 45,
      totalUnits: 90,
      progressUnit: "MINUTES",
      categories: [],
    },
    {
      type: "COURSE",
      status: "IN_PROGRESS",
      progress: 8,
      totalUnits: 24,
      progressUnit: "LESSONS",
      categories: ["Economics"],
    },
  ];

  it("counts each type separately", () => {
    const s = libraryStats(items);
    expect(s.byType.BOOK.total).toBe(2);
    expect(s.byType.BOOK.completed).toBe(1);
    expect(s.byType.VIDEO.completed).toBe(1);
    expect(s.byType.COURSE.inProgress).toBe(1);
  });

  it("never adds pages to minutes", () => {
    // The whole reason the unit lives on the resource.
    const s = libraryStats(items);
    expect(s.byType.BOOK.unitsDone).toBe(520);
    expect(s.byType.BOOK.unit).toBe("PAGES");
    expect(s.byType.VIDEO.unitsDone).toBe(60);
    expect(s.byType.VIDEO.unit).toBe("MINUTES");
    expect(s.byType.PODCAST.unitsDone).toBe(45);
    expect(s.byType.COURSE.unitsDone).toBe(8);
    expect(s.byType.COURSE.unit).toBe("LESSONS");
  });

  it("counts a resource in each of its categories", () => {
    const s = libraryStats(items);
    const philosophy = s.byCategory.find((c) => c.category === "Philosophy")!;
    expect(philosophy.total).toBe(3);
    expect(philosophy.completed).toBe(2);
  });

  it("contributes no units from a percentage-tracked resource", () => {
    // A percentage of a book is not a number of pages.
    const s = libraryStats([
      {
        type: "BOOK",
        status: "IN_PROGRESS",
        progress: 50,
        totalUnits: null,
        progressUnit: "PERCENTAGE",
        categories: [],
      },
    ]);
    expect(s.byType.BOOK.unitsDone).toBe(0);
    expect(s.byType.BOOK.total).toBe(1);
  });

  it("reports every type even when empty", () => {
    const s = libraryStats([]);
    expect(Object.keys(s.byType).sort()).toEqual(["BOOK", "COURSE", "PODCAST", "VIDEO"]);
    expect(s.byType.BOOK.total).toBe(0);
  });
});

describe("slugify", () => {
  it("makes a URL-safe slug", () => {
    expect(slugify("Introduction to Political Philosophy")).toBe(
      "introduction-to-political-philosophy"
    );
  });

  it("strips accents rather than dropping the letters", () => {
    expect(slugify("Crime e Castigo — Dostoiévski")).toBe("crime-e-castigo-dostoievski");
  });

  it("collapses punctuation and trims dashes", () => {
    expect(slugify("  Justice: What's the Right Thing to Do?  ")).toBe(
      "justice-what-s-the-right-thing-to-do"
    );
  });

  it("is empty for nothing usable", () => {
    expect(slugify("!!!")).toBe("");
  });
});
