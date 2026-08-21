"use server";

import { db } from "@/db/client";
import { accountConnections, holdings, holdingSnapshots, auditLog, accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  stooqUrl,
  parseStooqCsv,
  suggestSymbols,
  currencyOfSymbol,
} from "@/lib/quotes/stooq";
import {
  OPENFIGI_URL,
  figiRequestBody,
  parseFigiMapping,
  candidateSymbols,
  type FigiListing,
} from "@/lib/quotes/openfigi";
import {
  yahooUrl,
  parseYahooChart,
  yahooSymbol,
  quoteIsStale,
  MAX_PRICE_AGE_DAYS,
} from "@/lib/quotes/yahoo";
import { wasFoundAutomatically } from "@/lib/quotes/symbolSource";
import { normaliseIsin } from "@/lib/portfolio/isin";
import { knownListingFor } from "@/lib/quotes/knownListings";
import { crossCheckPricing } from "@/lib/portfolio/reconstruct";
import { marketValue, isUnpriced } from "@/lib/portfolio";
import { meaningOf } from "@/lib/accounting/balanceScope";
import { adoptAllStatements } from "./brokerImport";
import { ibkrGet, gatewayUrl } from "@/lib/connectors/ibkr";
import {
  parseSearchResults,
  parseSnapshot,
  describeAvailability,
  type InstrumentCandidate,
} from "@/lib/connectors/ibkr/quotes";

/**
 * Asks the gateway whether this idea works, before anything is built on it.
 *
 * Two questions, and both have to be answered by the machine rather than by me:
 *
 *  1. Does the gateway's search endpoint accept an ISIN and return listings?
 *     The Client Portal API has documented both a GET and a POST form of
 *     `/iserver/secdef/search` across versions, and guessing wrong is exactly
 *     how the Trading 212 connector spent a day returning 401.
 *  2. Do you have market data for these instruments? IBKR returns a price only
 *     for what you are entitled to, and European ETFs usually need a paid
 *     subscription. Without it this whole route ends in a blank.
 *
 * So it reports what came back — including the raw shape when nothing parsed —
 * rather than deciding anything.
 */
/**
 * Fetches one closing price, and says exactly what it found.
 *
 * Used to check a symbol before it is saved against a position, because a
 * symbol that returns nothing and a symbol that returns the wrong instrument
 * look identical until you see the number.
 */
export async function checkQuoteSymbol(symbol: string, expectedCurrency: string) {
  const clean = symbol.trim();
  if (clean === "") return { ok: false as const, reason: "Type a symbol first." };

  try {
    const response = await fetch(stooqUrl(clean), {
      // Prices change daily; there is nothing to gain from a cached answer and
      // a stale one would be indistinguishable from a fresh one.
      cache: "no-store",
      headers: { Accept: "text/csv" },
    });

    if (!response.ok) {
      return { ok: false as const, reason: `Stooq answered ${response.status}.` };
    }

    const body = await response.text();
    const quote = parseStooqCsv(body);
    if (!quote) {
      /**
       * The body, quoted back.
       *
       * "No price" covers several very different situations — an unknown
       * symbol answers `N/D`, a blocked request answers HTML, a changed format
       * answers something else again — and they need different fixes. Guessing
       * between them from a generic message is what turned the last two
       * problems into a conversation instead of a diagnosis.
       */
      const sample = body.replace(/\s+/g, " ").trim().slice(0, 120);
      return {
        ok: false as const,
        reason: `No usable price for ${clean}. Stooq said: ${sample || "(empty)"}`,
        suggestions: suggestSymbols(clean),
      };
    }

    /**
     * The currency check is the point of this whole step.
     *
     * A symbol's market decides its currency, and pricing a position bought in
     * euros off a London listing is wrong by the exchange rate while looking
     * entirely sensible. Refused rather than converted: converting would make
     * the mistake invisible, and the right fix is a different symbol.
     */
    // Same rule as Yahoo: a dormant listing answers with its last print, and
    // only the date distinguishes that from a current price.
    if (quoteIsStale(quote.date, new Date().toISOString().slice(0, 10))) {
      return {
        ok: false as const,
        reason: `${clean} last traded on ${quote.date}, more than ${MAX_PRICE_AGE_DAYS} days ago — that listing is dormant, not cheap`,
      };
    }

    const symbolCurrency = currencyOfSymbol(clean);
    const mismatch =
      symbolCurrency !== null &&
      symbolCurrency.toUpperCase() !== expectedCurrency.trim().toUpperCase();

    return {
      ok: true as const,
      quote,
      symbolCurrency,
      mismatch,
      note: mismatch
        ? `That listing trades in ${symbolCurrency}, but you paid in ${expectedCurrency.toUpperCase()}. Pick the listing in your own currency instead.`
        : `Close of ${quote.date}.`,
    };
  } catch (err) {
    return {
      ok: false as const,
      reason: err instanceof Error ? err.message : "Couldn't reach Stooq.",
    };
  }
}

