/**
 * Working out what a synced position actually is.
 *
 * The platforms already know — IBKR labels every position with an `assetClass`,
 * and Hyperliquid knows whether a market is a perpetual. We were throwing that
 * away and then asking you to pick from a dropdown for each one.
 *
 * The rule this file follows: **suggest only when certain, and never overwrite
 * a choice you made.** A wrong asset type is worse than a blank one, because it
 * silently changes the risk analysis and the stable/floating split — an ETF
 * filed as a stablecoin would move real money into the "guaranteed" column.
 */

import type { AssetTypeValue } from "./tags";
import { classifyByName, contradictsStock } from "./nameEvidence";

export interface Detection {
  /** Our own asset type, or null when the platform's label doesn't settle it. */
  value: AssetTypeValue | null;
  /** Why, in words, for the tooltip. */
  reason: string;
}

/**
 * IBKR's asset classes.
 *
 * Deliberately incomplete: `STK` covers both ordinary shares AND ETFs at IBKR,
 * with no reliable field separating them. Guessing from the name ("does it
 * contain ISHARES?") would be right often and wrong silently, so STK maps to
 * `stock` and the ETFs among them are yours to correct — a visible, one-click
 * correction beats an invisible mistake.
 */
const IBKR_CLASSES: Record<string, { value: AssetTypeValue | null; reason: string }> = {
  STK: { value: "stock", reason: "IBKR reports this as a stock. ETFs also arrive as STK — change it if this is one." },
  FUND: { value: "etf", reason: "IBKR reports this as a fund." },
  BOND: { value: "bond", reason: "IBKR reports this as a bond." },
  CASH: { value: "cash", reason: "IBKR reports this as a currency position." },
  CRYPTO: { value: "crypto", reason: "IBKR reports this as crypto." },
  // Derivatives: certainly not any of the specific types, so "other" is the
  // honest answer rather than a shrug.
  OPT: { value: "other", reason: "An option — none of the simple types fit." },
  FUT: { value: "other", reason: "A future — none of the simple types fit." },
  FOP: { value: "other", reason: "An option on a future — none of the simple types fit." },
  CFD: { value: "other", reason: "A CFD — none of the simple types fit." },
  WAR: { value: "other", reason: "A warrant — none of the simple types fit." },
  IND: { value: "other", reason: "An index — none of the simple types fit." },
};

/**
 * What a market's name says it tracks.
 *
 * A perpetual is a wrapper, not an asset class — what matters for risk is what
 * sits underneath. `xyz:GOLD` is exposure to gold, and filing it as crypto (or
 * as nothing) tells the analysis the wrong thing about what would move it.
 *
 * A name table rather than cleverness: it is only ever right about names it
 * knows, and silent about the rest.
 */
const UNDERLYINGS: Record<string, { value: AssetTypeValue; what: string }> = {
  GOLD: { value: "commodity", what: "gold" },
  XAU: { value: "commodity", what: "gold" },
  SILVER: { value: "commodity", what: "silver" },
  XAG: { value: "commodity", what: "silver" },
  PLATINUM: { value: "commodity", what: "platinum" },
  COPPER: { value: "commodity", what: "copper" },
  OIL: { value: "commodity", what: "oil" },
  WTI: { value: "commodity", what: "oil" },
  BRENT: { value: "commodity", what: "oil" },
  NATGAS: { value: "commodity", what: "natural gas" },
  SPX: { value: "index", what: "the S&P 500" },
  SP500: { value: "index", what: "the S&P 500" },
  NDX: { value: "index", what: "the Nasdaq 100" },
  NASDAQ: { value: "index", what: "the Nasdaq" },
  DAX: { value: "index", what: "the DAX" },
  DJI: { value: "index", what: "the Dow" },
  NIKKEI: { value: "index", what: "the Nikkei" },
  EURUSD: { value: "cash", what: "a currency pair" },
  GBPUSD: { value: "cash", what: "a currency pair" },
  USDJPY: { value: "cash", what: "a currency pair" },
};

/** Strips the dex prefix: `xyz:GOLD` → `GOLD`. */
export function underlyingOf(coin: string): string {
  const parts = coin.split(":");
  return (parts[parts.length - 1] ?? coin).trim().toUpperCase();
}

/**
 * Hyperliquid: a perp's underlying is not always crypto.
 *
 * The main exchange lists crypto perps, so those are safe to call crypto.
 * HIP-3 markets carry a dex prefix and can track anything, so the name is read
 * against a table of known underlyings. A name that isn't in it stays blank
 * rather than being guessed at — which is the same rule as before, just with
 * fewer things now falling into "unknown".
 */
