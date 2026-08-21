/**
 * Progress, in whatever unit the thing is measured in.
 *
 * The unit is stored per resource precisely so that pages and minutes are
 * never added together. "You have done 340 units" across a book and a podcast
 * is a number with no meaning, and a statistic nobody can act on is worse than
 * no statistic at all.
 */

import {
  PROGRESS_UNITS,
  type ProgressUnit,
  type Status,
  type ResourceType,
} from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ProgressInput {
  progress: number;
  totalUnits: number | null;
  progressUnit: ProgressUnit;
  status: Status;
}

export interface ProgressView {
  done: number;
  total: number | null;
  unit: ProgressUnit;
  /** 0-100, or null when there's no total to measure against. */
  percent: number | null;
  label: string;
  complete: boolean;
}

/**
 * How far through something is.
 *
 * A PERCENTAGE resource needs no total — the progress IS the percentage. Every
 * other unit needs one, and without it we report the raw count rather than
 * inventing a denominator.
 */
export function progressView(input: ProgressInput): ProgressView {
  const unitLabel = PROGRESS_UNITS.find((u) => u.value === input.progressUnit)!;
  const done = Math.max(0, input.progress);

  if (input.progressUnit === "PERCENTAGE") {
    // Finished is finished. Marking something COMPLETED while the slider still
    // says 0 used to leave the bar empty and the label at 0%, which read as a
    // failed save — the status check sat below the return and never ran.
    const percent = input.status === "COMPLETED" ? 100 : Math.min(100, done);
    return {
      done: round2(percent),
      total: 100,
      unit: input.progressUnit,
      percent: round2(percent),
      label: `${round2(percent)}%`,
      complete: percent >= 100,
    };
  }

  const total = input.totalUnits === null || input.totalUnits <= 0 ? null : input.totalUnits;

  // Finishing something is the fact; the counter catching up is bookkeeping.
  // A book marked COMPLETED at page 380 of 400 is finished.
  if (input.status === "COMPLETED") {
    return {
      done: round2(total ?? done),
      total,
      unit: input.progressUnit,
      percent: 100,
      label: total
        ? `${round2(total)} of ${round2(total)} ${unitLabel.label}`
        : `${round2(done)} ${unitLabel.label}`,
      complete: true,
    };
  }

  if (total === null) {
    return {
      done: round2(done),
      total: null,
      unit: input.progressUnit,
      percent: null,
      label: `${round2(done)} ${unitLabel.label}`,
      complete: false,
    };
  }

  const capped = Math.min(done, total);
  return {
    done: round2(capped),
    total: round2(total),
    unit: input.progressUnit,
    percent: round2((capped / total) * 100),
    label: `${round2(capped)} of ${round2(total)} ${unitLabel.label}`,
    complete: capped >= total,
  };
}

/**
 * The status a change in progress implies.
 *
 * Only ever moves you forward into IN_PROGRESS or COMPLETED. Abandoning is a
 * decision, not something a page count should infer — and un-abandoning by
 * accidentally opening the book would lose the fact that you gave up on it.
 */
export function statusAfterProgress(current: Status, view: ProgressView): Status {
  if (current === "ABANDONED") return current;
  if (view.complete) return "COMPLETED";
  if (view.done > 0) return "IN_PROGRESS";
  return current === "COMPLETED" ? "IN_PROGRESS" : current;
}

export interface TypeStats {
  completed: number;
  inProgress: number;
  total: number;
  /** Units finished, in this type's own unit. Never mixed across types. */
  unitsDone: number;
  unit: ProgressUnit;
}

export interface LibraryStats {
  byType: Record<ResourceType, TypeStats>;
  byCategory: { category: string; completed: number; total: number }[];
}

export interface StatInput {
  type: ResourceType;
  status: Status;
  progress: number;
  totalUnits: number | null;
  progressUnit: ProgressUnit;
  categories: string[];
}

const EMPTY: Record<ResourceType, ProgressUnit> = {
  BOOK: "PAGES",
  VIDEO: "MINUTES",
  PODCAST: "MINUTES",
  COURSE: "LESSONS",
};

/**
 * Counts per type, kept apart.
 *
 * "Pages read" and "minutes watched" are separate lines because they measure
 * different things. Summing them would produce a bigger number and a smaller
 * amount of information.
 */
export function libraryStats(items: StatInput[]): LibraryStats {
  const byType = {} as Record<ResourceType, TypeStats>;
  for (const [type, unit] of Object.entries(EMPTY) as [ResourceType, ProgressUnit][]) {
    byType[type] = { completed: 0, inProgress: 0, total: 0, unitsDone: 0, unit };
  }

  const categories = new Map<string, { completed: number; total: number }>();

  for (const i of items) {
    const bucket = byType[i.type];
    if (!bucket) continue;

    bucket.total++;
    if (i.status === "COMPLETED") bucket.completed++;
    if (i.status === "IN_PROGRESS") bucket.inProgress++;

    // Percentage-tracked resources contribute no units: a percentage of a
    // book is not a number of pages, and guessing one would be inventing data.
    if (i.progressUnit !== "PERCENTAGE") {
      const view = progressView({
        progress: i.progress,
        totalUnits: i.totalUnits,
        progressUnit: i.progressUnit,
        status: i.status,
      });
      bucket.unitsDone += view.done;
    }

    for (const c of i.categories) {
      const entry = categories.get(c) ?? { completed: 0, total: 0 };
      entry.total++;
      if (i.status === "COMPLETED") entry.completed++;
      categories.set(c, entry);
    }
  }

  for (const bucket of Object.values(byType)) bucket.unitsDone = round2(bucket.unitsDone);

  return {
    byType,
    byCategory: [...categories.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.completed - a.completed || b.total - a.total),
  };
}

/** A URL-safe slug, unique-ified by the caller if it collides. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