/**
 * A price from Yahoo, with the same refusal to convert as everywhere else.
 *
 * A quote in the wrong currency is rejected rather than translated: converting
 * would hide a wrong listing behind a plausible number, and the fix for a wrong
 * listing is a different listing.
 */
export async function fetchYahooQuote(symbol: string, expectedCurrency: string) {
  try {
    const response = await fetch(yahooUrl(symbol), {
      cache: "no-store",
      // Yahoo answers a bare programmatic request with 403 often enough that
      // this is not decoration.
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      return { ok: false as const, reason: `Yahoo answered ${response.status}.` };
    }

    const quote = parseYahooChart(await response.json());
    if (!quote) return { ok: false as const, reason: "Yahoo returned no price for that symbol." };

    /**
     * A price with no stated currency is refused, not assumed.
     *
     * The check used to read "if a currency was given and it disagrees, reject"
     * — which quietly let through every response that omitted the field. An
     * unlabelled number is the one case where being wrong is undetectable, so
     * it is exactly the case that needed the strictest rule rather than the
     * loosest.
     */
    if (quote.currency === null) {
      return {
        ok: false as const,
        reason: `${symbol} came back without a currency, so there is no way to know it matches.`,
      };
    }

    if (quote.currency.toUpperCase() !== expectedCurrency.trim().toUpperCase()) {
      return {
        ok: false as const,
        reason: `priced in ${quote.currency}, you paid in ${expectedCurrency.toUpperCase()}`,
      };
    }

    /**
     * The check that was missing, and the one that mattered most.
     *
     * A listing that stopped trading years ago still answers, with the right
     * instrument, the right currency and its last print. Nothing about the
     * number looks wrong — it was a real price once. Only the date says so.
     */
    const today = new Date().toISOString().slice(0, 10);
    if (quoteIsStale(quote.date, today)) {
      return {
        ok: false as const,
        reason: `${symbol} last traded on ${quote.date}, more than ${MAX_PRICE_AGE_DAYS} days ago — that listing is dormant, not cheap`,
      };
    }

    return { ok: true as const, price: quote.price, date: quote.date, currency: quote.currency };
  } catch (err) {
    return {
      ok: false as const,
      reason: err instanceof Error ? err.message : "Couldn't reach Yahoo.",
    };
  }
}

/** Stores the symbol to price a position from. Empty clears it. */
export async function setQuoteSymbol(formData: FormData) {
  const id = String(formData.get("id"));
  const raw = String(formData.get("quoteSymbol") ?? "").trim();

  await db
    .update(holdings)
    .set({ quoteSymbol: raw === "" ? null : raw.toLowerCase(), updatedAt: new Date() })
    .where(eq(holdings.id, id));

  revalidatePath("/positions");
  revalidatePath("/investments");
}

/**
 * Refreshes every position that has a symbol.
 *
 * One request per position, sequentially — Stooq is a free service answering
 * out of goodwill, and hammering it in parallel is how goodwill ends. A dozen
 * positions take a couple of seconds.
 *
 * A failure for one position never fails the rest: the price it had stays, and
 * the reason is reported. A missing price is not a price of zero, and this is
 * the boundary where confusing the two would empty a portfolio.
 */
export async function refreshQuotedPrices() {
  const rows = await db.select().from(holdings);
  const quoted = rows.filter((h) => h.quoteSymbol !== null);

  const results: { symbol: string; ok: boolean; note: string }[] = [];

  for (const h of quoted) {
    const symbol = h.quoteSymbol!;

    /**
     * The stored symbol says which source it belongs to.
     *
     * `yahoo:SXR8.DE` and `sxr8.de` are the same instrument spelled for
     * different services, and asking the wrong one returns a confident nothing.
     * The prefix is how a saved choice survives having two providers.
     */
    const price = symbol.startsWith("yahoo:")
      ? await (async () => {
          const found = await fetchYahooQuote(symbol.slice(6), h.currency);
          return found.ok
            ? { ok: true as const, value: found.price, date: found.date }
            : { ok: false as const, note: found.reason };
        })()
      : await (async () => {
          const check = await checkQuoteSymbol(symbol, h.currency);
          if (!check.ok) return { ok: false as const, note: check.reason };
          if (check.mismatch) return { ok: false as const, note: check.note };
          return { ok: true as const, value: check.quote.close, date: check.quote.date };
        })();

    if (!price.ok) {
      results.push({ symbol, ok: false, note: price.note });
      continue;
    }

    await db
      .update(holdings)
      .set({
        currentPrice: String(price.value),
        lastPriceUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, h.id));

    // A snapshot so the value-over-time chart gains a point, exactly as a
    // manual price update does.
    await db.insert(holdingSnapshots).values({
      holdingId: h.id,
      price: String(price.value),
      value: String(Number(h.quantity) * price.value),
    });

    results.push({ symbol, ok: true, note: `${price.value} on ${price.date}` });
  }

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: "quotes",
    action: "prices_refreshed",
    details: JSON.stringify({
      attempted: quoted.length,
      updated: results.filter((r) => r.ok).length,
    }),
  });

  revalidatePath("/investments");
  revalidatePath("/positions");
  return { attempted: quoted.length, updated: results.filter((r) => r.ok).length, results };
}

