"use server";

import { db } from "@/db/client";
import { assetProfiles, auditLog, companyMoves, fundHoldings, holdings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { expectedSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getPortfolioItems } from "./dashboard";
import { getBaseCurrency } from "./settings";
import {
  assetClasses,
  exposure,
  isEquity,
  looksLikeSymbol,
  parseYahooProfile,
  yahooSymbolFor,
  type AssetAllocation,
  type AssetProfile,
  type Exposure,
  type FundHolding,
} from "@/lib/portfolio/exposure";
import { limitCompanies, lookThrough, sectorMoves, type LookThrough, type SectorMove } from "@/lib/portfolio/lookThrough";
import { isharesHoldingsUrl, parseIsharesHoldings, type FundHoldingRow } from "@/lib/funds/ishares";
import { listingAlternatives } from "@/lib/funds/listing";
import { isinOfHolding, normaliseIsin } from "@/lib/portfolio/isin";
import { parsePriceSeries, priceChanges, WINDOWS, type PriceChanges, type WindowKey } from "@/lib/funds/priceMoves";
import { feesByYear, fundCosts, type FeeYear, type FundCosts } from "@/lib/portfolio/costs";
import { getTradeAnalysis } from "./investmentActivity";
import type { Announced } from "@/lib/portfolio/dividendCalendar";

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
 * largest holdings and TER. 3: also announced dividend dates. 4: also what the
 * fund says it holds — shares, bonds, cash, other. A row read by an older
 * version is read again.
 */
const PROFILE_VERSION = 4;
/** Announced dividend dates move every quarter; a passed one is checked weekly. */
const CALENDAR_DAYS = 7;
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
    industry: row.industry,
    country: row.country,
    sectorWeights: readJson<Record<string, number>>(row.sectorWeights),
    name: row.name,
    topHoldings: readJson<FundHolding[]>(row.topHoldings),
    assetAllocation: readJson<AssetAllocation>(row.assetAllocation),
    expenseRatio: row.expenseRatio === null ? null : Number(row.expenseRatio),
    exDividendDate: row.exDividendDate,
    dividendDate: row.dividendDate,
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
 *
 * **A row that found nothing is re-read on a version change too.** That check
 * used to apply only to rows with a symbol, and the omission hid exactly the
 * case the new version existed for: the two bond funds, the gold ETC and the
 * silver ETC were saved as "nothing found" because the old reading looked only
 * for a sector, so when the reading learned to ask what a fund holds, the four
 * listings that needed it were the four it skipped. They stayed Unclassified,
 * 118.73 EUR of them, until the retry clock ran out a week later.
 */
function isDue(row: ProfileRow | undefined, now: number): boolean {
  if (!row) return true;
  if (row.version < PROFILE_VERSION) return true;
  // A company whose announced dividend has passed may have announced the next.
  const passed = row.dividendDate ?? row.exDividendDate;
  if (row.symbol && passed && new Date(`${passed}T23:59:59Z`).getTime() < now) {
    if (now - row.fetchedAt.getTime() > CALENDAR_DAYS * DAY_MS) return true;
  }
  return now - row.fetchedAt.getTime() > (row.symbol ? FRESH_DAYS : RETRY_DAYS) * DAY_MS;
}

/**
 * A fund whose ISIN the app does not hold, because the platform reports a
 * ticker and nothing else.
 *
 * Hand-checked against the manager's own product list, the same arrangement as
 * `quotes/knownListings.ts` and for the same reason: a fund's identity is a
 * fact to look up once, not to infer from a ticker that several funds share.
 * A fund missing from here simply keeps its ten largest holdings.
 */
const ISIN_BY_LOOKUP: Record<string, string> = {
  // iShares Edge MSCI World Minimum Volatility UCITS ETF USD (Acc)
  "MVOL.L": "IE00B8FHGS14",
  // iShares European Property Yield UCITS ETF EUR (Dist)
  "IPRP.AS": "IE00B0M63284",
};

/** The stocks and ETFs held, each with the listing to ask the data source about. */
async function equityLookups() {
  const [{ items }, holdingRows] = await Promise.all([
    getPortfolioItems(),
    db.select({ id: holdings.id, quoteSymbol: holdings.quoteSymbol, symbol: holdings.symbol, name: holdings.name }).from(holdings),
  ]);
  const quoteOf = new Map(holdingRows.map((h) => [`h:${h.id}`, h.quoteSymbol]));
  /**
   * The ISIN a holding carries, which is what a fund's manager publishes its
   * file under.
   *
   * Either column can hold it: an imported statement writes the fund's legal
   * name into `symbol` and its ISIN into `name`, and a position typed by hand
   * does the opposite. Checking both and keeping whichever is a valid ISIN is
   * the only reading that works for a portfolio holding some of each.
   */
  const isinOf = new Map(holdingRows.map((h) => [`h:${h.id}`, isinOfHolding(h)]));
  return {
    items,
    lookups: items.map((i) => {
      const lookup = isEquity(i.assetType) ? yahooSymbolFor(quoteOf.get(i.id) ?? null, i.symbol) : null;
      return {
        item: i,
        lookup,
        isin: isinOf.get(i.id) ?? (lookup ? ISIN_BY_LOOKUP[lookup] ?? null : null),
      };
    }),
  };
}

export interface ExposureView {
  sector: Exposure;
  country: Exposure;
  region: Exposure;
  /** Everything held, by what kind of thing it is — crypto and cash included. */
  classes: Exposure;
  /** Companies held directly and through funds' reported largest holdings. */
  inside: LookThrough;
  /** What the funds held take each year, by their reported TER. */
  costs: FundCosts;
  /** What each stock or ETF was matched to, so a wrong match can be seen. */
  matches: { name: string; lookup: string; symbol: string | null; quoteType: string | null; value: number; looked: boolean }[];
  /** Stocks and ETFs never looked up, or due to be read again. */
  due: number;
  /** The funds whose own published file has been read, and when for. */
  files: { lookup: string; fundName: string | null; asOf: string | null; rowCount: number }[];
  /** Funds held whose file could be read and has not been. */
  filesDue: number;
  /** How the sectors you hold have moved, per window, largest rise first. */
  sectors: Record<WindowKey, SectorMove[]>;
  /** Companies held with a listing whose prices have not been read. */
  movesDue: number;
  /** Companies whose sector, industry or country is still unknown. */
  detailsDue: number;
  /** The base currency every value here is in. */
  currency: string;
}

/**
 * The portfolio's stocks and ETFs by sector, country and region, from the
 * profiles already saved. Reads nothing from the internet.
 */
export async function getExposure(companyLimit = 250): Promise<ExposureView> {
  const { lookups } = await equityLookups();
  const keys = [...new Set(lookups.map((l) => l.lookup).filter((k): k is string => k !== null))];
  const rows = keys.length === 0 ? [] : await db.select().from(assetProfiles).where(inArray(assetProfiles.lookup, keys));
  const byLookup = new Map(rows.map((r) => [r.lookup, r]));
  const now = Date.now();

  const fundRows = keys.length === 0 ? [] : await db.select().from(fundHoldings).where(inArray(fundHoldings.lookup, keys));
  const publishedBy = new Map(fundRows.map((r) => [r.lookup, r]));

  // Every move read so far. A few hundred rows of two numbers; joining them
  // here keeps `lookThrough` pure and keeps the screens from ever computing a
  // change of their own.
  // The windows only: the weekly series behind them is stored beside these
  // and is not worth carrying into every page render.
  const moveRows = await db
    .select({ symbol: companyMoves.symbol, changes: companyMoves.changes })
    .from(companyMoves);
  const moves = new Map<string, PriceChanges>();
  for (const m of moveRows) {
    const changes = readJson<PriceChanges>(m.changes);
    if (changes) moves.set(m.symbol, changes);
  }

  /**
   * What the companies inside the funds are.
   *
   * A fund's published file states the sector and the country of every
   * position; the price source's ten largest state neither, so the companies
   * reached that way — Samsung, TSMC, Tencent, all of the emerging-markets
   * fund — had no sector and no country at all. Their own profiles answer
   * that, and are saved under the same key as any other listing.
   */
  const withProfiles = lookups.map((l) => {
    const row = l.lookup ? byLookup.get(l.lookup) : undefined;
    const file = l.lookup ? publishedBy.get(l.lookup) : undefined;
    // Only the companies: a fund's own cash, futures and FX lines are in the
    // file too, and they are not things to hold a share of.
    const published = file
      ? (readJson<FundHoldingRow[]>(file.rows) ?? []).filter((r) => r.kind === "equity")
      : null;
    return {
      label: l.item.symbol,
      value: l.item.value,
      assetType: l.item.assetType,
      profile: row ? toProfile(row) : null,
      published: published && published.length > 0 ? published : null,
      /**
       * Your gain on this position, from the figures the app already holds:
       * value less P&L is what it cost, and the P&L over that is the gain.
       * Absent where the cost is not stated — a synced exchange balance knows
       * what it is worth and never what it cost.
       */
      gainPercent: (() => {
        if (l.item.costUnknown) return null;
        const cost = l.item.value - l.item.pnl;
        return cost > 0 ? Math.round((l.item.pnl / cost) * 10000) / 100 : null;
      })(),
    };
  });

  const due = keys.filter((k) => isDue(byLookup.get(k), now)).length;
  // Read once, narrowed after: the sector figures are of every company known,
  // and the table lists the largest of them. The first pass finds which
  // listings are involved; the second fills in what each of them is.
  const named = lookThrough(withProfiles, 0, moves);
  const symbols = [...new Set(named.companies.map((c) => c.symbol).filter((v): v is string => v !== null))];
  const detailRows =
    symbols.length === 0
      ? []
      : await db
          .select({
            lookup: assetProfiles.lookup,
            sector: assetProfiles.sector,
            industry: assetProfiles.industry,
            country: assetProfiles.country,
          })
          .from(assetProfiles)
          .where(inArray(assetProfiles.lookup, symbols));
  const details = new Map(detailRows.map((r) => [r.lookup, { sector: r.sector, industry: r.industry, country: r.country }]));
  const full = details.size === 0 ? named : lookThrough(withProfiles, 0, moves, details);
  const inside = limitCompanies(full, companyLimit);
  const everyCompany = full.companies;

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
    classes: assetClasses(withProfiles),
    inside: inside,
    costs: fundCosts(withProfiles),
    matches,
    due,
    // One reading per window, so the screen can switch between them without
    // asking the server again — they are a dozen rows each.
    sectors: Object.fromEntries(WINDOWS.map((w) => [w.key, sectorMoves(everyCompany, w.key)])) as Record<
      WindowKey,
      SectorMove[]
    >,
    movesDue: everyCompany
      .filter((c) => c.symbol !== null && c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, MOVE_LIMIT)
      .filter((c) => Object.keys(c.changes).length === 0).length,
    // The largest companies first, then those of them still unknown — not the
    // largest unknown ones, which would count 500 every time until the whole
    // 2 832-company tail had been read.
    detailsDue: everyCompany
      .filter((c) => c.symbol !== null && c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, MOVE_LIMIT)
      .filter((c) => !c.sector || !c.country || !c.industry).length,
    files: fundRows
      .map((r) => ({ lookup: r.lookup, fundName: r.fundName, asOf: r.asOf, rowCount: r.rowCount }))
      .sort((a, b) => b.rowCount - a.rowCount),
    filesDue: lookups.filter((l) => l.lookup && l.isin && !publishedBy.has(l.lookup) && isFundRow(byLookup.get(l.lookup)))
      .length,
    currency: await getBaseCurrency(),
  };
}

