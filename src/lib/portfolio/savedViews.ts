/**
 * Named filter/group/sort combinations for the analysis screen.
 *
 * The analysis already keeps its whole state in the query string, so a saved
 * view is just that string with a name on it — no parallel representation to
 * keep in sync.
 *
 * Everything read back out is validated against a whitelist. A view saved
 * before an option was renamed must degrade to a sensible default, not produce
 * a URL that renders an empty screen; and since the config is a string in the
 * database, treating it as trusted input would be careless.
 */

export const VIEW_SCOPE_ANALYSIS = "investments-analysis";

/** Keys the analysis screen understands. Anything else is dropped. */
const ALLOWED_KEYS = ["groupBy", "sort", "dir", "synced"] as const;

export interface ViewConfig {
  groupBy?: string;
  sort?: string;
  dir?: string;
  synced?: string;
}

/**
 * Turns the current screen state into something storable.
 *
 * Keys are written in a fixed order so the same view always produces the same
 * string, which makes "you already saved this one" detectable.
 */
export function serialiseView(config: ViewConfig): string {
  const params = new URLSearchParams();
  for (const key of ALLOWED_KEYS) {
    const value = config[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

/** Reads a stored config, keeping only keys and values the screen accepts. */
export function parseView(
  raw: string,
  allowed: { groupBy: string[]; sort: string[] }
): ViewConfig {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return {};
  }

  const config: ViewConfig = {};
  const groupBy = params.get("groupBy");
  const sort = params.get("sort");
  const dir = params.get("dir");
  const synced = params.get("synced");

  if (groupBy && allowed.groupBy.includes(groupBy)) config.groupBy = groupBy;
  if (sort && allowed.sort.includes(sort)) config.sort = sort;
  if (dir === "asc" || dir === "desc") config.dir = dir;
  if (synced === "on" || synced === "off") config.synced = synced;

  return config;
}

/** True when two configs describe the same screen. */
export function sameView(a: ViewConfig, b: ViewConfig): boolean {
  return serialiseView(a) === serialiseView(b);
}

/**
 * A readable name suggested from the settings, so saving needs no typing.
 *
 * Not clever, deliberately: a wrong-but-obvious default like "By risk level,
 * top return" is easier to correct than a blank field is to fill.
 */
export function suggestName(
  config: ViewConfig,
  labels: { groupBy: Record<string, string>; sort: Record<string, string> }
): string {
  const parts: string[] = [];
  if (config.groupBy) parts.push(`By ${(labels.groupBy[config.groupBy] ?? config.groupBy).toLowerCase()}`);
  if (config.sort) {
    const direction = config.dir === "asc" ? "lowest" : "highest";
    parts.push(`${direction} ${(labels.sort[config.sort] ?? config.sort).toLowerCase()}`);
  }
  if (config.synced === "off") parts.push("manual only");
  return parts.join(", ") || "Saved view";
}

/** Trims and length-caps a name so the chip row stays readable. */
export function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed;
}