export function detectHyperliquid(coin: string): Detection {
  const symbol = underlyingOf(coin);
  const known = UNDERLYINGS[symbol];

  if (known) {
    return { value: known.value, reason: `This market tracks ${known.what}.` };
  }

  if (coin.includes(":")) {
    return {
      value: null,
      reason: `${coin} is on a HIP-3 market and the name isn't one we recognise, so the underlying could be anything. Pick the type yourself.`,
    };
  }

  return { value: "crypto", reason: "A perpetual on Hyperliquid's own market, so the underlying is crypto." };
}

/**
 * Trading 212's instrument types.
 *
 * Unlike IBKR, Trading 212 separates ETF from STOCK in its own metadata, so
 * this is the platform stating a fact rather than us inferring one — an
 * `_EQ` ticker is no help at all, since iShares trackers and ordinary shares
 * both carry it.
 *
 * FOREX maps to cash: a currency holding is money, not an instrument, and
 * filing it anywhere else would move it into the floating side of Net Worth.
 */
const T212_TYPES: Record<string, { value: AssetTypeValue | null; reason: string }> = {
  STOCK: { value: "stock", reason: "Trading 212 lists this as a stock." },
  ETF: { value: "etf", reason: "Trading 212 lists this as an ETF." },
  CRYPTOCURRENCY: { value: "crypto", reason: "Trading 212 lists this as a cryptocurrency." },
  CRYPTO: { value: "crypto", reason: "Trading 212 lists this as crypto." },
  FOREX: { value: "cash", reason: "A currency position — money rather than an instrument." },
  FUTURES: { value: "other", reason: "A future — none of the simple types fit." },
  WARRANT: { value: "other", reason: "A warrant — none of the simple types fit." },
  INDEX: { value: "other", reason: "An index — none of the simple types fit." },
  CVR: { value: "other", reason: "A contingent value right — none of the simple types fit." },
  CORPACT: { value: "other", reason: "A corporate action line — none of the simple types fit." },
};

export function detectTrading212(assetClass: string | null): Detection {
  if (!assetClass) {
    return {
      value: null,
      reason:
        "Trading 212's instrument list hasn't been read yet, so the type isn't known. It arrives on the next sync.",
    };
  }
  const hit = T212_TYPES[assetClass.trim().toUpperCase()];
  if (!hit) {
    return { value: null, reason: `Trading 212 calls this "${assetClass}", which we don't recognise.` };
  }
  return hit;
}

export function detectIbkr(assetClass: string | null): Detection {
  if (!assetClass) {
    return { value: null, reason: "IBKR didn't say what this is." };
  }
  const hit = IBKR_CLASSES[assetClass.trim().toUpperCase()];
  if (!hit) {
    return { value: null, reason: `IBKR calls this "${assetClass}", which we don't recognise.` };
  }
  return hit;
}

/** What a position is, according to the platform that holds it. */
export function suggestAssetType(input: {
  platform: string;
  assetClass: string | null;
  coin: string;
  /** The instrument's full name, where the platform gives one. */
  instrumentName?: string | null;
}): Detection {
  const fromPlatform = ((): Detection => {
    switch (input.platform) {
      case "ibkr":
        return detectIbkr(input.assetClass);
      case "hyperliquid":
        return detectHyperliquid(input.coin);
      case "trading212":
        return detectTrading212(input.assetClass);
      case "bybit":
        // Bybit lists crypto derivatives and nothing else.
        return { value: "crypto", reason: "Bybit lists crypto only." };
      default:
        return { value: null, reason: "Unknown platform." };
    }
  })();

  // The ambiguous case: a platform says "stock", which is also what it says
  // about every ETF it holds. IBKR does exactly this.
  if (fromPlatform.value === "stock") {
    const better = contradictsStock(input.instrumentName);
    if (better) {
      return {
        value: better.value,
        reason: `${better.reason} The platform files this with ordinary shares, which is how ETFs arrive there.`,
      };
    }
    return fromPlatform;
  }

  if (fromPlatform.value !== null) return fromPlatform;

  // The platform left it open; see whether the name settles it.
  const fromName = classifyByName(input.instrumentName);
  if (fromName) return { value: fromName.value, reason: fromName.reason };

  return fromPlatform;
}

/**
 * Decides what to store on a sync.
 *
 * Returns null — meaning "change nothing" — whenever a choice already exists
 * that wasn't put there automatically. Re-syncing must never undo your tagging,
 * which is the same promise the risk tags already make.
 */
export function assetTypeOnSync(input: {
  existing: string | null;
  existingWasAuto: boolean;
  suggestion: Detection;
}): { value: string; auto: boolean } | null {
  // A choice you made wins, always.
  if (input.existing && !input.existingWasAuto) return null;

  if (input.suggestion.value === null) return null;

  // Nothing to do if the automatic answer hasn't changed.
  if (input.existing === input.suggestion.value) return null;

  return { value: input.suggestion.value, auto: true };
}
