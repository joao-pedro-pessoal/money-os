/**
 * Pure parser for Hyperliquid's `clearinghouseState` response.
 *
 * Everything the API returns is a STRING (including numbers), so parsing is
 * deliberate and defensive: a missing or malformed field becomes null rather
 * than NaN, which would silently poison every downstream total.
 *
 * Shape reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals
 */

import type {
  NormalizedAccountState,
  NormalizedBalance,
  NormalizedPosition,
} from "../types";
import { USD_PEGGED_SYMBOLS } from "@/lib/portfolio/tags";

/** Parses Hyperliquid's stringified numbers. Returns null when unusable. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same, but for values that must exist — falls back to 0. */
function numOrZero(value: unknown): number {
  return num(value) ?? 0;
}

interface RawPositionWrapper {
  position?: {
    coin?: string;
    szi?: string;
    entryPx?: string | null;
    positionValue?: string;
    unrealizedPnl?: string;
    returnOnEquity?: string;
    liquidationPx?: string | null;
    marginUsed?: string;
    maxLeverage?: number;
    leverage?: { type?: string; value?: number; rawUsd?: string };
    cumFunding?: { allTime?: string; sinceOpen?: string; sinceChange?: string };
  };
  type?: string;
}

interface RawClearinghouseState {
  assetPositions?: RawPositionWrapper[];
  marginSummary?: {
    accountValue?: string;
    totalMarginUsed?: string;
    totalNtlPos?: string;
    totalRawUsd?: string;
  };
  crossMarginSummary?: Record<string, string>;
  withdrawable?: string;
  time?: number;
}

/**
 * `szi` is the signed position size: negative means short. We split it into an
 * explicit side plus a positive magnitude so no downstream code has to
 * remember the sign convention.
 */
export function parsePosition(raw: RawPositionWrapper): NormalizedPosition | null {
  const p = raw?.position;
  if (!p || !p.coin) return null;

  const szi = num(p.szi);
  if (szi === null || szi === 0) return null; // flat -> not an open position

  // Mark price isn't returned directly; positionValue / size recovers it.
  const positionValue = num(p.positionValue);
  const size = Math.abs(szi);
  const markPrice = positionValue !== null && size !== 0 ? positionValue / size : null;

  return {
    coin: p.coin,
    side: szi > 0 ? "long" : "short",
    size,
    entryPrice: num(p.entryPx),
    markPrice,
    positionValue,
    unrealizedPnl: num(p.unrealizedPnl),
    returnOnEquity: num(p.returnOnEquity),
    leverage: p.leverage?.value ?? null,
    leverageType: p.leverage?.type ?? null,
    liquidationPrice: num(p.liquidationPx),
    marginUsed: num(p.marginUsed),
    cumFunding: num(p.cumFunding?.allTime),
    // Every Hyperliquid position is a perpetual; what it's a perpetual ON is
    // read from the coin, because HIP-3 markets can track anything.
    assetClass: "PERP",
  };
}

export function parseClearinghouseState(raw: unknown): NormalizedAccountState {
  const data = (raw ?? {}) as RawClearinghouseState;

  if (!data.marginSummary) {
    throw new Error("Unexpected Hyperliquid response: missing marginSummary");
  }

  const positions = (data.assetPositions ?? [])
    .map(parsePosition)
    .filter((p): p is NormalizedPosition => p !== null);

  return {
    // Hyperliquid quotes everything in USD.
    currency: "USD",
    equity: numOrZero(data.marginSummary.accountValue),
    withdrawable: num(data.withdrawable),
    totalMarginUsed: num(data.marginSummary.totalMarginUsed),
    totalNotionalPosition: num(data.marginSummary.totalNtlPos),
    asOf: typeof data.time === "number" ? new Date(data.time) : null,
    positions,
    // Filled in by the connector, which fetches the spot endpoints separately.
    balances: [],
    spotValue: 0,
    balancesAreSeparatePool: true,
  };
}

/** Hyperliquid identifies accounts by a 42-char hex address. */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

/** Names of the builder-deployed perp markets, from the `perpDexs` response. */
export function parseDexNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is { name?: string } => d !== null && typeof d === "object")
    .map((d) => d.name)
    .filter((name): name is string => typeof name === "string" && name !== "");
}

/**
 * Combines the per-market states into one account.
 *
 * Hyperliquid answers `clearinghouseState` for a SINGLE perp market at a time,
 * the native one by default. Positions on a builder-deployed HIP-3 market are
 * invisible unless that market is named — an account can show open trades on
 * the website while the API reports none.
 *
 * Summing equity across markets is correct because each HIP-3 market holds its
 * own collateral: you transfer into it, and that money leaves the unified
 * account. Hyperliquid's own "Unified Account" figure excludes it for the same
 * reason, which is why the two numbers differ and neither is wrong.
 */