/** Whether a saved profile describes a fund, which is what has a file to read. */
function isFundRow(row: ProfileRow | undefined): boolean {
  return row?.quoteType === "ETF" || row?.quoteType === "MUTUALFUND";
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
    `?modules=assetProfile,quoteType,topHoldings,fundProfile,summaryDetail,calendarEvents&crumb=${encodeURIComponent(session.crumb)}`;
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

/**
 * A profile that says something: a sector, a country, what a fund holds, or
 * how it is split between shares, bonds and cash.
 *
 * That last one is why four listings stopped being reported as "not found".
 * iShares Global Govt Bond, its distributing twin and WisdomTree Physical
 * Silver were all found, every time; they have no sector because they hold no
 * shares, and calling that "not found" sent the reader looking for a wrong
 * ticker instead of telling them what these are.
 */
function hasFacts(profile: AssetProfile | null): profile is AssetProfile {
  return Boolean(
    profile &&
      (profile.sector || profile.country || profile.sectorWeights || profile.topHoldings?.length || profile.assetAllocation)
  );
}

export interface ProfileRefresh {
  looked: number;
  found: number;
  /** Nothing answered to this name at all — usually a ticker the source spells differently. */
  notFound: string[];
  /**
   * The listing answered, and has no sector, country or holdings to give: a
   * physical-metal ETC is the case here. A different thing from not finding
   * it, and saying so is the difference between "go and check this" and
   * "nothing to check".
   */
  nothingPublished: string[];
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
  const result: ProfileRefresh = { looked: 0, found: 0, notFound: [], nothingPublished: [], problem: null, remaining: due.length };
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
        industry: found?.industry ?? null,
        country: found?.country ?? null,
        sectorWeights: found?.sectorWeights ? JSON.stringify(found.sectorWeights) : null,
        // A fund keeps "[]" when it reports no holdings, so it is not asked again tomorrow.
        topHoldings: found?.topHoldings ? JSON.stringify(found.topHoldings) : found?.quoteType === "ETF" ? "[]" : null,
        assetAllocation: found?.assetAllocation ? JSON.stringify(found.assetAllocation) : null,
        expenseRatio: found?.expenseRatio == null ? null : String(found.expenseRatio),
        exDividendDate: found?.exDividendDate ?? null,
        dividendDate: found?.dividendDate ?? null,
        version: PROFILE_VERSION,
        fetchedAt: new Date(),
      };
      await db
        .insert(assetProfiles)
        .values({ lookup, ...values })
        .onConflictDoUpdate({ target: assetProfiles.lookup, set: values });
      result.looked++;
      if (found) result.found++;
      // A listing that answered with a name is a listing that exists; what it
      // does not have is anything to classify it by.
      else if (profile?.name ?? name) result.nothingPublished.push(lookup);
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
  revalidatePath("/investments/dividends");
  return result;
}

