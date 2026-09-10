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
  { value: "cash", label: "Idle cash" },
  { value: "stablecoin", label: "Stablecoin" },
  { value: "staking", label: "Staking / earning" },
  { value: "crypto", label: "Crypto" },
  { value: "stock", label: "Stocks" },
  { value: "etf", label: "ETF" },
  { value: "bond", label: "Bonds" },
  { value: "real_estate", label: "Real estate" },
  // A perp on gold is not crypto and not "other" — it tracks a commodity, and
  // that is what the risk analysis should see.
  { value: "commodity", label: "Commodities" },
  { value: "index", label: "Index" },
  { value: "other", label: "Other" },
] as const;

export type AssetTypeValue = (typeof ASSET_TYPES)[number]["value"];

/** Retired value kept only so older rows still render a readable label. */
const LEGACY_ASSET_TYPES = [{ value: "stock_etf", label: "Stocks / ETF (retired)" }] as const;

/**
 * Coins treated as stablecoins wherever one is recognised automatically —
 * synced balances, and the Add position form. Capital is (near) guaranteed and
 * the price is 1:1, so no entry price or risk level is worth asking for.
 */
/**
 * Stablecoins pegged to the US dollar, and only those.
 *
 * The distinction matters because a connector prices these at exactly 1 USD.
 * That is right for a dollar-pegged coin and wrong for any other: a euro
 * stablecoin is worth about 1.17 USD, so valuing it at 1 understated it by
 * roughly 15% — silently, in the direction that makes you look poorer.
 */
export const USD_PEGGED_SYMBOLS = [
  "USDC", "USDT", "DAI", "USDE", "USDS", "TUSD", "FDUSD", "PYUSD",
  // Seen on a real Hyperliquid account. Missing them meant real stablecoin
  // holdings were counted as market-exposed, overstating what is at risk.
  "USDT0", "USDH", "USDHL", "FEUSD", "USR", "RUSD", "DEUSD", "USDXL",
];

/** Pegged to something else. Stable in their own currency, not in dollars. */
export const NON_USD_PEGGED_SYMBOLS = ["EURC", "EURS"];

/**
 * Every stablecoin, for classification.
 *
 * Note what "stable" means here: the coin holds its peg. It does **not** mean
 * your capital is safe in your own currency — USDC held by someone who counts
 * in euros carries the whole EUR/USD move, which is real exposure that this
 * label does not capture.
 */
export const STABLECOIN_SYMBOLS = [...USD_PEGGED_SYMBOLS, ...NON_USD_PEGGED_SYMBOLS];

/** True only for coins a connector may value at exactly 1 USD. */
export function isUsdPegged(symbol: string): boolean {
  return USD_PEGGED_SYMBOLS.includes(symbol.trim().toUpperCase());
}

/**
 * Actual money, not a token that tracks it.
 *
 * EUR and USD used to sit in the stablecoin list, which made a euro balance
 * report as "Stablecoin". They behave the same for the stable/floating split —
 * neither moves with the market — but they are not the same thing: a stablecoin
 * is an issuer's promise and can break its peg, and euros in a bank cannot.
 * Labelling them identically hides a real difference in what can go wrong.
 */
export const FIAT_SYMBOLS = ["EUR", "USD", "GBP", "CHF", "BRL", "JPY", "CAD", "AUD"];

export function isFiat(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  return FIAT_SYMBOLS.includes(symbol.trim().toUpperCase());
}

/**
 * Which asset type a raw symbol implies, if any.
 *
 * Used where the app has to name a balance it was never told about — a synced
 * coin list, or the Add position form guessing from the ticker.
 */
export function classifyCoin(symbol: string | null | undefined): "cash" | "stablecoin" | null {
  if (isFiat(symbol)) return "cash";
  if (isStablecoin(symbol)) return "stablecoin";
  return null;
}

/**
 * Can the market move this?
 *
 * The question the accounting actually cares about, and the reason splitting
 * fiat out of the stablecoin list is safe: both answer "no" here, so nothing
 * moved between the guaranteed and market-exposed columns.
 */
export function isCapitalStable(symbol: string | null | undefined): boolean {
  return isFiat(symbol) || isStablecoin(symbol);
}

export function isStablecoin(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  return STABLECOIN_SYMBOLS.includes(symbol.trim().toUpperCase());
}

/**
 * What the annual-rate field means for this asset type, or null when the type
 * has no income model at all.
 *
 * The field used to be labelled "APR %" for everything it appeared on, which
 * was right for a deposit and for staking and wrong for the rest. A dividend is
 * not a coupon, a coupon is not a staking reward, and none of them is an APR:
 * they differ in who promises the money and in whether it can stop. One word
 * for four things invites the reader to compare numbers that aren't comparable.
 *
 * `null` is the signal to **hide** the field, not to show it empty — an annual
 * rate on gold or on a plain crypto position is a number nobody publishes, so
 * asking for it only invites a guess. Absence is the honest answer.
 */
export function annualYieldLabel(assetType: string | null | undefined): string | null {
  switch (assetType) {
    case "stock":
    case "etf":
      return "Dividend yield";
    case "cash":
    case "stablecoin":
      return "Interest rate";
    case "staking":
      return "Staking APR";
    case "bond":
      return "Coupon rate";
    default:
      return null;
  }
}

