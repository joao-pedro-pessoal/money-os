/**
 * When a successful sync of zero needs explaining.
 *
 * Several of these connectors can only see part of the venue. Binance,
 * MEXC and OKX each keep money in wallets that their read endpoint does not
 * cover, and reading the others means a different endpoint, sometimes a
 * different host and a different signing scheme.
 *
 * That limit is stated before you connect. The gap this file closes is what
 * happens *after*: MEXC synced, reported `ok`, found 0.0000000024 USDT in the
 * Spot wallet and wrote a balance of 0.00. The screen then showed a green
 * connection beside `0,00 US$`, which reads as "MEXC holds nothing" when what
 * it measured was "the one wallet I can see holds nothing". The money was in
 * another wallet the whole time.
 *
 * A zero *is* a measurement here — the wallet really is empty — which is why
 * the figure is not suppressed. What was missing is which question it answers.
 *
 * Only for a sync that worked. A failure already says so in red, and adding a
 * second explanation to it would bury the first.
 *
 * Pure — no DB, no React.
 */

/** The part of a venue a connector can see, when it is not all of it. */
export interface ReadScope {
  /** What the connector reads, named as the venue names it. */
  wallet: string;
  /** Where else the money could be, in the venue's own words. */
  elsewhere: string;
}

export interface ScopeCheck {
  /** `last_sync_status`. Only "ok" is considered. */
  status: string | null | undefined;
  /** The venue's account value, as stored. Null when never measured. */
  equity: number | null | undefined;
  /** Coin balances, as stored. */
  spotValue: number | null | undefined;
  /** Declared by PLATFORM_SETUP; absent for a connector that sees everything. */
  readsOnly?: ReadScope | null;
}

/**
 * Under a cent is treated as nothing.
 *
 * The reading that prompted this was 2.4 nano-USDT — a real number, and not a
 * balance anybody has. An exact `=== 0` test would have missed it and left the
 * screen saying 0,00 with no explanation, which is the whole failure.
 */
const DUST = 0.01;

/**
 * The note to show, or null.
 *
 * Null when the sync failed, when the connector sees the whole venue, or when
 * it found something — in which case the figure speaks for itself.
 */
export function emptyReadScope(check: ScopeCheck): ReadScope | null {
  if (check.status !== "ok") return null;
  if (!check.readsOnly) return null;

  const total = (check.equity ?? 0) + (check.spotValue ?? 0);
  return Math.abs(total) < DUST ? check.readsOnly : null;
}
