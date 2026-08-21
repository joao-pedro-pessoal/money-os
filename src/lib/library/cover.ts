/**
 * Covers, without hosting or downloading anything.
 *
 * Three constraints met at once:
 *
 *  - The app must not host or download external media.
 *  - Nothing may be invented — and a cover URL guessed from a title is exactly
 *    that: it either 404s or, worse, shows a different book's jacket.
 *  - Open Library's API didn't answer when this was written, so no verified
 *    cover URL could be recorded for the starter list either.
 *
 * So the cover is drawn from what we already know for certain: the title and
 * the author. The palette is derived from the slug, which means a book keeps
 * the same colours forever without storing anything, and two books next to each
 * other are reliably different. Paste a real cover URL on any resource and it
 * takes over — see `coverUrl` on the edition form.
 *
 * Pure — no DB, no React, no network.
 */

export interface CoverPalette {
  /** Background, darkest first. */
  from: string;
  to: string;
  ink: string;
  rule: string;
}

/**
 * Muted, bookish, and deliberately few.
 *
 * Bright generated colours make a shelf look like a link farm. These are the
 * colours of cloth bindings, which is the effect a wall of them should have.
 */
const PALETTES: CoverPalette[] = [
  { from: "#1d2a33", to: "#111a20", ink: "#d8e2e8", rule: "#4a6070" }, // slate
  { from: "#2a2019", to: "#181210", ink: "#e6d8c6", rule: "#7a5c3e" }, // leather
  { from: "#1e2a22", to: "#121a15", ink: "#d5e3d8", rule: "#4c6f57" }, // forest
  { from: "#2b1c26", to: "#181016", ink: "#e6d3df", rule: "#7a4d68" }, // plum
  { from: "#2a2416", to: "#17140c", ink: "#e8dcb8", rule: "#8a7434" }, // ochre
  { from: "#1a2333", to: "#101620", ink: "#d6dcec", rule: "#4a5a86" }, // indigo
  { from: "#2d1e1c", to: "#191110", ink: "#ecd6d0", rule: "#8a4f42" }, // brick
  { from: "#1c2a2b", to: "#101a1a", ink: "#d3e4e4", rule: "#43706f" }, // teal
];

/**
 * A small, stable hash.
 *
 * FNV-1a: not cryptographic, and doesn't need to be. It only has to give the
 * same slug the same number on every machine and every reload, which
 * `Math.random` and object iteration order both fail to do.
 */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function paletteFor(seed: string): CoverPalette {
  return PALETTES[hashString(seed) % PALETTES.length];
}

/**
 * The title, broken into lines that fit the spine.
 *
 * Long words are left long rather than hyphenated — a broken word on a cover
 * looks like a rendering bug. The last line is elided if the title genuinely
 * doesn't fit.
 */
export function coverLines(title: string, maxChars: number, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  return kept;
}

/** Surname only, or the whole thing when there isn't one to find. */
export function coverByline(creator: string): string {
  const first = creator.split(/\s+(?:and|&|e)\s+|,\s*/i)[0].trim();
  // "Robert J. Shiller — Yale University" → "Shiller"
  const beforeDash = first.split("—")[0].trim();
  const parts = beforeDash.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : beforeDash;
}
