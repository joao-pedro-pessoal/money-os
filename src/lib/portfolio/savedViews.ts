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

import { choiceText, cleanChoices } from "../filters/multi";

export const VIEW_SCOPE_ANALYSIS = "investments-analysis";

/** Keys the analysis screen understands. Anything else is dropped. */
const ALLOWED_KEYS = ["groupBy", "sort", "dir", "synced", "status"] as const;

export interface ViewConfig {
  groupBy?: string;
  sort?: string;
  dir?: string;
  synced?: string;
  status?: string;
  /** A second grouping inside the first. */
  then?: string;
  /** Several values per dimension, written as repeated `f_<dimension>` parameters. */
  filters?: Partial<Record<string, string[]>>;
}

/** The address parameter one dimension's filter is written under. */
export const filterParam = (key: string) => `f_${key}`;

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
  if (config.then) params.set("then", config.then);
  // Sorted too, so ticking Crypto then ETF saves the same view as ETF then Crypto.
  for (const key of Object.keys(config.filters ?? {}).sort()) {
    for (const value of [...(config.filters?.[key] ?? [])].sort()) params.append(filterParam(key), value);
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

  const status = params.get("status");
  if (status === "open" || status === "closed" || status === "both") config.status = status;

  // A second grouping that is the first one again would split nothing.
  const then = params.get("then");
  if (then && allowed.groupBy.includes(then) && then !== config.groupBy) config.then = then;

  // Values are not checked against what exists here: playlists come and go,
  // and the screen drops the ones that are gone when it applies them.
  const filters: Record<string, string[]> = {};
  for (const key of allowed.groupBy) {
    const chosen = cleanChoices(params.getAll(filterParam(key)));
    if (chosen.length > 0) filters[key] = chosen;
  }
  if (Object.keys(filters).length > 0) config.filters = filters;
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
  if (config.status === "open") parts.push("open positions");
  if (config.status === "closed") parts.push("closed trades");
  if (config.then) parts.push(`then by ${(labels.groupBy[config.then] ?? config.then).toLowerCase()}`);
  for (const [key, values] of Object.entries(config.filters ?? {})) {
    if (values && values.length > 0) parts.push(`${(labels.groupBy[key] ?? key).toLowerCase()}: ${choiceText(values)}`);
  }
  return parts.join(", ") || "Saved view";
}

/** Trims and length-caps a name so the chip row stays readable. */
export function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed;
}
