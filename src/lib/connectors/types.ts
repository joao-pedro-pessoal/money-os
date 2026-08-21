/**
 * The connector contract. Every platform (Hyperliquid, Bybit, IBKR, …)
 * implements this and feeds the SAME normalized shapes below — nothing outside
 * src/lib/connectors ever sees a platform's raw payload.
 *
 * READ-ONLY BY ARCHITECTURE (PRODUCT_VISION §4): this interface has no method
 * that could place, modify or cancel an order, or move funds. That capability
 * doesn't exist in the type system, so it can't be reached by mistake.
 */

/** A position, normalized across platforms. */
export interface NormalizedPosition {
  coin: string;
  side: "long" | "short";
  /** Always positive; direction lives in `side`. */
  size: number;
  entryPrice: number | null;
  markPrice: number | null;
  positionValue: number | null;
  unrealizedPnl: number | null;
  returnOnEquity: number | null;
  leverage: number | null;
  leverageType: string | null;
  liquidationPrice: number | null;
  marginUsed: number | null;
  cumFunding: number | null;
  /**
   * What the platform calls this instrument, verbatim — IBKR's "STK", "BOND",
   * "CASH" and so on. Kept raw rather than translated here so the mapping to
   * our own asset types lives in one testable place, and so an unrecognised
   * value can be reported instead of silently becoming "other".
   */
  assetClass: string | null;
  /**
   * The instrument's full name, when the platform gives one.
   *
   * Carried for classification rather than display: a ticker says nothing
   * ("IGLAI_EQ"), but "iShares Core Global Aggregate Bond UCITS ETF" settles
   * what the thing is on its own. Never stored — read at sync time.
   */
  instrumentName?: string | null;
}

/** A token balance held outside the derivatives margin account (spot). */
export interface NormalizedBalance {
  coin: string;
  /** Total units held. */
  total: number;
  /** Units locked in resting orders. */
  hold: number;
  /** Price in USD used to value this balance (1 for stablecoins). */
  price: number | null;
  /** total x price, when a price is known. */
  usdValue: number | null;
}

/**
 * Account-level state, normalized.
 *
 * `equity` already includes the unrealized P&L of every open position, so it
 * is the single number that represents the account — positions must never be
 * added on top of it (PRODUCT_VISION §9).
 */
export interface NormalizedAccountState {
  /**
   * The currency every figure in this reply is denominated in.
   *
   * The app used to assume USD for every connector, because the first two
   * reported in USD. Trading 212 reports in the account's own currency, so a
   * €144.84 balance was read as $144.84 and converted down to about €125 — a
   * 15% error that looked like a bug in the totals rather than in the units.
   */
  currency: string;
  equity: number;
  withdrawable: number | null;
  totalMarginUsed: number | null;
  totalNotionalPosition: number | null;
  /**
   * All-time realised profit and loss, where the platform states one.
   *
   * Never computed here. Deriving it from an order history requires choosing a
   * cost-basis method, and the number we produced would silently disagree with
   * the one the broker shows you. Null means "this platform doesn't say", which
   * the interface reports as unknown rather than as zero.
   */
  realizedPnl?: number | null;
  /** Platform timestamp of the reading, if provided. */
  asOf: Date | null;
  positions: NormalizedPosition[];
  /** Coin balances held on the platform. */
  balances: NormalizedBalance[];
  /** Sum of `usdValue` across balances. */
  spotValue: number;
  /**
   * Whether `balances` are money that sits OUTSIDE `equity`.
   *
   * This has to be stated by each connector rather than guessed, because the
   * platforms genuinely differ: Hyperliquid keeps spot in a separate pool from
   * the perps margin account (true — add them on top), while a Bybit unified
   * account reports one pot where the coin list is a breakdown of `equity`
   * itself (false — showing them is fine, adding them counts the same money
   * twice).
   */
  balancesAreSeparatePool: boolean;
}

/** Minimal HTTP surface, injected so connectors are testable without network. */
export type HttpPost = (url: string, body: unknown) => Promise<unknown>;

/** Signed GET, for platforms that authenticate with headers rather than a body. */
export type HttpGetSigned = (url: string, headers: Record<string, string>) => Promise<unknown>;

/** One distribution received, normalized across platforms. */
export interface NormalizedDividend {
  ticker: string;
  instrumentName: string | null;
  isin: string | null;
  paidOn: Date;
  /** In the account's currency. */
  amount: number;
  currency: string;
  quantity: number | null;
  grossPerShare: number | null;
  /** The platform's own word for what kind of payment this was. */
  type: string | null;
  /** The platform's id for this payment, so a re-sync can't duplicate it. */
  reference: string | null;
}

export interface Connector {
  readonly platform: string;
  /** Cheap validity check on the identifier before saving a connection. */
  validateIdentifier(identifier: string): { ok: true } | { ok: false; reason: string };
  /**
   * Fetch and normalize the current account state. Read-only.
   * `identifier` is the public account id where one exists (a wallet
   * address); platforms authenticated by key ignore it, having received
   * their credentials when the connector was created.
   */
  getAccountState(identifier: string): Promise<NormalizedAccountState>;
  /**
   * Distributions already received. Optional: most platforms here don't pay
   * any, and a connector that can't answer must not be forced to pretend.
   * Returns history only — no platform publishes a forward calendar.
   */
  getDividends?(): Promise<NormalizedDividend[]>;
}

/** Default HTTP implementation. Kept separate so tests can swap it out. */
export const defaultHttpPost: HttpPost = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status} ${res.statusText}`);
  }
  return res.json();
};