/**
 * Finds a working price symbol for one ISIN, without anyone typing anything.
 *
 * The chain: OpenFIGI turns the ISIN into tickers, the exchange code turns each
 * into a Stooq symbol, and Stooq is asked until one answers. Nothing is
 * *decided* by inference — a candidate is only accepted once a real price has
 * come back, in the currency the position was bought in.
 *
 * That test matters more than the lookup. Exchange codes can be misread and
 * tickers can collide, but a symbol that returns €512.30 for a euro position is
 * a symbol that works, whatever the metadata claimed.
 */
export async function findSymbolForIsin(isin: string, currency: string) {
  const tried: { symbol: string; note: string }[] = [];

  /**
   * A listing somebody checked, before any listing a machine guessed.
   *
   * Not because the table is trusted more — the price it returns still has to
   * state the right currency and be from this week — but because the guessing
   * had a systematic fault that no amount of ordering fixed: OpenFIGI lists
   * every venue carrying an ISIN, and several of them stopped trading years
   * ago while still answering with their last price.
   */
  const known = knownListingFor(isin);
  if (known) {
    if (known.currency.toUpperCase() !== currency.trim().toUpperCase()) {
      tried.push({
        symbol: known.symbol,
        note: `trades in ${known.currency}, you paid in ${currency.toUpperCase()}`,
      });
    } else {
      const direct = await fetchYahooQuote(known.symbol, currency);
      if (direct.ok) {
        return {
          ok: true as const,
          symbol: `yahoo:${known.symbol}`,
          source: "yahoo" as const,
          price: direct.price,
          date: direct.date,
          tried,
        };
      }
      tried.push({ symbol: known.symbol, note: direct.reason });
    }
  }

  let listings: FigiListing[] = [];
  try {
    const response = await fetch(OPENFIGI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: figiRequestBody([isin]),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false as const,
        reason:
          response.status === 429
            ? "OpenFIGI is rate-limiting us. Wait a minute and try again — it allows a few requests per minute without an account."
            : `OpenFIGI answered ${response.status}.`,
        tried,
      };
    }

    [listings = []] = parseFigiMapping(await response.json());
  } catch (err) {
    return {
      ok: false as const,
      reason: err instanceof Error ? err.message : "Couldn't reach OpenFIGI.",
      tried,
    };
  }

  if (listings.length === 0) {
    return { ok: false as const, reason: "OpenFIGI has no listings for that ISIN.", tried };
  }

  const candidates = candidateSymbols(listings, currency);
  if (candidates.length === 0) {
    return {
      ok: false as const,
      reason: `Found ${listings.length} listing${listings.length === 1 ? "" : "s"}, but none on an exchange this app knows how to price.`,
      tried,
    };
  }

  /**
   * Tried in order, stopping at the first that answers.
   *
   * Capped at five: beyond that the ISIN is on venues Stooq doesn't carry, and
   * a free service answering out of goodwill shouldn't be asked twenty times
   * for one instrument.
   */
  for (const candidate of candidates.slice(0, 5)) {
    if (candidate.currency.toUpperCase() !== currency.trim().toUpperCase()) {
      tried.push({
        symbol: candidate.symbol,
        note: `skipped — trades in ${candidate.currency}, you paid in ${currency.toUpperCase()}`,
      });
      continue;
    }

    /**
     * Two sources per listing, because one of them was wrong.
     *
     * Stooq answered 404 to every German symbol — not "unknown", but the
     * request failing — while the tickers themselves were correct. Betting the
     * feature on a single provider is what turned a working chain into a blank
     * table, so both are asked and whichever answers wins.
     */
    const viaStooq = await checkQuoteSymbol(candidate.symbol, currency);
    if (viaStooq.ok && !viaStooq.mismatch) {
      return {
        ok: true as const,
        symbol: candidate.symbol,
        source: "stooq" as const,
        price: viaStooq.quote.close,
        date: viaStooq.quote.date,
        name: listings[0]?.name ?? null,
        tried,
      };
    }
    tried.push({
      symbol: candidate.symbol,
      note: viaStooq.ok ? viaStooq.note : viaStooq.reason,
    });

    const yahoo = yahooSymbol(candidate.ticker, candidate.exchCode);
    if (!yahoo) continue;

    const viaYahoo = await fetchYahooQuote(yahoo, currency);
    if (viaYahoo.ok) {
      return {
        ok: true as const,
        symbol: `yahoo:${yahoo}`,
        source: "yahoo" as const,
        price: viaYahoo.price,
        date: viaYahoo.date,
        name: listings[0]?.name ?? null,
        tried,
      };
    }
    tried.push({ symbol: yahoo, note: viaYahoo.reason });
  }

  return {
    ok: false as const,
    reason: "Found the instrument, but no listing this app can price returned a quote.",
    tried,
  };
}

