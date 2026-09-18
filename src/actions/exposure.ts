"use server";

import { db } from "@/db/client";
import { assetProfiles, auditLog, holdings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { expectedSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getPortfolioItems } from "./dashboard";
import { getBaseCurrency } from "./settings";
import {
  exposure,
  isEquity,
  looksLikeSymbol,
  parseYahooProfile,
  yahooSymbolFor,
  type AssetProfile,
  type Exposure,
  type FundHolding,
} from "@/lib/portfolio/exposure";
import { lookThrough, type LookThrough } from "@/lib/portfolio/lookThrough";
import { feesByYear, fundCosts, type FeeYear, type FundCosts } from "@/lib/portfolio/costs";
import { getTradeAnalysis } from "./investmentActivity";

async function requireSession() {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== (await expectedSessionValue())) {
    throw new Error("Your session has expired. Sign in again.");
  }
}

/** A profile is re-read after this long; sectors and head offices rarely move. */
const FRESH_DAYS = 30;
/** A lookup that found nothing is tried again after this long. */
const RETRY_DAYS = 7;
/**
 * What a saved profile holds. 1: sector and country (F09). 2: also a fund's
 * largest holdings and TER. A row read by an older version is read again.
 */
const PROFILE_VERSION = 2;
/** Per press of the button, so one visit never waits on dozens of requests. */
const BATCH = 25;

const DAY_MS = 86_400_000;

type ProfileRow = typeof assetProfiles.$inferSelect;

function toProfile(row: ProfileRow): AssetProfile | null {
  if (!row.symbol) return null;
  return {
    symbol: row.symbol,
    quoteType: row.quoteType,
    sector: row.sector,
    country: row.country,
    sectorWeights: readJson<Record<string, number>>(row.sectorWeights),
    name: row.name,
    topHoldings: readJson<FundHolding[]>(row.topHoldings),
    expenseRatio: row.expenseRatio === null ? null : Number(row.expenseRatio),
  };
}

function readJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Whether a saved profile should be read again: never read, old, or a fund
 * saved before its largest holdings were kept.
 */
function isDue(row: ProfileRow | undefined, now: number): boolean {
  if (!row) return true;
  if (row.symbol && row.version < PROFILE_VERSION) return true;
  return now - row.fetchedAt.getTime() > (row.symbol ? FRESH_DAYS : RETRY_DAYS) * DAY_MS;
}

/** The stocks and ETFs held, each with the listing to ask the data source about. */
async function equityLookups() {
  const [{ items }, holdingRows] = await Promise.all([
    getPortfolioItems(),
    db.select({ id: holdings.id, quoteSymbol: holdings.quoteSymbol }).from(holdings),
  ]);
  const quoteOf = new Map(holdingRows.map((h) => [`h:${h.id}`, h.quoteSymbol]));
  return {
    items,
    lookups: items.map((i) => ({
      item: i,
      lookup: isEquity(i.assetType) ? yahooSymbolFor(quoteOf.get(i.id) ?? null, i.symbol) : null,
    })),
  };
}

export interface ExposureView {
  sector: Exposure;
  country: Exposure;
  region: Exposure;
  /** Companies held directly and through funds' reported largest holdings. */
  inside: LookThrough;
  /** What the funds held take each year, by their reported TER. */
  costs: FundCosts;
  /** What each stock or ETF was matched to, so a wrong match can be seen. */
  matches: { name: string; lookup: string; symbol: string | null; quoteType: string | null; value: number; looked: boolean }[];
  /** Stocks and ETFs never looked up, or due to be read again. */
  due: number;
  /** The base currency every value here is in. */
  currency: string;
}

/**
 * The portfolio's stocks and ETFs by sector, country and region, from the
 * profiles already saved. Reads nothing from the internet.
 */
export async function getExposure(): Promise<ExposureView> {
  const { lookups } = await equityLookups();
  const keys = [...new Set(lookups.map((l) => l.lookup).filter((k): k is string => k !== null))];
  const rows = keys.length === 0 ? [] : await db.select().from(assetProfiles).where(inArray(assetProfiles.lookup, keys));
  const byLookup = new Map(rows.map((r) => [r.lookup, r]));
  const now = Date.now();

  const withProfiles = lookups.map((l) => {
    const row = l.lookup ? byLookup.get(l.lookup) : undefined;
    return { label: l.item.symbol, value: l.item.value, assetType: l.item.assetType, profile: row ? toProfile(row) : null };
  });

  const due = keys.filter((k) => isDue(byLookup.get(k), now)).length;

  const matches = lookups
    .filter((l) => l.lookup !== null && l.item.value > 0)
    .map((l) => {
      const row = byLookup.get(l.lookup!);
      return {
        name: l.item.symbol,
        lookup: l.lookup!,
        symbol: row?.symbol ?? null,
        quoteType: row?.quoteType ?? null,
        value: l.item.value,
        looked: row !== undefined,
      };
    })
    .sort((a, b) => b.value - a.value);

  return {
    sector: exposure(withProfiles, "sector"),
    country: exposure(withProfiles, "country"),
    region: exposure(withProfiles, "region"),
    inside: lookThrough(withProfiles),
    costs: fundCosts(withProfiles),
    matches,
    due,
    currency: await getBaseCurrency(),
  };
}

// ---------------------------------------------------------------- Yahoo

const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0" };

/**
 * A cookie and "crumb" for Yahoo's profile endpoint, which refuses requests
 * without them. Read fresh for each batch; nothing is kept.
 */
