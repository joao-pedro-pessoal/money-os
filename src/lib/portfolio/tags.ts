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


export const ASSET_TYPES = [
  { value: "cash", label: "Cash parado" },
  { value: "stablecoin", label: "Stablecoin" },
  { value: "staking", label: "Staking / a render" },
  { value: "crypto", label: "Cripto" },
  { value: "stock", label: "Ações" },
  { value: "etf", label: "ETF" },
  { value: "bond", label: "Obrigações" },
  { value: "real_estate", label: "Imobiliário" },
  { value: "other", label: "Outro" },
] as const;

/** Retired value kept only so older rows still render a readable label. */
const LEGACY_ASSET_TYPES = [{ value: "stock_etf", label: "Ações / ETF (antigo)" }] as const;

/**
 * Coins treated as stablecoins wherever one is recognised automatically —
 * synced balances, and the Add position form. Capital is (near) guaranteed and
 * the price is 1:1, so no entry price or risk level is worth asking for.
 */
export const STABLECOIN_SYMBOLS = [
  "USDC", "USDT", "EURC", "EURS", "DAI", "USDE", "USDS", "TUSD", "FDUSD", "PYUSD", "USD", "EUR",
];

export function isStablecoin(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  return STABLECOIN_SYMBOLS.includes(symbol.trim().toUpperCase());
}

/**
 * Asset types that can earn a yield. The APR field is only shown for these —
 * an APR on a plain stock position would be meaningless.
 */
export const YIELD_BEARING_ASSET_TYPES: string[] = ["staking", "stablecoin", "cash", "bond"];

export const DIRECTIONS = [
  { value: "long", label: "Long (sobe = ganho)" },
  { value: "short", label: "Short (desce = ganho)" },
] as const;

/**
 * Asset types whose value is (near) capital-guaranteed. Used to split Net Worth
 * into a guaranteed part and a market-exposed ("floating") part.
 */
export const STABLE_ASSET_TYPES: string[] = ["cash", "stablecoin"];

const LABELS: Record<string, string> = Object.fromEntries(
  [
    ...RISK_LEVELS,
    ...EXPECTED_RETURNS,
    ...TIME_HORIZONS,
    ...LIQUIDITY_LEVELS,
    ...ASSET_TYPES,
    ...LEGACY_ASSET_TYPES,
    ...DIRECTIONS,
  ].map((o) => [
    o.value,
    o.label,
  ])
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
