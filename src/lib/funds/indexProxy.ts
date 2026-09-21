/**
 * The companies behind a fund that holds none of them.
 *
 * A synthetic ETF does not buy its index. It holds a basket of whatever its
 * swap counterparty accepts as collateral and receives the index's return
 * through the swap. The Amundi S&P 500 held here is one — unfunded swap — and
 * what Amundi publishes as its holdings is that basket: real shares, a real
 * file, and not the companies whose rise and fall the fund follows. Reading it
 * as the fund's companies would tell you that you own a slice of whatever
 * Japanese and European stocks sat in the collateral that week.
 *
 * What the fund is exposed to is the index, and the index's companies are
 * published every day by a fund that does buy them. So a synthetic fund's
 * companies are read **from a physical fund tracking the same index**, and the
 * screen says that is what it did.
 *
 * **Hand-checked, never inferred.** Which index a fund follows, and that it
 * follows it by swap, are facts about the fund, looked up once in its own
 * documents — the same arrangement as `quotes/knownListings.ts`, and for the
 * same reason. A name containing "S&P 500" is not evidence: equal-weight,
 * ESG-screened, leveraged and covered-call funds all have one. A fund missing
 * from here keeps whatever it had before.
 *
 * The proxy must replicate fully. A sampling fund holds a subset of its index
 * chosen to track it statistically, which is not the index's list of companies.
 *
 * Pure.
 */

export interface IndexProxy {
  /** The index the synthetic fund's swap pays. */
  index: string;
  /** A fund that holds that index's companies outright, whose file is read instead. */
  proxyIsin: string;
  proxyName: string;
}

const SYNTHETIC: Record<string, IndexProxy> = {
  // Amundi S&P 500 Swap UCITS ETF EUR Acc: synthetic, unfunded swap — so
  // justETF lists it, and so Amundi's own product page names it. Read through
  // iShares Core S&P 500, which replicates the index in full: its file of
  // 2026-09-17 holds 504 shares making 99.81% of the fund, the rest cash.
  LU1681048804: {
    index: "S&P 500",
    proxyIsin: "IE00B5BMR087",
    proxyName: "iShares Core S&P 500 UCITS ETF",
  },
};

/** The fund whose file stands in for this one's, or null for a fund that holds its own shares. */
export function indexProxyFor(isin: string | null | undefined): IndexProxy | null {
  return SYNTHETIC[(isin ?? "").trim().toUpperCase()] ?? null;
}

/**
 * The `source` a stand-in file is saved under.
 *
 * It carries the proxy's ISIN, so the saved row says where its companies really
 * came from and a reader never has to consult this table to find out.
 */
export function indexSource(proxy: IndexProxy): string {
  return `index:${proxy.proxyIsin}`;
}

export function isIndexSource(source: string | null | undefined): boolean {
  return (source ?? "").startsWith("index:");
}
