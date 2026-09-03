const src = require("fs").readFileSync("src/lib/portfolio/tags.ts", "utf8");
const groups = {};
for (const name of ["RISK_LEVELS","EXPECTED_RETURNS","TIME_HORIZONS","LIQUIDITY_LEVELS","ASSET_TYPES","LEGACY_ASSET_TYPES","DIRECTIONS"]) {
  const m = new RegExp("export const " + name + " = \[([\s\S]*?)\] as const;").exec(src);
  if (!m) continue;
  groups[name] = [...m[1].matchAll(/value:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map(x => [x[1], x[2]]);
}
const seen = new Map();
for (const [g, entries] of Object.entries(groups))
  for (const [v, l] of entries) seen.set(v, [...(seen.get(v) ?? []), `${g}="${l}"`]);
for (const [v, list] of seen) if (list.length > 1) console.log(`  "${v}" ->`, list.join("  |  "));
