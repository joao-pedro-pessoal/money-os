/**
 * Reading an instrument's name when the platform won't say what it is.
 *
 * IBKR reports both ordinary shares and ETFs as `STK`. A holding you typed in
 * yourself has no label at all. So the ticker is useless — `IGLAI_EQ` and a
 * share look identical — but the *name* usually isn't: European funds are
 * legally obliged to carry "UCITS" in theirs, and commodity products say ETC.
 *
 * The rule that governs everything here: **evidence, not vibes.** A rule earns
 * its place only if it is nearly always right, and the ones that would be
 * merely often right are deliberately absent. This is the second-choice source
 * — anything the platform states outright wins over it — and it never
 * overwrites a type you set by hand.
 *
 * Order matters and is load-bearing. A bond ETF is an ETF, not a bond; a
 * Bitcoin ETP is an ETF, not crypto. Wrapper first, contents second.
 *
 * Pure — no network, no DB.
 */

import type { AssetTypeValue } from "./tags";

export interface NameEvidence {
  value: AssetTypeValue;
  reason: string;
}

/** Upper-cased, punctuation flattened to spaces, so word boundaries hold. */
export function normaliseName(name: string): string {
  return ` ${name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
}

const has = (haystack: string, word: string) => haystack.includes(` ${word} `);

/**
 * Rules, in the order they're tried.
 *
 * Each is a claim strong enough to act on alone. "iShares" is not on this list:
 * iShares issues ETFs, ETCs and bond funds alike, so the issuer tells you who
 * made it and nothing about what it is.
 */
const RULES: { test: (n: string) => boolean; value: AssetTypeValue; reason: string }[] = [
  {
    // A UCITS fund is a fund by law. This single rule catches most of what a
    // European portfolio holds.
    test: (n) => has(n, "UCITS"),
    value: "etf",
    reason: "The name says UCITS, which in Europe means a fund.",
  },
  {
    test: (n) => has(n, "ETF") || has(n, "ETP") || has(n, "EXCHANGE TRADED FUND"),
    value: "etf",
    reason: "The name says it's an exchange-traded fund.",
  },
  {
    // ETC: an exchange-traded commodity. The wrapper is a fund but what it
    // tracks is metal or energy, and the risk analysis cares about the latter.
    test: (n) => has(n, "ETC") || has(n, "PHYSICAL GOLD") || has(n, "PHYSICAL SILVER"),
    value: "commodity",
    reason: "An exchange-traded commodity — it tracks metal or energy.",
  },
  {
    test: (n) => has(n, "REIT") || has(n, "REAL ESTATE INVESTMENT TRUST"),
    value: "real_estate",
    reason: "The name says it's a real estate investment trust.",
  },
  {
    // Only when nothing above matched, so a bond *fund* is already an ETF.
    test: (n) =>
      has(n, "TREASURY") ||
      has(n, "GILT") ||
      has(n, "BUND") ||
      has(n, "OBRIGACOES") ||
      /\b\d(\s\d)*\s\d{2}\s\d{2}\s\d{4}\b/.test(n),
    value: "bond",
    reason: "The name looks like a government or corporate bond.",
  },
];

/**
 * What the name says, or null when it says nothing definite.
 *
 * Null is the common answer and the correct one — "Apple Inc" doesn't announce
 * that it's a share, and inferring one from the absence of fund words would be
 * exactly the guess this file exists to avoid.
 */
export function classifyByName(name: string | null | undefined): NameEvidence | null {
  if (!name || name.trim().length < 2) return null;
  const n = normaliseName(name);

  for (const rule of RULES) {
    if (rule.test(n)) return { value: rule.value, reason: rule.reason };
  }
  return null;
}

/**
 * Does the name contradict a platform's claim that this is an ordinary share?
 *
 * IBKR's `STK` covers shares and ETFs together. When the name carries fund
 * evidence, the name is the better source — that's the one case where this
 * module overrules a platform rather than only filling a gap.
 */
export function contradictsStock(name: string | null | undefined): NameEvidence | null {
  const found = classifyByName(name);
  if (!found) return null;
  return found.value === "etf" || found.value === "commodity" || found.value === "real_estate"
    ? found
    : null;
}
