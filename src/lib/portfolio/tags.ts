/**
 * Asset-allocation classification tags for holdings. These are descriptive
 * labels only — they never feed into P&L math (see src/lib/portfolio/index.ts).
 * Values mirror a standard risk/return/time-horizon/liquidity framework so a
 * holding's purpose is obvious at a glance (e.g. never mistake emergency-fund
 * money for a long-term, high-risk position).
 */

export const RISK_LEVELS = [
  { value: "low", label: "Low risk" },
  { value: "medium", label: "Medium risk" },
  { value: "high", label: "High risk" },
  { value: "very_high", label: "Very high risk" },
] as const;

export const EXPECTED_RETURNS = [
  { value: "conservative", label: "Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
] as const;

export const TIME_HORIZONS = [
  { value: "short", label: "Short term" },
  { value: "medium", label: "Medium term" },
  { value: "long", label: "Long term" },
] as const;

export const LIQUIDITY_LEVELS = [
  { value: "high", label: "High liquidity" },
  { value: "low", label: "Low liquidity" },
] as const;

const LABELS: Record<string, string> = Object.fromEntries(
  [...RISK_LEVELS, ...EXPECTED_RETURNS, ...TIME_HORIZONS, ...LIQUIDITY_LEVELS].map((o) => [o.value, o.label])
);

export function tagLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return LABELS[value] ?? value;
}

/** Colour hint for the risk tag specifically — the one where a quick visual read matters most. */
export function riskColor(value: string | null | undefined): string {
  switch (value) {
    case "low":
      return "var(--green)";
    case "medium":
      return "var(--amber)";
    case "high":
    case "very_high":
      return "var(--red)";
    default:
      return "var(--muted)";
  }
}
