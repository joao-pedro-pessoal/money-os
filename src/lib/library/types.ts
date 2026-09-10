/**
 * The Knowledge Library's vocabulary.
 *
 * Four types, one taxonomy. A podcast episode and a podcast series are both
 * PODCAST; a single lecture is a VIDEO and a lecture series is a COURSE. The
 * distinction that matters is how you consume it, not how the platform files
 * it — and every extra type would have needed its own category tree.
 */

export const RESOURCE_TYPES = [
  {
    value: "BOOK",
    label: "Books",
    singular: "Book",
    help: "Physical books, ebooks and audiobooks.",
    defaultUnit: "PAGES",
  },
  {
    value: "VIDEO",
    label: "Videos",
    singular: "Video",
    help: "A single YouTube video, interview, documentary or lecture.",
    defaultUnit: "MINUTES",
  },
  {
    value: "PODCAST",
    label: "Podcasts",
    singular: "Podcast",
    help: "A podcast episode or a whole series.",
    defaultUnit: "MINUTES",
  },
  {
    value: "COURSE",
    label: "Courses",
    singular: "Course",
    help: "University courses, lecture series, and YouTube lecture playlists.",
    defaultUnit: "LESSONS",
  },
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number]["value"];

/**
 * How much you need to bring to it.
 *
 * EVERYONE isn't a fourth difficulty between the others — it's the absence of a
 * difficulty claim, for a book that meets a reader wherever they are. Ordered
 * from most open to most demanding, and `order` is what the UI sorts and
 * colours by, so adding a level doesn't mean touching three components.
 */
export const LEVELS = [
  { value: "EVERYONE", label: "For everyone", order: 0, hint: "No prior reading assumed." },
  { value: "BEGINNER", label: "Beginner", order: 1, hint: "A good first book on the subject." },
  {
    value: "INTERMEDIATE",
    label: "Intermediate",
    order: 2,
    hint: "Assumes you've met the basics.",
  },
  { value: "ADVANCED", label: "Advanced", order: 3, hint: "Demanding; worth the effort." },
] as const;

export type Level = (typeof LEVELS)[number]["value"];

export const STATUSES = [
  { value: "SAVED", label: "Saved" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ABANDONED", label: "Abandoned" },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export const PROGRESS_UNITS = [
  { value: "PAGES", label: "pages", noun: "page" },
  { value: "MINUTES", label: "minutes", noun: "minute" },
  { value: "LESSONS", label: "lessons", noun: "lesson" },
  { value: "PERCENTAGE", label: "%", noun: "percent" },
] as const;

export type ProgressUnit = (typeof PROGRESS_UNITS)[number]["value"];

export function isResourceType(v: string): v is ResourceType {
  return RESOURCE_TYPES.some((t) => t.value === v);
}

export function isLevel(v: string): v is Level {
  return LEVELS.some((l) => l.value === v);
}

export function levelInfo(level: Level) {
  return LEVELS.find((l) => l.value === level)!;
}

/** Open first, demanding last. */
export function compareLevel(a: Level, b: Level): number {
  return levelInfo(a).order - levelInfo(b).order;
}

export function isStatus(v: string): v is Status {
  return STATUSES.some((s) => s.value === v);
}

export function isProgressUnit(v: string): v is ProgressUnit {
  return PROGRESS_UNITS.some((u) => u.value === v);
}

/** The unit that suits a type, used when adding a resource. */
export function defaultUnitFor(type: ResourceType): ProgressUnit {
  return RESOURCE_TYPES.find((t) => t.value === type)!.defaultUnit as ProgressUnit;
}

/**
 * Types that cannot exist without somewhere to go.
 *
 * A book you own needs no link; a video, podcast or course is the link — the
 * app hosts nothing, so a row without one points at nothing at all.
 */
export const REQUIRES_URL: ResourceType[] = ["VIDEO", "PODCAST", "COURSE"];

export function requiresUrl(type: ResourceType): boolean {
  return REQUIRES_URL.includes(type);
}

/** Which type-specific fields belong on a form or a detail page. */
export function relevantFields(type: ResourceType): string[] {
  switch (type) {
    case "BOOK":
      // translation / edition / publisher describe *your copy*. Two Bibles can
      // differ in translation, canon, page count and ISBN and still be the same
      // book, so the library keeps one entry and records the edition here.
      return [
        "isbn13",
        "pageCount",
        "coverUrl",
        "affiliateUrl",
        "translator",
        "translation",
        "edition",
        "publisher",
      ];
    case "VIDEO":
      return ["platform", "durationMinutes", "channelName"];
    case "PODCAST":
      return ["platform", "durationMinutes", "hostName", "guestName"];
    case "COURSE":
      return ["platform", "institution", "instructor", "lessonCount", "completedLessons", "estimatedHours"];
  }
}

/**
 * Should this field be shown for this type?
 *
 * Used by the detail page so a podcast never displays an ISBN — the spec's
 * example, and the sort of thing that makes an app feel like a database form.
 */
export function isRelevant(type: ResourceType, field: string): boolean {
  return relevantFields(type).includes(field);
}
