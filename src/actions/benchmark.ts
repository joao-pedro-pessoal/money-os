"use server";

import { db } from "@/db/client";
import { benchmarkPrices, appSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { yahooHistoryUrl, parseYahooHistory } from "@/lib/quotes/yahoo";
import {
  BENCHMARKS,
  benchmarkById,
  compareOverWindow,
  relativeToBenchmark,
  type BenchmarkDefinition,
  type BenchmarkRefusal,
} from "@/lib/portfolio/benchmark";
import { getPortfolioReturns } from "./investments";
import { getBaseCurrency } from "./settings";

const BENCHMARK_KEY = "benchmark_id";

/** Which index the analytics page compares against. Defaults to the first. */
export async function getBenchmarkChoice(): Promise<BenchmarkDefinition> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, BENCHMARK_KEY));
  return benchmarkById(row?.value ?? "") ?? BENCHMARKS[0];
}

export async function setBenchmarkChoice(formData: FormData) {
  const id = String(formData.get("benchmarkId") ?? "").trim();
  if (benchmarkById(id) === null) throw new Error(`Unknown benchmark: ${id}`);

  await db
    .insert(appSettings)
    .values({ key: BENCHMARK_KEY, value: id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: id, updatedAt: new Date() },
    });

  revalidatePath("/statistics");
}

/**
 * Fills the local series for one benchmark from Yahoo.
 *
 * Stores rather than fetching per render: a page that cannot draw until a third
 * party answers is a page that sometimes does not draw. The comparison itself
 * only ever reads what is stored, so a failed refresh leaves yesterday's chart
 * standing instead of an empty one.
 *
 * Reports what was tried and what came back. "Could not refresh" names no
 * symbol and no status, and a message that cannot be acted on costs a round
 * trip every time.
 */
export async function refreshBenchmark(id?: string) {
  const definition = id ? benchmarkById(id) : await getBenchmarkChoice();
  if (definition === null) return { ok: false as const, reason: `Unknown benchmark: ${id}` };

  const { symbol, currency: expected } = definition;

  try {
    const response = await fetch(yahooHistoryUrl(symbol, "5y"), {
      cache: "no-store",
      // Same as the quote path: Yahoo answers a bare programmatic request with
      // 403 often enough that this is not decoration.
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      return { ok: false as const, reason: `Yahoo answered ${response.status} for ${symbol}.` };
    }

    const series = parseYahooHistory(await response.json());
    if (series === null) {
      return {
        ok: false as const,
        reason: `Yahoo returned no usable series for ${symbol}. Either the symbol is wrong or the response had no daily closes in it.`,
      };
    }

    /**
     * Refused, never converted — the same rule as every other price in this
     * app. A benchmark in the wrong currency is a wrong benchmark, and the fix
     * is a different listing, not an exchange rate applied on top.
     */
    if (series.currency === null || series.currency !== expected) {
      return {
        ok: false as const,
        reason: `${symbol} came back in ${series.currency ?? "no stated currency"}, and the comparison needs ${expected}. Nothing was stored.`,
      };
    }

    /**
     * Written in one statement so a half-fetched series never becomes a half
     * chart. `onConflictDoUpdate` because a day's close can be revised, and the
     * later reading is the better one.
     */
    await db
      .insert(benchmarkPrices)
      .values(
        series.points.map((p) => ({
          symbol,
          date: p.date,
          close: p.close.toFixed(6),
          currency: series.currency as string,
          fetchedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [benchmarkPrices.symbol, benchmarkPrices.date],
        // The row being inserted, not a literal: a close can be revised after
        // the fact and the later reading is the better one. Writing `undefined`
        // here updates nothing at all, silently.
        set: {
          close: sql`excluded.close`,
          currency: sql`excluded.currency`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });

    revalidatePath("/statistics");
    return {
      ok: true as const,
      symbol,
      stored: series.points.length,
      from: series.points[0].date,
      to: series.points[series.points.length - 1].date,
    };
  } catch (err) {
    return {
      ok: false as const,
      reason: `Could not reach Yahoo for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Why there is no comparison, in words a page can show. */
const REFUSALS: Record<BenchmarkRefusal, string> = {
  no_series:
    "There is no stored series for this index over that window yet. Refresh it and the comparison appears.",
  starts_too_late:
    "The stored index series does not reach back to where your own history starts. Comparing them would measure two different periods and present the difference as performance.",
  ends_too_early:
    "The stored index series stops well before your history does, so the two would cover different periods. Refresh it to bring it up to date.",
  wrong_currency:
    "The index series came back in a currency this comparison cannot use. It is refused rather than converted, because converting would hide a wrong listing behind a plausible number.",
};

/**
 * Your return against the market's, over one window and one window only.
 *
 * The portfolio side is the **time-weighted** curve, never net worth. Net worth
 * rises when money is paid in and an index has no equivalent event, so drawing
 * them together would show a deposit as beating the market on the day it
 * landed. That is the comparison this whole feature exists to avoid making.
 *
 * Returns null when the time-weighted return itself is withheld — there is no
 * honest way to compare a number the app has already declined to state.
 */
export async function getBenchmarkComparison() {
  const [definition, returns, base] = await Promise.all([
    getBenchmarkChoice(),
    getPortfolioReturns(),
    getBaseCurrency(),
  ]);

  const twr = returns.timeWeighted;
  if (twr === null) {
    return {
      benchmark: definition,
      baseCurrency: base,
      /** The page already explains this one; repeating it here would diverge. */
      unavailable: returns.withheld.timeWeighted,
      comparison: null,
    };
  }

  const stored = await db
    .select()
    .from(benchmarkPrices)
    .where(eq(benchmarkPrices.symbol, definition.symbol));

  const result = compareOverWindow({
    points: stored.map((r) => ({ date: r.date, close: Number(r.close) })),
    currency: stored[0]?.currency ?? null,
    expectedCurrency: definition.currency,
    from: twr.from,
    to: twr.to,
  });

  if (!result.ok) {
    return {
      benchmark: definition,
      baseCurrency: base,
      unavailable: REFUSALS[result.reason],
      comparison: null,
    };
  }

  return {
    benchmark: definition,
    baseCurrency: base,
    unavailable: null,
    comparison: {
      /** Both rebased to 100 on their first day, which is what makes them comparable. */
      portfolioCurve: returns.timeWeightedCurve,
      indexCurve: result.comparison.curve,
      portfolioReturn: twr.totalReturn,
      indexReturn: result.comparison.indexReturn,
      /** Ahead or behind, in percentage points. */
      differencePoints: relativeToBenchmark(twr.totalReturn, result.comparison.indexReturn),
      from: twr.from,
      to: twr.to,
      /** The index's own edges, which can sit a few days inside the window. */
      indexFrom: result.comparison.from,
      indexTo: result.comparison.to,
    },
  };
}

/** How stale the stored series is, so the page can offer a refresh with a reason. */
export async function getBenchmarkFreshness() {
  const definition = await getBenchmarkChoice();
  const rows = await db
    .select()
    .from(benchmarkPrices)
    .where(eq(benchmarkPrices.symbol, definition.symbol));

  if (rows.length === 0) return { symbol: definition.symbol, lastDate: null, points: 0 };

  const lastDate = rows.map((r) => r.date).sort().at(-1) ?? null;
  return { symbol: definition.symbol, lastDate, points: rows.length };
}