export function mergeMarketStates(
  states: NormalizedAccountState[]
): Pick<
  NormalizedAccountState,
  "equity" | "withdrawable" | "totalMarginUsed" | "totalNotionalPosition" | "positions"
> {
  const sum = (pick: (s: NormalizedAccountState) => number | null): number | null => {
    const values = states.map(pick).filter((v): v is number => v !== null);
    return values.length === 0 ? null : round2(values.reduce((a, b) => a + b, 0));
  };

  return {
    equity: round2(states.reduce((s, x) => s + x.equity, 0)),
    withdrawable: sum((s) => s.withdrawable),
    totalMarginUsed: sum((s) => s.totalMarginUsed),
    totalNotionalPosition: sum((s) => s.totalNotionalPosition),
    // Coins on a HIP-3 market already arrive namespaced ("xyz:GOLD"), so
    // markets cannot collide with each other or with the native ones.
    positions: states.flatMap((s) => s.positions),
  };
}

// ---------------- Spot balances ----------------

interface RawSpotBalance {
  coin?: string;
  token?: number;
  hold?: string;
  total?: string;
  entryNtl?: string;
}

interface RawSpotState {
  balances?: RawSpotBalance[];
}

/**
 * Stablecoins are valued 1:1 rather than looked up in a market.
 * Shared with the portfolio tags so a coin is classified the same way whether
 * it arrives from a sync or is typed in by hand.
 */
/**
 * Only dollar-pegged coins may be valued at exactly 1 USD.
 *
 * EURC is a stablecoin but it is not a dollar: pricing it at 1 understated a
 * euro balance by the whole EUR/USD spread. Non-dollar pegs fall through to
 * the price map below, which quotes them against USDC and therefore in USD.
 */
const DOLLAR_COINS = new Set(USD_PEGGED_SYMBOLS);

/**
 * Builds a coin -> USD price map from `spotMetaAndAssetCtxs`.
 *
 * The response is [meta, contexts]. A universe entry names its two token
 * indices, so a pair quoted in a dollar stablecoin gives the base token's USD
 * price directly.
 *
 * **The contexts are not positionally aligned with the universe, and reading
 * them that way is what made HYPE wrong twice.** The two arrays are not even
 * the same length — 326 universe entries against 717 contexts on a live
 * response. Each context carries the pair it belongs to in `coin`, and each
 * universe entry carries the same identifier in `name` ("@107", or "PURR/USDC"
 * for the one canonical pair). That shared identifier is the only honest join.
 *
 * What positional reading did: universe position 105 is the pair @107, whose
 * real mark price is 76.51. `ctxs[105]` is the context for @105 — a different
 * token entirely, trading at 0.092721. So a HYPE balance was valued at roughly
 * one eight-hundredth of its worth, with every other spot token misread by the
 * same drifting offset. The earlier "HYPE reads 0,00" bug was the same defect
 * landing on a pair that happened to be dormant; rejecting zeros treated the
 * symptom, and the symptom moved.
 *
 * Do not add a positional fallback for contexts that carry no `coin`. Being
 * unable to find the price leaves the token unpriced, which the app displays
 * as unpriced; guessing by position is how it displayed a wrong number instead.
 */
export function buildSpotPriceMap(raw: unknown): Record<string, number> {
  const prices: Record<string, number> = {};
  if (!Array.isArray(raw) || raw.length < 2) return prices;

  const meta = raw[0] as {
    tokens?: { name?: string; index?: number }[];
    universe?: { tokens?: number[]; index?: number; name?: string }[];
  };
  const ctxs = raw[1] as { markPx?: string; midPx?: string; coin?: string }[];

  if (!meta?.tokens || !meta?.universe || !Array.isArray(ctxs)) return prices;

  const nameByIndex = new Map<number, string>();
  for (const t of meta.tokens) {
    if (typeof t?.index === "number" && t?.name) nameByIndex.set(t.index, t.name);
  }

  const contextByPair = new Map<string, { markPx?: string; midPx?: string }>();
  for (const ctx of ctxs) {
    if (ctx?.coin) contextByPair.set(ctx.coin, ctx);
  }

  for (const pair of meta.universe) {
    if (!pair?.tokens || pair.tokens.length < 2 || !pair.name) continue;

    const ctx = contextByPair.get(pair.name);
    if (!ctx) continue;

    const base = nameByIndex.get(pair.tokens[0]);
    const quote = nameByIndex.get(pair.tokens[1]);
    if (!base || !quote || !DOLLAR_COINS.has(quote)) continue;

    const px = num(ctx.markPx) ?? num(ctx.midPx);

    /**
     * A mark price of zero is a pair that has never traded, not a token that is
     * worthless. Several pairs can legitimately name the same base token —
     * HYPE quotes against USDC, USDT0, USDH and USDE — so the first live price
     * wins and a dormant pair can never overwrite it.
     */
    if (px === null || px <= 0) continue;
    if (prices[base] !== undefined) continue;

    prices[base] = px;
  }

  return prices;
}