/**
 * Does the whole table at once.
 *
 * Only positions that have an ISIN, have no symbol yet, and still sit at cost —
 * so it never touches a choice already made, and pressing it twice is safe.
 *
 * Sequential and deliberately unhurried: two free services are being asked, and
 * a dozen instruments is a few seconds. A failure on one is reported and the
 * rest carry on.
 */
export async function autoPriceHoldings() {
  /**
   * Make the statement's positions real first.
   *
   * They exist as a live replay of the imported file until somebody presses
   * "Create positions", and until then there is nothing in the database to
   * attach a price to. That distinction is real to this codebase and invisible
   * to anyone looking at twelve rows on screen — it surfaced only as this
   * button reporting "nothing to look up" about positions plainly visible above
   * it.
   *
   * Idempotent, so this costs one query when they already exist.
   */
  const adopted = await adoptAllStatements();

  const [rows, accountRows] = await Promise.all([
    db.select().from(holdings),
    db.select().from(accounts),
  ]);

  /** The ISIN lives in `name` for anything adopted from a statement. */
  const isinOf = (h: (typeof rows)[number]): string | null => normaliseIsin(h.name);

  const targets = rows.filter(
    (h) => h.quoteSymbol === null && isinOf(h) !== null && Number(h.quantity) > 0
  );

  const results: { symbol: string; ok: boolean; note: string }[] = [];

  /**
   * Found, but not yet written.
   *
   * Saving each price as it arrives is what let a set of wrong listings become
   * a portfolio showing a loss on a portfolio that is up. Every price here is
   * individually plausible — the mistake is only visible in the sum, so the sum
   * has to be checked before any of it is committed.
   */
  const pending: { holding: (typeof rows)[number]; symbol: string; price: number; date: string }[] =
    [];

  for (const h of targets) {
    const isin = isinOf(h)!;
    const found = await findSymbolForIsin(isin, h.currency);

    if (!found.ok) {
      // Every symbol that was tried, and what came back for each. Without this
      // the report says "no quote" about symbols it never names.
      const attempts = found.tried.map((t) => `${t.symbol}: ${t.note}`).join(" · ");
      results.push({
        symbol: h.symbol.slice(0, 40),
        ok: false,
        note: attempts === "" ? found.reason : `${found.reason} — tried ${attempts}`,
      });
      continue;
    }

    pending.push({ holding: h, symbol: found.symbol, price: found.price, date: found.date });
  }

  /**
   * The check that decides whether any of this is written down.
   *
   * An account that says what it is worth gives a second, independent
   * measurement of the same number. When the prices disagree with it by more
   * than the market could have moved, the prices are wrong — the balance comes
   * from the broker and the listings came from a guess — so the batch is
   * dropped rather than saved with a warning beside it.
   */
  const rejectedAccounts = new Map<string, string>();

  for (const account of accountRows) {
    if (meaningOf(account.balanceMeaning) !== "bank_and_broker") continue;
    if (account.investedValue === null) continue;

    const mine = pending.filter((p) => p.holding.accountId === account.id);
    if (mine.length === 0) continue;

    const bySymbol = new Map(mine.map((p) => [p.holding.id, p.price]));

    let pricedValue = 0;
    let unpricedCost = 0;
    let unpricedCount = 0;

    for (const h of rows) {
      if (h.accountId !== account.id) continue;
      const quantity = Number(h.quantity);
      if (quantity <= 0) continue;

      const proposed = bySymbol.get(h.id);
      const entry = Number(h.avgEntryPrice);
      const shaped = {
        quantity,
        avgEntryPrice: entry,
        currentPrice: proposed ?? Number(h.currentPrice),
        direction: h.direction,
      };

      const stillUnpriced =
        proposed === undefined &&
        isUnpriced({ ...shaped, quoteSymbol: h.quoteSymbol, lastPriceUpdate: h.lastPriceUpdate });

      if (stillUnpriced) {
        unpricedCost += quantity * entry;
        unpricedCount += 1;
      } else {
        pricedValue += marketValue(shaped);
      }
    }

    const check = crossCheckPricing({
      declaredValue: Math.min(Number(account.investedValue ?? 0), Number(account.balance)),
      pricedValue,
      unpricedCost,
      unpricedCount,
    });

    if (check?.suspicious) {
      rejectedAccounts.set(
        account.id,
        `these prices would value the account at ${check.estimate.toFixed(2)}, but ${account.institution} says ${check.declared.toFixed(2)} — a gap of ${check.difference.toFixed(2)}, so at least one listing is the wrong one`
      );
    }
  }

  for (const p of pending) {
    const rejection = p.holding.accountId ? rejectedAccounts.get(p.holding.accountId) : undefined;

    if (rejection) {
      results.push({
        symbol: p.holding.symbol.slice(0, 40),
        ok: false,
        note: `found ${p.symbol} at ${p.price}, not saved — ${rejection}`,
      });
      continue;
    }

    await db
      .update(holdings)
      .set({
        quoteSymbol: p.symbol,
        currentPrice: String(p.price),
        lastPriceUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, p.holding.id));

    await db.insert(holdingSnapshots).values({
      holdingId: p.holding.id,
      price: String(p.price),
      value: String(Number(p.holding.quantity) * p.price),
    });

    results.push({
      symbol: p.holding.symbol.slice(0, 40),
      ok: true,
      note: `${p.symbol} · ${p.price} on ${p.date}`,
    });
  }

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: "quotes",
    action: "symbols_found",
    details: JSON.stringify({
      attempted: targets.length,
      matched: results.filter((r) => r.ok).length,
      rejectedAccounts: rejectedAccounts.size,
    }),
  });

  revalidatePath("/investments");
  revalidatePath("/positions");
  return {
    attempted: targets.length,
    matched: results.filter((r) => r.ok).length,
    /** Positions created on the way, so the count on screen can explain itself. */
    created: adopted.created,
    /** Held back because the total they implied contradicted the broker. */
    heldBack: rejectedAccounts.size,
    results,
  };
}