// ------------------------------------------------- the managers' own files

/** A published holdings file is re-read after this long; they change daily. */
const FILE_DAYS = 7;
/**
 * What a saved holdings file holds. 1: the companies and their weights.
 * 2: also the exchange each trades on and the listing to ask a price source
 * about. A file read by an older version is read again.
 */
const FILE_VERSION = 2;
/** Files per press. Each is up to half a megabyte, so a few at a time. */
const FILE_BATCH = 8;

const ISHARES_UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
};

/**
 * Every iShares fund, by ISIN, with the page its holdings file sits under.
 *
 * One request for the whole product list rather than a table of URLs to
 * maintain: a fund's page moves, its ISIN does not. The British and Irish
 * sites answer a disclaimer page instead of the file, so the German one is
 * used — see `lib/funds/ishares.ts`.
 */
async function isharesPages(): Promise<Map<string, { page: string; ticker: string; name: string }>> {
  const url =
    "https://www.ishares.com/de/privatanleger/de/product-screener/product-screener-v3.1.jsn" +
    "?dcrPath=/templatedata/config/product-screener-v3/data/de/germany/product-screener/ishares-product-screener-backend-config" +
    "&siteEntryPassthrough=true";
  const response = await fetch(url, { headers: { ...ISHARES_UA, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`The fund list answered ${response.status}.`);
  const body = (await response.json()) as Record<string, Record<string, unknown>>;
  const out = new Map<string, { page: string; ticker: string; name: string }>();
  const plain = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    const r = (value as { r?: unknown } | null)?.r;
    return typeof r === "string" ? r : null;
  };
  for (const fund of Object.values(body)) {
    const isin = normaliseIsin(plain(fund.isin));
    const page = plain(fund.productPageUrl);
    if (!isin || !page) continue;
    out.set(isin, {
      page,
      ticker: plain(fund.localExchangeTicker) ?? isin,
      name: plain(fund.fundName) ?? isin,
    });
  }
  return out;
}

export interface FundFileRefresh {
  read: number;
  /** Funds whose file could not be read, and why, in the user's words. */
  failed: { fund: string; reason: string }[];
  /** Funds with no file to read here: another manager, or no ISIN known. */
  unsupported: number;
  problem: string | null;
  remaining: number;
}

/**
 * Reads the complete holdings file each fund's manager publishes.
 *
 * On its own button, apart from the sector look-up: it fetches half a megabyte
 * per fund from a different source, and one failing should leave the other's
 * work alone. Nothing about your money is sent — the request names a fund.
 */
export async function refreshFundFiles(): Promise<FundFileRefresh> {
  await requireSession();
  const { lookups } = await equityLookups();
  const keys = [...new Set(lookups.map((l) => l.lookup).filter((k): k is string => k !== null))];
  const profiles = keys.length === 0 ? [] : await db.select().from(assetProfiles).where(inArray(assetProfiles.lookup, keys));
  const profileBy = new Map(profiles.map((r) => [r.lookup, r]));
  const saved = keys.length === 0 ? [] : await db.select().from(fundHoldings).where(inArray(fundHoldings.lookup, keys));
  const savedBy = new Map(saved.map((r) => [r.lookup, r]));
  const now = Date.now();

  // One entry per fund held, newest first is irrelevant here: what matters is
  // that a fund held twice (two accounts) is read once.
  const funds = new Map<string, { isin: string | null; name: string }>();
  for (const l of lookups) {
    if (!l.lookup || funds.has(l.lookup)) continue;
    if (!isFundRow(profileBy.get(l.lookup))) continue;
    funds.set(l.lookup, { isin: l.isin, name: profileBy.get(l.lookup)?.name ?? l.lookup });
  }

  const result: FundFileRefresh = { read: 0, failed: [], unsupported: 0, problem: null, remaining: 0 };
  const due: { lookup: string; isin: string; name: string }[] = [];
  for (const [lookup, fund] of funds) {
    if (!fund.isin) {
      result.unsupported++;
      continue;
    }
    const row = savedBy.get(lookup);
    if (row && row.version >= FILE_VERSION && now - row.fetchedAt.getTime() < FILE_DAYS * DAY_MS) continue;
    due.push({ lookup, isin: fund.isin, name: fund.name });
  }
  result.remaining = due.length;
  if (due.length === 0) return result;

  let pages: Map<string, { page: string; ticker: string; name: string }>;
  try {
    pages = await isharesPages();
  } catch (error) {
    return { ...result, problem: `Could not reach the fund manager: ${(error as Error).message}` };
  }

  for (const fund of due.slice(0, FILE_BATCH)) {
    const entry = pages.get(fund.isin);
    if (!entry) {
      // Amundi, HSBC, UBS, Xtrackers and the rest publish their own files in
      // their own shapes. Until one is read, that fund keeps its ten largest.
      result.unsupported++;
      result.remaining--;
      continue;
    }
    try {
      const response = await fetch(isharesHoldingsUrl(entry.page, entry.ticker), {
        headers: ISHARES_UA,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const file = parseIsharesHoldings(await response.text());
      if (!file) throw new Error("the file did not read as a list of holdings");
      const values = {
        isin: fund.isin,
        fundName: entry.name,
        source: "ishares",
        asOf: file.asOf,
        rows: JSON.stringify(file.rows),
        rowCount: file.rows.length,
        version: FILE_VERSION,
        fetchedAt: new Date(),
      };
      await db
        .insert(fundHoldings)
        .values({ lookup: fund.lookup, ...values })
        .onConflictDoUpdate({ target: fundHoldings.lookup, set: values });
      result.read++;
      result.remaining--;
    } catch (error) {
      result.failed.push({ fund: fund.name, reason: (error as Error).message });
      result.remaining--;
    }
  }

  await db.insert(auditLog).values({
    entityType: "fund_holdings",
    entityId: "batch",
    action: "fund_files_read",
    details: JSON.stringify({ read: result.read, failed: result.failed.length }),
  });
  revalidatePath("/investments/analysis");
  return result;
}

// ------------------------------------------- how the companies have moved

/** A company's prices are re-read after this long. */
const MOVE_DAYS = 1;
/**
 * Companies per press. One request each — five years of weekly closes, about
 * 30 KB — so this is where the waiting is, and the button says what is left.
 */
const MOVE_BATCH = 80;
/**
 * How many companies are worth reading prices for, largest holding first.
 *
 * A world small-cap fund reaches 2 832 companies, most of them a couple of
 * cents of the portfolio. Reading all of them is an hour of requests for rows
 * whose percentage changes nothing, so the tail is left unread — and shown as
 * unread, with a dash, rather than as having stood still.
 */
const MOVE_LIMIT = 500;

export interface MoveRefresh {
  read: number;
  /** Listings the source answered nothing for. */
  unanswered: string[];
  problem: string | null;
  remaining: number;
}

/**
 * Reads how each company held has moved over the last year.
 *
 * **This is the company's move, not your return.** You bought a fund, not the
 * shares inside it, and the fund has been buying and selling them all year, so
 * what its slice of NVIDIA cost you is not knowable. What is knowable is what
 * NVIDIA itself has done, and that is what this reads — the screen labels it
 * so the two are never read as one.
 *
 * Only listings leave the machine: the source is asked about shares, never
 * about holdings.
 */
export async function refreshCompanyMoves(): Promise<MoveRefresh> {
  await requireSession();
  const view = await getExposure(0);
  const wanted = view.inside.companies
    .filter((c) => c.symbol !== null && c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, MOVE_LIMIT);

  const saved = await db.select({ symbol: companyMoves.symbol, fetchedAt: companyMoves.fetchedAt }).from(companyMoves);
  const savedBy = new Map(saved.map((r) => [r.symbol, r]));
  const now = Date.now();
  const due: string[] = [];
  for (const c of wanted) {
    const symbol = c.symbol!;
    if (due.includes(symbol)) continue;
    const row = savedBy.get(symbol);
    if (row && now - row.fetchedAt.getTime() < MOVE_DAYS * DAY_MS) continue;
    due.push(symbol);
  }

  const result: MoveRefresh = { read: 0, unanswered: [], problem: null, remaining: due.length };
  if (due.length === 0) return result;

  const session = await yahooSession();
  if (!session) return { ...result, problem: "Could not reach the data source (Yahoo). Try again later." };

  for (const symbol of due.slice(0, MOVE_BATCH)) {
    try {
      let series = null;
      // The symbol the fund data gave, then the spellings the same source
      // uses for its own quotes — see `listingAlternatives`.
      for (const candidate of [symbol, ...listingAlternatives(symbol)]) {
        const url =
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(candidate)}` +
          `?range=5y&interval=1wk&crumb=${encodeURIComponent(session.crumb)}`;
        const response = await fetch(url, { headers: { ...HEADERS, Cookie: session.cookie }, cache: "no-store" });
        // A listing the source does not know answers 404. That is an answer,
        // not a failure: the next spelling is tried, then it is recorded as
        // unanswered and the rest carry on.
        if (!response.ok && response.status !== 404) throw new Error(`Yahoo answered ${response.status}.`);
        series = response.ok ? parsePriceSeries(await response.json()) : null;
        if (series) break;
      }
      if (!series) {
        result.unanswered.push(symbol);
        result.remaining--;
        continue;
      }
      const values = {
        name: null,
        changes: JSON.stringify(priceChanges(series)),
        // The closes themselves, so a window added later needs no re-reading.
        series: JSON.stringify(series.points.map((p) => [p.time, Math.round(p.close * 10000) / 10000])),
        currency: series.currency,
        fetchedAt: new Date(),
      };
      await db
        .insert(companyMoves)
        .values({ symbol, ...values })
        .onConflictDoUpdate({ target: companyMoves.symbol, set: values });
      result.read++;
      result.remaining--;
    } catch (error) {
      result.problem = `Stopped after ${result.read}: ${(error as Error).message}`;
      break;
    }
  }

  await db.insert(auditLog).values({
    entityType: "company_moves",
    entityId: "batch",
    action: "company_moves_read",
    details: JSON.stringify({ read: result.read, unanswered: result.unanswered.length }),
  });
  revalidatePath("/investments/analysis");
  return result;
}

/**
 * Reads what each company inside your funds is: its sector, its industry and
 * where it is based.
 *
 * A fund's own file states all three for every position. The price source's
 * ten largest state none of them, so the companies known only that way sat in
 * the table as "Unclassified, Unclassified" — Samsung, TSMC, Tencent, Siemens.
 * This asks about those listings one at a time, and saves the answers under
 * the same key as any other listing's profile.
 *
 * Only listings leave the machine.
 */
export async function refreshCompanyDetails(): Promise<MoveRefresh> {
  await requireSession();
  const view = await getExposure(0);
  const due = [
    ...new Set(
      view.inside.companies
        .filter((c) => c.symbol !== null && c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, MOVE_LIMIT)
        .filter((c) => !c.sector || !c.country || !c.industry)
        .map((c) => c.symbol!)
    ),
  ];

  const result: MoveRefresh = { read: 0, unanswered: [], problem: null, remaining: due.length };
  if (due.length === 0) return result;

  const session = await yahooSession();
  if (!session) return { ...result, problem: "Could not reach the data source (Yahoo). Try again later." };

  for (const symbol of due.slice(0, BATCH)) {
    try {
      let profile: AssetProfile | null = null;
      for (const candidate of [symbol, ...listingAlternatives(symbol)]) {
        profile = await readProfile(candidate, session);
        if (profile && (profile.sector || profile.country || profile.industry)) break;
      }
      // A listing that answers with neither a sector nor a country has told us
      // what it knows; it is recorded as unanswered rather than asked again on
      // the next press.
      if (!profile || (!profile.sector && !profile.country && !profile.industry)) {
        result.unanswered.push(symbol);
        result.remaining--;
        continue;
      }
      const values = {
        symbol: profile.symbol,
        name: profile.name ?? null,
        quoteType: profile.quoteType,
        sector: profile.sector,
        industry: profile.industry ?? null,
        country: profile.country,
        version: PROFILE_VERSION,
        fetchedAt: new Date(),
      };
      await db
        .insert(assetProfiles)
        .values({ lookup: symbol, ...values })
        .onConflictDoUpdate({ target: assetProfiles.lookup, set: values });
      result.read++;
      result.remaining--;
    } catch (error) {
      result.problem = `Stopped after ${result.read}: ${(error as Error).message}`;
      break;
    }
  }

  await db.insert(auditLog).values({
    entityType: "asset_profile",
    entityId: "companies",
    action: "company_details_read",
    details: JSON.stringify({ read: result.read, unanswered: result.unanswered.length }),
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

/**
 * Announced dividend dates of the stocks held, keyed by the position's own
 * symbol (the ticker a dividend is recorded under). From saved profiles only.
 */
export async function getAnnouncedDividends(): Promise<Map<string, Announced>> {
  const { lookups } = await equityLookups();
  const keys = [...new Set(lookups.map((l) => l.lookup).filter((k): k is string => k !== null))];
  const rows = keys.length === 0 ? [] : await db.select().from(assetProfiles).where(inArray(assetProfiles.lookup, keys));
  const byLookup = new Map(rows.map((r) => [r.lookup, r]));
  const out = new Map<string, Announced>();
  for (const l of lookups) {
    const row = l.lookup ? byLookup.get(l.lookup) : undefined;
    if (row && (row.exDividendDate || row.dividendDate)) {
      out.set(l.item.symbol, { exDividendDate: row.exDividendDate, dividendDate: row.dividendDate });
    }
  }
  return out;
}

/** The symbols of everything held now, for telling a current payer from a sold one. */
export async function heldSymbols(): Promise<Set<string>> {
  const { items } = await getPortfolioItems();
  return new Set(items.filter((i) => i.value > 0).map((i) => i.symbol));
}