/**
 * What the money that already arrived is called, for the same asset type.
 *
 * Kept separate from {@link annualYieldLabel} because the two are different
 * claims: a yield is a projection and can be wrong, income is a fact that
 * landed. The codebase keeps those apart everywhere else (see `stakingSummary`,
 * where `projectedAnnual` and `rewardsEarned` are deliberately two fields), and
 * the words on screen should not blur what the model is careful about.
 */
export function annualIncomeLabel(assetType: string | null | undefined): string | null {
  switch (assetType) {
    case "stock":
    case "etf":
      return "Dividends received";
    case "cash":
    case "stablecoin":
    case "bond":
      return "Interest received";
    case "staking":
      return "Rewards received";
    default:
      return null;
  }
}

export const DIRECTIONS = [
  { value: "long", label: "Long (gains when it rises)" },
  { value: "short", label: "Short (gains when it falls)" },
] as const;

/**
 * Asset types whose value is (near) capital-guaranteed. Used to split Net Worth
 * into a guaranteed part and a market-exposed ("floating") part.
 */
export const STABLE_ASSET_TYPES: string[] = ["cash", "stablecoin"];

/**
 * Is this capital-stable, taking the user's word over the ticker?
 *
 * The symbol lists can only ever recognise what someone thought to add. A coin
 * they missed — and there are new ones monthly — was silently counted as
 * market-exposed, which overstates what is at risk. Worse, the Positions page
 * lets you tag a balance as cash or a stablecoin and that tag was read for
 * open trades and ignored for balances, so correcting it did nothing at all.
 *
 * An explicit tag wins. The ticker is the fallback, not the authority — the
 * same rule the rest of this codebase uses for anything a person can know
 * better than an inference can.
 */
export function isStableAsset(
  symbol: string | null | undefined,
  assetType: string | null | undefined
): boolean {
  if (assetType) return STABLE_ASSET_TYPES.includes(assetType);
  return isCapitalStable(symbol);
}

/**
 * The vocabularies, kept apart, because five values mean different things in
 * different ones.
 *
 * `long` is "Long term" as a horizon and "Long (gains when it rises)" as a
 * direction. `low` and `high` are risk levels *and* liquidity levels;
 * `medium` is a risk level *and* a horizon.
 *
 * These used to be flattened into one value→label map. The last vocabulary
 * spread in won every collision, so the risk breakdown labelled its groups
 * "Low liquidity" and "High liquidity", the horizon breakdown labelled its
 * groups "Long (gains when it rises)", and both looked deliberate. Three of the
 * four allocation axes were showing another axis's words.
 *
 * A label needs to know which question it is answering, so it is asked.
 */
const BY_AXIS = {
  risk: RISK_LEVELS,
  expectedReturn: EXPECTED_RETURNS,
  timeHorizon: TIME_HORIZONS,
  liquidity: LIQUIDITY_LEVELS,
  assetType: [...ASSET_TYPES, ...LEGACY_ASSET_TYPES],
  direction: DIRECTIONS,
} as const;

export type TagAxis = keyof typeof BY_AXIS;

/**
 * The flat map, kept only for callers that genuinely cannot know the axis.
 *
 * Deliberately built from the vocabularies with **no collisions**, so a value
 * that means two things resolves to neither rather than to whichever was
 * spread in last. An ambiguous value with no axis falls through to itself,
 * which is honest: "long" is not a wrong answer, "Long (gains when it rises)"
 * on a horizon chart is.
 */
const AMBIGUOUS = new Set<string>();
const UNAMBIGUOUS: Record<string, string> = {};
for (const options of Object.values(BY_AXIS)) {
  for (const option of options) {
    if (option.value in UNAMBIGUOUS && UNAMBIGUOUS[option.value] !== option.label) {
      AMBIGUOUS.add(option.value);
      continue;
    }
    UNAMBIGUOUS[option.value] = option.label;
  }
}
for (const value of AMBIGUOUS) delete UNAMBIGUOUS[value];

/**
 * A value's label on a given axis.
 *
 * Pass the axis wherever it is known — which is nearly everywhere, since a
 * column of risk levels knows it is showing risk. Without one, an ambiguous
 * value is returned unchanged rather than guessed at.
 */
export function tagLabel(value: string | null | undefined, axis?: TagAxis): string | null {
  if (!value) return null;
  if (axis) {
    const found = BY_AXIS[axis].find((o) => o.value === value);
    if (found) return found.label;
  }
  return UNAMBIGUOUS[value] ?? value;
}

/** True for a value that means different things on different axes. */
export function isAmbiguousTag(value: string): boolean {
  return AMBIGUOUS.has(value);
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

/**
 * Colour hint for the time-horizon tag.
 *
 * Deliberately not the risk palette: a short horizon is not a warning and a
 * long one is not "good". These say *when the money is needed*, so they read as
 * three different things rather than as a scale from bad to good — which is
 * also why every horizon must get its own colour, and why there is a test that
 * says so. Two horizons sharing a colour is the same as not colouring them.
 */
export function timeHorizonColor(value: string | null | undefined): string {
  switch (value) {
    case "short":
      return "var(--amber)";
    case "medium":
      return "var(--accent)";
    case "long":
      return "var(--green)";
    default:
      return "var(--muted)";
  }
}