async function yahooSession(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    // No "Accept: application/json" on these two: the crumb comes back as
    // plain text, and asking for JSON gets a 406 instead.
    const plain = { "User-Agent": HEADERS["User-Agent"] };
    const first = await fetch("https://fc.yahoo.com", { headers: plain, redirect: "manual", cache: "no-store" });
    const cookie = first.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    if (!cookie) return null;
    const crumbResponse = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...plain, Cookie: cookie },
      cache: "no-store",
    });
    const crumb = (await crumbResponse.text()).trim();
    if (!crumbResponse.ok || !crumb || crumb.includes("<")) return null;
    return { cookie, crumb };
  } catch {
    return null;
  }
}

async function readProfile(symbol: string, session: { cookie: string; crumb: string }): Promise<AssetProfile | null> {
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=assetProfile,quoteType,topHoldings,fundProfile,summaryDetail&crumb=${encodeURIComponent(session.crumb)}`;
  const response = await fetch(url, { headers: { ...HEADERS, Cookie: session.cookie }, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Yahoo answered ${response.status}.`);
  return parseYahooProfile(symbol, await response.json());
}

/** The first share or fund Yahoo's search finds for a name or ticker. */
async function searchListing(query: string): Promise<{ symbol: string; name: string | null } | null> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`;
  const response = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!response.ok) throw new Error(`Yahoo search answered ${response.status}.`);
  const body = (await response.json()) as { quotes?: { symbol?: string; quoteType?: string; longname?: string; shortname?: string }[] };
  const hit = (body.quotes ?? []).find((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"));
  return hit?.symbol ? { symbol: hit.symbol, name: hit.longname ?? hit.shortname ?? null } : null;
}

/** A profile that says something: a sector, a country, or what a fund holds. */
function hasFacts(profile: AssetProfile | null): profile is AssetProfile {
  return Boolean(profile && (profile.sector || profile.country || profile.sectorWeights || profile.topHoldings?.length));
}

export interface ProfileRefresh {
  looked: number;
  found: number;
  notFound: string[];
  /** Set when the data source could not be reached at all. */
  problem: string | null;
  /** Still due after this batch. */
  remaining: number;
}

/**
 * Reads sector and country for the stocks and ETFs that have none yet, or
 * whose profile is old. A listing is asked for directly; a name that is not a
 * listing is searched for first. Nothing about your money is sent: only the
 * listings' names.
 */
export async function refreshAssetProfiles(): Promise<ProfileRefresh> {
  await requireSession();
  const { lookups } = await equityLookups();
  const keys = [...new Set(lookups.map((l) => l.lookup).filter((k): k is string => k !== null))];
  const rows = keys.length === 0 ? [] : await db.select().from(assetProfiles).where(inArray(assetProfiles.lookup, keys));
  const byLookup = new Map(rows.map((r) => [r.lookup, r]));
  const now = Date.now();
  const due = keys.filter((k) => isDue(byLookup.get(k), now));
  const batch = due.slice(0, BATCH);
  const result: ProfileRefresh = { looked: 0, found: 0, notFound: [], problem: null, remaining: due.length };
  if (batch.length === 0) return result;

  const session = await yahooSession();
  if (!session) return { ...result, problem: "Could not reach the data source (Yahoo). Try again later." };

  for (const lookup of batch) {
    try {
      let profile = looksLikeSymbol(lookup) ? await readProfile(lookup, session) : null;
      let name: string | null = null;
      if (!hasFacts(profile)) {
        const listing = await searchListing(lookup);
        if (listing) {
          profile = await readProfile(listing.symbol, session);
          name = listing.name;
        }
      }
      const found = hasFacts(profile) ? profile : null;
      const values = {
        symbol: found?.symbol ?? null,
        name: found?.name ?? name,
        quoteType: found?.quoteType ?? null,
        sector: found?.sector ?? null,
        country: found?.country ?? null,
        sectorWeights: found?.sectorWeights ? JSON.stringify(found.sectorWeights) : null,
        // A fund keeps "[]" when it reports no holdings, so it is not asked again tomorrow.
        topHoldings: found?.topHoldings ? JSON.stringify(found.topHoldings) : found?.quoteType === "ETF" ? "[]" : null,
        expenseRatio: found?.expenseRatio == null ? null : String(found.expenseRatio),
        version: PROFILE_VERSION,
        fetchedAt: new Date(),
      };
      await db
        .insert(assetProfiles)
        .values({ lookup, ...values })
        .onConflictDoUpdate({ target: assetProfiles.lookup, set: values });
      result.looked++;
      if (found) result.found++;
      else result.notFound.push(lookup);
    } catch (error) {
      // A refusal part-way (rate limit, outage) stops the batch; what was read is kept.
      result.problem = `Stopped at ${lookup}: ${(error as Error).message}`;
      break;
    }
  }
  result.remaining = due.length - result.looked;

  await db.insert(auditLog).values({
    entityType: "asset_profile",
    entityId: "batch",
    action: "asset_profiles_refreshed",
    details: JSON.stringify({ looked: result.looked, found: result.found }),
  });
  revalidatePath("/investments/analysis");
  return result;
}

/** Forgets one saved match, so the next look-up asks again. */
export async function forgetAssetProfile(formData: FormData): Promise<void> {
  await requireSession();
  const lookup = String(formData.get("lookup") ?? "").trim();
  if (!lookup) return;
  await db.delete(assetProfiles).where(inArray(assetProfiles.lookup, [lookup]));
  revalidatePath("/investments/analysis");
}

/**
 * Fees paid by year, from the same converted rows Trade history charts, in the
 * base currency. Rows no rate could convert are left out there and here alike.
 */
export async function getFeesByYear(): Promise<{ years: FeeYear[]; unconvertible: number; currency: string }> {
  const analysis = await getTradeAnalysis();
  return { years: feesByYear(analysis.rows), unconvertible: analysis.unconvertible, currency: analysis.baseCurrency };
}
