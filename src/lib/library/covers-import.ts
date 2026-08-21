/**
 * Importing cover art from a reviewed list.
 *
 * The rule this whole file exists to enforce: **a cover is only ever assigned
 * from a row a human filled in**. Nothing here searches, guesses, or infers an
 * image from a title. A guessed cover URL either 404s or, worse, silently shows
 * a different book's jacket — and you'd have no way of knowing which.
 *
 * So a row with an empty `cover_url` is reported as unresolved and skipped. It
 * is never an error, and it never leaves a book worse off than before.
 *
 * Pure — no DB, no filesystem, no network.
 */

import { isSafeUrl } from "./links";

export interface CoverRow {
  /** Whatever the sheet used to name the book: a slug, or the title. */
  key: string;
  title: string;
  url: string;
  /** 1-based, counting the header, so a message can name the line to fix. */
  line: number;
}

export type SkipReason = "no-url" | "unsafe-url" | "unknown-book";

export interface CoverAssignment {
  slug: string;
  url: string;
}

export interface CoverSkip {
  key: string;
  title: string;
  line: number;
  reason: SkipReason;
}

export interface CoverImportPlan {
  assign: CoverAssignment[];
  skipped: CoverSkip[];
}

/** Quoted fields, doubled quotes inside them, commas inside quotes. */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Reads the sheet.
 *
 * Column names are matched loosely because these files get edited in Excel and
 * come back with different capitalisation. A file missing a URL column at all
 * throws, because silently importing nothing looks identical to success.
 */
export function parseCoverCsv(text: string): CoverRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => headers.findIndex((h) => names.includes(h));

  const keyAt = find("coverkey", "slug", "key");
  const titleAt = find("title", "book");
  const urlAt = find("coverurl", "url", "image", "imageurl");

  if (urlAt === -1) {
    throw new Error(
      "No cover URL column found. Expected a header called cover_url, url, or image_url."
    );
  }
  if (keyAt === -1 && titleAt === -1) {
    throw new Error("No way to identify the book. Expected a cover_key, slug or title column.");
  }

  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    return {
      key: keyAt === -1 ? "" : (cells[keyAt] ?? ""),
      title: titleAt === -1 ? "" : (cells[titleAt] ?? ""),
      url: cells[urlAt] ?? "",
      line: i + 2,
    };
  });
}

/** Lowercase, unaccented, punctuation stripped — for matching titles. */
export function normaliseTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // Apostrophes are removed rather than turned into a space, so "Man's" and
    // "Mans" land on the same key — a sheet filled in by hand will contain both.
    .replace(/['‘’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Works out what to write, and what to report instead of writing.
 *
 * Matching is by slug first, then by normalised title. Titles are how these
 * sheets are actually filled in by hand, and slugs drift between a hand-off and
 * a codebase — but a title that matches nothing is reported rather than guessed
 * at with fuzzy distance.
 *
 * A local path (`/covers/x.jpg`) is accepted as-is: those are files you put in
 * `public/` yourself, so there's nothing to verify beyond the shape.
 */
export function planCoverImport(
  rows: CoverRow[],
  library: { slug: string; title: string }[]
): CoverImportPlan {
  const bySlug = new Map(library.map((r) => [r.slug, r.slug]));
  const byTitle = new Map(library.map((r) => [normaliseTitle(r.title), r.slug]));

  const assign: CoverAssignment[] = [];
  const skipped: CoverSkip[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const slug =
      bySlug.get(row.key) ??
      byTitle.get(normaliseTitle(row.key)) ??
      byTitle.get(normaliseTitle(row.title));

    const url = row.url.trim();

    if (url === "") {
      skipped.push({ ...row, reason: "no-url" });
      continue;
    }
    if (slug === undefined) {
      skipped.push({ ...row, reason: "unknown-book" });
      continue;
    }
    const local = url.startsWith("/") && !url.startsWith("//");
    if (!local && !isSafeUrl(url)) {
      skipped.push({ ...row, reason: "unsafe-url" });
      continue;
    }
    // Last row wins, and the earlier one is not reported as a problem: editing
    // a sheet by appending a corrected line is a normal thing to do.
    if (seen.has(slug)) {
      const at = assign.findIndex((a) => a.slug === slug);
      assign[at] = { slug, url };
      continue;
    }

    seen.add(slug);
    assign.push({ slug, url });
  }

  return { assign, skipped };
}

/** A human-readable line per skip, for the script's output. */
export function describeSkip(skip: CoverSkip): string {
  const who = skip.title || skip.key || `line ${skip.line}`;
  switch (skip.reason) {
    case "no-url":
      return `${who}: no cover URL yet — left as it was.`;
    case "unknown-book":
      return `${who} (line ${skip.line}): no book in the library matches this. Check the title.`;
    case "unsafe-url":
      return `${who} (line ${skip.line}): the URL isn't http(s) or a /public path.`;
  }
}

/**
 * A search page for a book's cover — never an image URL.
 *
 * Open Library's search results let you pick the edition you actually own,
 * which is the step that can't be automated: editions differ in artwork, and
 * the app has no way to know which one is on your shelf.
 */
export function coverSearchUrl(title: string, creator: string): string {
  return `https://openlibrary.org/search?q=${encodeURIComponent(`${title} ${creator}`.trim())}`;
}