/**
 * Do the prices agree with what the account says it is worth?
 *
 * Two independent measurements of one number. When they disagree by more than
 * a few percent the fault is almost always a price: a listing matched to the
 * wrong exchange or the wrong share class returns a real, plausible figure for
 * the wrong instrument, and nothing about the row looks off.
 *
 * Per account, because that is the level at which a declared value exists.
 */
export async function getPricingCrossCheck() {
  const [holdingRows, accountRows] = await Promise.all([
    db.select().from(holdings),
    db.select().from(accounts),
  ]);

  return accountRows
    .filter((a) => meaningOf(a.balanceMeaning) === "bank_and_broker" && a.investedValue !== null)
    .map((a) => {
      const mine = holdingRows.filter((h) => h.accountId === a.id && Number(h.quantity) > 0);

      let pricedValue = 0;
      let unpricedCost = 0;
      let unpricedCount = 0;

      for (const h of mine) {
        const entry = Number(h.avgEntryPrice);
        const shaped = {
          quantity: Number(h.quantity),
          avgEntryPrice: entry,
          currentPrice: Number(h.currentPrice),
          direction: h.direction,
        };

        if (isUnpriced({ ...shaped, quoteSymbol: h.quoteSymbol, lastPriceUpdate: h.lastPriceUpdate })) {
          unpricedCost += shaped.quantity * entry;
          unpricedCount += 1;
        } else {
          pricedValue += marketValue(shaped);
        }
      }

      return {
        accountId: a.id,
        accountName: `${a.institution} — ${a.name}`,
        currency: a.currency,
        check: crossCheckPricing({
          declaredValue: Math.min(Number(a.investedValue ?? 0), Number(a.balance)),
          pricedValue,
          unpricedCost,
          unpricedCount,
        }),
      };
    })
    .filter((r) => r.check !== null);
}

