/**
 * Pricing an instrument through the IBKR gateway you already run.
 *
 * The idea this implements: you hold an ETF at Trade Republic, which has no
 * API — but you also have an Interactive Brokers gateway on this machine, and
 * IBKR knows what that ETF is worth. The ISIN is the bridge. No new vendor, no
 * key, no subscription to buy.
 *
 * One thing makes this harder than it sounds, and it is the whole reason this
 * file is careful: **an ISIN is not one listing.** The same fund trades in
 * Amsterdam in euros, in London in pounds and in Zurich in francs, each with
 * its own price and its own contract id. Picking one automatically means
 * picking a currency automatically, and a euro position priced off the London
 * listing is wrong by the exchange rate while looking entirely sensible.
 *
 * So this parses candidates and never chooses. Choosing is a decision with a
 * person's money attached, made once, and remembered.
 *
 * Pure — no DB, no I/O.
 */

export interface InstrumentCandidate {
  /** IBKR's contract id — what a price request needs. */
  conid: string;
  symbol: string | null;
  name: string | null;
  /** Where it trades. Different venues, different currencies, different prices. */
  exchange: string | null;
  currency: string | null;
  /** "STK", "ETF" and so on, when the gateway says. */
  secType: string | null;
}

const dig = (row: unknown, path: string): unknown => {
  let cursor: unknown = row;
  for (const part of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const str = (row: unknown, paths: string[]): string | null => {
  for (const path of paths) {
    const value = dig(row, path);
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
};

/**
 * Candidates from a security search.
 *
 * Defensive about the shape because the gateway's responses vary between
 * versions, and an unrecognised field should cost a label rather than the whole
 * result. A row with no contract id is dropped: without one it cannot be
 * priced, so offering it would be offering a dead end.
 */
export function parseSearchResults(payload: unknown): InstrumentCandidate[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(dig(payload, "results"))
      ? (dig(payload, "results") as unknown[])
      : [];

  return rows
    .map((row) => ({
      conid: str(row, ["conid", "conidex"]) ?? "",
      symbol: str(row, ["symbol", "ticker"]),
      name: str(row, ["companyName", "companyHeader", "description", "name"]),
      exchange: str(row, ["exchange", "listingExchange", "primaryExchange"]),
      currency: str(row, ["currency"]),
      secType: str(row, ["secType", "assetClass"]),
    }))
    .filter((c) => c.conid !== "");
}

export interface Quote {
  conid: string;
  /** Null when the gateway returned no price — usually a data entitlement. */
  price: number | null;
  currency: string | null;
  /**
   * True when the figure is a previous close rather than a live trade.
   *
   * IBKR marks these by prefixing the value with a letter — "C" for close, "H"
   * for halted. Stripping the letter and keeping the number silently turns
   * yesterday's close into today's price, so the letter is kept as a fact.
   */
  isClose: boolean;
  /** What the gateway said about availability, verbatim, when it said anything. */
  availability: string | null;
}

/**
 * IBKR sends prices as strings, sometimes with a letter in front.
 *
 * `"C123.45"` is a previous close, `"H123.45"` is halted, `"123.45"` is a live
 * trade. Returning 123.45 for all three would be three different claims wearing
 * the same number.
 */
export function parsePriceField(raw: unknown): { value: number | null; isClose: boolean } {
  if (typeof raw === "number") {
    return { value: Number.isFinite(raw) ? raw : null, isClose: false };
  }
  if (typeof raw !== "string") return { value: null, isClose: false };

  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, isClose: false };

  const isClose = /^[CH]/i.test(trimmed);
  const numeric = Number(trimmed.replace(/^[A-Za-z]+/, "").replace(/,/g, ""));

  return { value: Number.isFinite(numeric) ? numeric : null, isClose };
}

/** Field 31 is the last price; 6509 describes what kind of data you're entitled to. */
export function parseSnapshot(payload: unknown): Quote[] {
  const rows = Array.isArray(payload) ? payload : [];

  return rows
    .map((row) => {
      const conid = str(row, ["conid", "conidEx"]) ?? "";
      const price = parsePriceField(dig(row, "31"));

      return {
        conid,
        price: price.value,
        currency: str(row, ["currency", "6119"]),
        isClose: price.isClose,
        availability: str(row, ["6509"]),
      };
    })
    .filter((q) => q.conid !== "");
}

/**
 * What the availability code means, in words.
 *
 * IBKR encodes it as letters: R is realtime, D delayed, Z delayed-frozen, and
 * so on. Worth translating because "no price" and "no subscription" look
 * identical from the outside and lead to completely different next steps.
 */
export function describeAvailability(code: string | null): string | null {
  if (!code) return null;

  if (code.includes("R")) return "Live prices.";
  if (code.includes("D")) return "Delayed prices — fine for a portfolio, minutes behind a trader.";
  if (code.includes("Z")) return "Delayed and frozen: the last price before the feed stopped.";
  if (code.includes("Y")) return "Frozen: the last price before the market closed.";
  if (code.includes("N")) return "No market data subscription for this instrument.";
  return null;
}

/**
 * Is one candidate obviously the right listing for a position?
 *
 * Deliberately conservative: it only says yes when exactly one candidate
 * matches the currency you paid in. Anything less certain returns null and the
 * choice stays with the person, because a wrong listing produces a plausible
 * price in the wrong currency — the failure mode this whole file exists to
 * avoid.
 */
export function obviousMatch(
  candidates: readonly InstrumentCandidate[],
  paidInCurrency: string
): InstrumentCandidate | null {
  const wanted = paidInCurrency.trim().toUpperCase();
  const matching = candidates.filter((c) => (c.currency ?? "").toUpperCase() === wanted);
  return matching.length === 1 ? matching[0] : null;
}