/**
 * Every coin's mid price, from the one endpoint that lists them all.
 *
 * `spotMetaAndAssetCtxs` only prices tokens that have a spot pair quoted in a
 * dollar stablecoin. A token traded mainly as a perp — HYPE being the obvious
 * one on this venue — has a mark price all day and no entry in that map, so it
 * arrived unpriced and was displayed as worth nothing.
 *
 * Keys are perp coin names ("HYPE", "BTC") plus spot pairs as "@index", which
 * are skipped: an index is meaningless without the universe to resolve it, and
 * the spot map already covers everything it would name.
 */
export function parseAllMids(raw: unknown): Record<string, number> {
  const mids: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return mids;

  for (const [coin, value] of Object.entries(raw as Record<string, unknown>)) {
    if (coin.startsWith("@")) continue;
    const px = num(value);
    // A mid of zero is not a price. Nothing trades at nothing, so a zero here
    // is missing data wearing a number's clothes.
    if (px !== null && px > 0) mids[coin] = px;
  }

  return mids;
}

/**
 * Values spot balances in USD. A token with no known price keeps a null value
 * rather than being counted as zero — silently dropping it would understate
 * the total, which is worse than showing it as unpriced.
 */
export function parseSpotBalances(
  raw: unknown,
  prices: Record<string, number> = {},
  mids: Record<string, number> = {}
): { balances: NormalizedBalance[]; spotValue: number; heldValue: number } {
  const data = (raw ?? {}) as RawSpotState;
  const balances: NormalizedBalance[] = [];

  for (const b of data.balances ?? []) {
    if (!b?.coin) continue;
    const total = num(b.total) ?? 0;
    if (total === 0) continue;

    /**
     * Spot pair first, then the venue-wide mid, then nothing.
     *
     * A non-positive price is treated as no price at all. A balance you hold
     * and a price of zero cannot both be true, and displaying "0.00" says the
     * holding is worthless — a measurement — when what happened is that nobody
     * measured. That distinction has been the shape of nearly every wrong
     * number in this codebase.
     */
    const quoted = DOLLAR_COINS.has(b.coin) ? 1 : (prices[b.coin] ?? mids[b.coin] ?? null);
    const price = quoted !== null && quoted > 0 ? quoted : null;

    /**
     * `entryNtl` is what the venue says this holding cost, and it was being
     * thrown away — so a HYPE balance up about 3 € reported "+0,00 €", which
     * claims a holding is exactly flat.
     *
     * Zero is not a cost. Hyperliquid writes "0.0" for anything it has no entry
     * for, USDC included, and treating that as a real cost basis would report
     * the entire balance as profit.
     */
    const entry = num(b.entryNtl);
    const costBasis = entry !== null && entry > 0 ? round2(entry) : null;

    balances.push({
      coin: b.coin,
      total,
      hold: num(b.hold) ?? 0,
      price,
      usdValue: price === null ? null : round2(total * price),
      costBasis,
    });
  }

  const spotValue = round2(balances.reduce((s, b) => s + (b.usdValue ?? 0), 0));

  /**
   * What the venue is holding back as collateral, valued.
   *
   * Under a unified account the money behind an open trade never leaves the
   * spot balance — it is marked `hold` inside it. That makes this an
   * independent second measurement of margin in use, from a different endpoint
   * than the perps summary, which is the only way to catch either one drifting.
   */
  const heldValue = round2(
    balances.reduce((s, b) => (b.price === null ? s : s + b.hold * b.price), 0)
  );

  return { balances, spotValue, heldValue };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * All-time realised P&L on closed trades, from the venue's own fill records.
 *
 * `clearinghouseState` describes open positions and says nothing about closed
 * ones, so a trade you closed left no trace anywhere in the app — the Realized
 * P&L card read "0.00 sales" against forty closed fills. `userFills` is where
 * the venue keeps that: one row per fill, with `closedPnl` set on the ones that
 * closed something.
 *
 * **This is the venue's figure, not ours.** The codebase's rule is that
 * realised trade P&L is taken from whatever the platform reports and never
 * reconstructed under a cost-basis method of our own, because a number we
 * derived would quietly disagree with the broker's. Summing a field the venue
 * itself calls closed P&L stays on the right side of that line.
 *
 * **Fees are not subtracted.** Hyperliquid reports them in a separate `fee`
 * field, and whether `closedPnl` is already net of them is not something this
 * code can verify from the payload. Guessing either way would misstate the
 * number, so it reports the field as given and `fees` alongside it — two
 * measurements, neither pretending to be the other.
 *
 * The endpoint returns a bounded window of recent fills, so an account older
 * than that window would be summing part of its history. `fillCount` is
 * returned so a caller can tell a real zero from an empty read.
 */
export function parseRealizedPnl(
  raw: unknown
): { realized: number | null; fees: number; fillCount: number } {
  if (!Array.isArray(raw)) return { realized: null, fees: 0, fillCount: 0 };

  let realized = 0;
  let fees = 0;
  let closedFills = 0;

  for (const fill of raw as { closedPnl?: unknown; fee?: unknown }[]) {
    const pnl = num(fill?.closedPnl);
    if (pnl !== null && pnl !== 0) {
      realized += pnl;
      closedFills += 1;
    }
    const fee = num(fill?.fee);
    if (fee !== null) fees += fee;
  }

  // No fills read at all is "the venue didn't say", which must stay null —
  // reporting it as 0.00 would claim you have closed nothing, and the card
  // already distinguishes an unknown from a zero.
  if (raw.length === 0) return { realized: null, fees: 0, fillCount: 0 };

  return { realized: round2(realized), fees: round2(fees), fillCount: closedFills };
}

/**
 * Is this a unified account?
 *
 * Hyperliquid's docs are explicit: *"Under unified account or portfolio margin,
 * use spot balances endpoint instead for trading account balance across spot
 * and perps."* Under that model the spot balance already collateralises the
 * perps, so adding the perps account value on top counts the collateral twice.
 *
 * There is no flag in the payload, so this reads a contradiction instead:
 * `withdrawable` is what the venue says you could take out, and it cannot
 * exceed the perps pot unless it is describing something larger than the perps
 * pot. On a separated account withdrawable is at most accountValue; on a
 * unified one it spans the whole balance.
 *
 * Real numbers from the account that exposed this: withdrawable ≈ 69.46 against
 * a perps accountValue of 18.03. Impossible if they were separate pools.
 */
export function looksUnified(state: {
  equity: number;
  withdrawable: number | null;
  spotValue: number;
}): boolean {
  if (state.withdrawable === null) return false;
  if (state.spotValue <= 0) return false;
  // A cent of slack: equality is the normal case on an account with no
  // positions, and that is not evidence of anything.
  return state.withdrawable > state.equity + 0.01;
}

/**
 * The venue's own word on whether this account is unified.
 *
 * `userAbstraction` answers with one of "unifiedAccount", "portfolioMargin",
 * "disabled", "default" or "dexAbstraction". This replaces the inference that
 * used to live here — a fact from the platform beats a clever reading of two
 * numbers, and the clever reading would have been wrong for anyone whose
 * withdrawable happened to exceed their perps equity for another reason.
 */
export function parseAbstraction(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/** True when spot and perps share one pot, so they must never be added. */
export function isUnifiedAbstraction(mode: string | null): boolean {
  return mode === "unifiedAccount" || mode === "portfolioMargin";
}

/**
 * The account's value, as Hyperliquid's own portfolio endpoint reports it.
 *
 * This is the "Portfolio Value" shown in their interface. Composing it here
 * from spot plus perps was what produced 109.91 against the venue's 92.49, so
 * the figure is now read rather than assembled.
 *
 * The response is a list of [window, data] pairs; the most recent point of the
 * `day` window is the current value. Returns null rather than zero when the
 * shape isn't what we expect — a zero would wipe the account.
 */
export function parsePortfolioValue(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;

  // "day" is the shortest window and therefore the freshest.
  const preferred = ["day", "week", "month", "allTime"];
  for (const window of preferred) {
    const entry = raw.find(
      (pair): pair is [string, { accountValueHistory?: [number, string][] }] =>
        Array.isArray(pair) && pair[0] === window
    );
    const history = entry?.[1]?.accountValueHistory;
    if (!Array.isArray(history) || history.length === 0) continue;

    const last = history[history.length - 1];
    const value = Number(last?.[1]);
    if (Number.isFinite(value)) return round2(value);
  }
  return null;
}