export async function probeIbkrQuotes(isin: string) {
  const [connection] = await db
    .select()
    .from(accountConnections)
    .where(eq(accountConnections.platform, "ibkr"));

  if (!connection) {
    return { ok: false as const, reason: "No Interactive Brokers connection is set up." };
  }

  // Honours the configured gateway, not the default, so a non-standard port works.
  const base = gatewayUrl();
  const attempts: { path: string; ok: boolean; note: string }[] = [];

  let candidates: InstrumentCandidate[] = [];

  /**
   * Both documented spellings, in order, stopping at the first that answers.
   *
   * `secType=STK` covers shares and ETFs alike in IBKR's vocabulary; funds and
   * bonds would need their own and are left out until there is a reason.
   */
  for (const path of [
    `/iserver/secdef/search?symbol=${encodeURIComponent(isin)}&secType=STK`,
    `/iserver/secdef/search?symbol=${encodeURIComponent(isin)}`,
  ]) {
    try {
      const payload = await ibkrGet(base, path);
      const parsed = parseSearchResults(payload);
      attempts.push({
        path,
        ok: parsed.length > 0,
        note:
          parsed.length > 0
            ? `${parsed.length} listing${parsed.length === 1 ? "" : "s"}`
            : `answered, but nothing recognisable: ${JSON.stringify(payload).slice(0, 160)}`,
      });
      if (parsed.length > 0) {
        candidates = parsed;
        break;
      }
    } catch (err) {
      attempts.push({
        path,
        ok: false,
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (candidates.length === 0) {
    return { ok: false as const, reason: "The gateway returned no listings for that ISIN.", attempts };
  }

  /**
   * A price for the first candidate, purely to learn whether prices come at
   * all. Which listing is the right one is a separate decision and not one to
   * make here.
   */
  const first = candidates[0];
  let quoteNote = "Not attempted.";
  let priced = false;

  try {
    const snapshot = await ibkrGet(
      base,
      `/iserver/marketdata/snapshot?conids=${encodeURIComponent(first.conid)}&fields=31,6509`
    );
    const [quote] = parseSnapshot(snapshot);

    if (!quote) {
      quoteNote = `The snapshot answered but parsed to nothing: ${JSON.stringify(snapshot).slice(0, 160)}`;
    } else if (quote.price === null) {
      quoteNote =
        describeAvailability(quote.availability) ??
        "No price came back — usually a missing market data subscription.";
    } else {
      priced = true;
      quoteNote = `${quote.price}${quote.isClose ? " (previous close)" : ""} ${quote.currency ?? ""}. ${
        describeAvailability(quote.availability) ?? ""
      }`.trim();
    }
  } catch (err) {
    quoteNote = err instanceof Error ? err.message : String(err);
  }

  return {
    ok: true as const,
    candidates,
    /** How many currencies the same ISIN trades in — the reason to choose by hand. */
    currencies: [...new Set(candidates.map((c) => c.currency).filter(Boolean))] as string[],
    priced,
    quoteNote,
    attempts,
  };
}

/**
 * Throws away every price this app found for you, keeping the ones you chose.
 *
 * Needed because the safety check above only guards prices being written now —
 * anything saved before it existed is already in the database, and a wrong
 * price cannot be corrected by a rule that declines to write it again. A
 * position goes back to sitting at its cost and reporting no measurement, which
 * is the honest state for something nobody has successfully priced.
 *
 * A symbol you typed yourself is left alone: you meant it, and this is not the
 * place to second-guess that.
 */
export async function forgetFoundPrices() {
  const rows = await db.select().from(holdings);

  const automatic = rows.filter((h) => wasFoundAutomatically(h.quoteSymbol));

  for (const h of automatic) {
    await db
      .update(holdings)
      .set({
        quoteSymbol: null,
        // Back to cost, and marked as never measured, so nothing reads it as a
        // flat market rather than an absent price.
        currentPrice: h.avgEntryPrice,
        lastPriceUpdate: null,
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, h.id));
  }

  revalidatePath("/investments");
  revalidatePath("/positions");
  return { cleared: automatic.length };
}
