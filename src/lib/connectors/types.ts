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
  equity: number;
  withdrawable: number | null;
  totalMarginUsed: number | null;
  totalNotionalPosition: number | null;
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
