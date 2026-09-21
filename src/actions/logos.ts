"use server";

import { db } from "@/db/client";
import { assetLogos, auditLog, holdings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasSession } from "./session";
import {
  coinIconUrl,
  COIN_ICON_SOURCE,
  holdingLogoSymbol,
  isCoin,
  isinLogoUrl,
  logoDataUri,
  logoUrl,
  LOGO_SOURCE,
} from "@/lib/logos";
import { listingAlternatives } from "@/lib/funds/listing";
import { isinOfHolding } from "@/lib/portfolio/isin";
import { getPortfolioItems } from "./dashboard";
import { getExposure } from "./exposure";

/**
 * The marks drawn beside the things you hold and the companies inside your
 * funds.
 *
 * Decoration, and the only outside read in this app that is: no figure on any
 * screen changes whether this has ever been run. That is also why it is a
 * button and not part of a sync — a picture is never worth making you wait for
 * a number.
 *
 * **Only listings leave the machine.** The service is asked "what does NVDA
 * look like", once per listing, and the answer is stored here; opening a page
 * asks nobody anything. A service that saw every page view would learn the
 * whole portfolio from the logos alone.
 */

async function requireSession() {
  if (!(await hasSession())) {
    throw new Error("Your session has expired. Sign in again.");
  }
}

const DAY_MS = 86_400_000;
/** A mark is asked for again after this long. Logos change once a decade. */
const FRESH_DAYS = 180;
/** A listing the source had no mark for is tried again after this long. */
const RETRY_DAYS = 30;
/** Marks per press. Each is a few kilobytes, so this is quick. */
const BATCH = 60;
/**
 * How many companies get a mark.
 *
 * The whole table's worth of images travels inside the page — they are stored
 * here, not linked to — so this is the one place where a picture costs
 * something. The largest 250 companies are the ones anybody looks at; past
 * them the rows are hundredths of a percent and a letter does just as well.
 *
 * Not exported: a `"use server"` module may only export async functions.
 */
const LOGO_LIMIT = 250;

const HEADERS = { Accept: "image/*", "User-Agent": "Mozilla/5.0" };

export interface LogoRefresh {
  read: number;
  /** Listings the source has no mark for. */
  unanswered: string[];
  problem: string | null;
  remaining: number;
}

/**
 * Asks for the marks not stored yet, largest holding first.
 *
 * A listing that answers nothing is written down as answering nothing, so the
 * next press moves on to the next listing instead of asking the same hopeless
 * question again.
 */
export async function refreshLogos(): Promise<LogoRefresh> {
  await requireSession();
  const wanted = await wantedLogos();

  const rows =
    wanted.length === 0
      ? []
      : await db
          .select({ symbol: assetLogos.symbol, image: assetLogos.image, fetchedAt: assetLogos.fetchedAt })
          .from(assetLogos)
          .where(inArray(assetLogos.symbol, wanted.map((w) => w.symbol)));
  const saved = new Map(rows.map((r) => [r.symbol, r]));
  const now = Date.now();
  const due = wanted.filter((w) => {
    const row = saved.get(w.symbol);
    if (!row) return true;
    return now - row.fetchedAt.getTime() > (row.image ? FRESH_DAYS : RETRY_DAYS) * DAY_MS;
  });

  const result: LogoRefresh = { read: 0, unanswered: [], problem: null, remaining: due.length };
  if (due.length === 0) return result;

  for (const item of due.slice(0, BATCH)) {
    try {
      const found = await readLogo(candidatesFor(item));
      const image = found?.image ?? null;
      const values = {
        image,
        bytes: image === null ? null : image.length,
        source: found?.source ?? null,
        fetchedAt: new Date(),
      };
      await db
        .insert(assetLogos)
        .values({ symbol: item.symbol, ...values })
        .onConflictDoUpdate({ target: assetLogos.symbol, set: values });
      result.remaining--;
      if (image === null) result.unanswered.push(item.symbol);
      else result.read++;
    } catch (error) {
      // A refusal part-way stops the batch; what was read is kept.
      result.problem = `Stopped at ${item.symbol}: ${(error as Error).message}`;
      break;
    }
  }

  // What is held in memory is now out of date, and this is the only place that
  // can make it so.
  cached = null;

  await db.insert(auditLog).values({
    entityType: "asset_logo",
    entityId: "batch",
    action: "logos_read",
    details: JSON.stringify({ read: result.read, unanswered: result.unanswered.length }),
  });
  revalidatePath("/investments");
  revalidatePath("/investments/analysis");
  return result;
}

/** Marks read per automatic top-up. A handful: this runs beside a price refresh. */
const TOP_UP = 10;

/**
 * Reads the marks of things you hold that have none yet, a few at a time.
 *
 * This is the half of the button that can be automatic. Buying a fund is the
 * moment a mark is missing, and pressing a button to fetch a picture for
 * something you just added is a chore nobody should be given; the companies
 * *inside* the funds stay behind the button, because there are 250 of them and
 * they only change when a fund does.
 *
 * **Never throws.** It runs on the back of the automatic price refresh, and a
 * logo service being unreachable must not stop prices arriving — one of the
 * two is money and the other is decoration.
 */
export async function topUpLogos(): Promise<void> {
  try {
    const { items } = await getPortfolioItems();
    const wanted = new Map<string, Wanted>();
    for (const i of items) {
      const symbol = holdingLogoSymbol(i);
      if (symbol && !wanted.has(symbol)) wanted.set(symbol, { symbol, isin: null, coin: isCoin(i.assetType) });
    }
    if (wanted.size === 0) return;

    // Only what has never been asked about. A listing the source answered
    // nothing for is left to the button's own retry clock, so a portfolio
    // holding one of those does not ask again every five minutes forever.
    const stored = await allLogos();
    const due = [...wanted.values()].filter((w) => !stored.has(w.symbol)).slice(0, TOP_UP);
    if (due.length === 0) return;

    for (const item of due) {
      const found = await readLogo(candidatesFor(item));
      const image = found?.image ?? null;
      const values = { image, bytes: image === null ? null : image.length, source: found?.source ?? null, fetchedAt: new Date() };
      await db
        .insert(assetLogos)
        .values({ symbol: item.symbol, ...values })
        .onConflictDoUpdate({ target: assetLogos.symbol, set: values });
    }
    cached = null;
  } catch {
    // Decoration. What could not be read is read on the next refresh, or by
    // the button, and nothing on any screen is missing a figure meanwhile.
  }
}

/**
 * Everywhere worth asking about one thing, in the order to ask.
 *
 * Each step is a spelling the source has been seen to want, never a guess at a
 * different company:
 *
 * - the listing itself;
 * - the spellings the price source's own fund data disagrees with it on —
 *   Samsung arrives as "005930.KQ" and is published under "005930.KS" (see
 *   `listingAlternatives`, which exists for exactly this);
 * - the ISIN, where the holding carries one: a European fund is known by its
 *   ISIN far more often than by the ticker of one of the six exchanges it
 *   trades on;
 * - and for a coin, and only for a coin, its own website's icon.
 */
function candidatesFor(item: { symbol: string; isin: string | null; coin: boolean }): { url: string; source: string }[] {
  const listings = [item.symbol, ...listingAlternatives(item.symbol)].map(logoUrl);
  const urls: [string | null, string][] = [
    ...listings.map((url) => [url, LOGO_SOURCE] as [string | null, string]),
    [isinLogoUrl(item.isin), LOGO_SOURCE],
    [item.coin ? coinIconUrl(item.symbol) : null, COIN_ICON_SOURCE],
  ];
  return urls.filter((u): u is [string, string] => u[0] !== null).map(([url, source]) => ({ url, source }));
}

/**
 * The first of these addresses that answers with an image, or null when none
 * does.
 *
 * 404 is an answer: this listing has no mark. Anything else is a failure and
 * stops the batch, because a service that has started refusing will refuse the
 * next fifty too, and writing "no mark" fifty times would take a month to undo.
 */
async function readLogo(candidates: { url: string; source: string }[]): Promise<{ image: string; source: string } | null> {
  for (const { url, source } of candidates) {
    const response = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`The logo service answered ${response.status}.`);
    const image = logoDataUri(response.headers.get("content-type"), new Uint8Array(await response.arrayBuffer()));
    if (image) return { image, source };
  }
  return null;
}

interface Wanted {
  symbol: string;
  /** The ISIN the holding carries, where it carries one. */
  isin: string | null;
  /** Whether the symbol names a coin, which decides whether its site may be asked. */
  coin: boolean;
}

/** Everything a mark is wanted for: what you hold, then the largest companies inside it. */
async function wantedLogos(): Promise<Wanted[]> {
  const [{ items }, view, holdingRows] = await Promise.all([
    getPortfolioItems(),
    getExposure(LOGO_LIMIT),
    db.select({ id: holdings.id, symbol: holdings.symbol, name: holdings.name }).from(holdings),
  ]);
  const isinOf = new Map(holdingRows.map((h) => [`h:${h.id}`, isinOfHolding(h)]));

  const out = new Map<string, Wanted>();
  for (const i of items) {
    const symbol = holdingLogoSymbol(i);
    if (symbol && !out.has(symbol)) {
      out.set(symbol, { symbol, isin: isinOf.get(i.id) ?? null, coin: isCoin(i.assetType) });
    }
  }
  // Already largest first — see `lookThrough` — and already cut to the limit.
  // A company inside a fund is a company: never a coin, so never asked for by
  // website.
  for (const c of view.inside.companies) {
    if (c.symbol && c.total > 0 && !out.has(c.symbol)) out.set(c.symbol, { symbol: c.symbol, isin: null, coin: false });
  }
  return [...out.values()];
}

export interface StoredLogos {
  /** The marks stored, by the listing they were asked for under. */
  images: Record<string, string>;
  /** Listings among those asked about that have never been looked for. */
  due: number;
}

/**
 * Every mark, held in memory between renders.
 *
 * A megabyte of images that change when a button is pressed and at no other
 * time. Reading the ones a page needs out of the database cost a third of a
 * second on every single render of the analysis page, which is a third of a
 * second spent on decoration. The only thing that writes them is `refreshLogos`
 * below, in this same module, and it empties this — which is what makes a cache
 * safe here and would make one dangerous for anything that changes on its own.
 *
 * A map entry with null means "asked, and there is no mark"; a missing entry
 * means nobody has asked. The screens need that difference to tell a button
 * that has work left from one that has not.
 */
let cached: Map<string, string | null> | null = null;

async function allLogos(): Promise<Map<string, string | null>> {
  if (!cached) {
    const rows = await db.select({ symbol: assetLogos.symbol, image: assetLogos.image }).from(assetLogos);
    cached = new Map(rows.map((r) => [r.symbol, r.image]));
  }
  return cached;
}

/**
 * The marks already stored for these listings. Reads nothing from the internet.
 *
 * Past `LOGO_LIMIT` nothing is stored, and nothing is reported as due either:
 * the 2 600th company was never going to be asked about, so counting it as
 * missing would leave a button that can never reach zero.
 */
export async function logosFor(symbols: (string | null)[]): Promise<StoredLogos> {
  const wanted = [...new Set(symbols.filter((s): s is string => Boolean(s)))].slice(0, LOGO_LIMIT);
  if (wanted.length === 0) return { images: {}, due: 0 };
  const all = await allLogos();
  const images: Record<string, string> = {};
  let due = 0;
  for (const symbol of wanted) {
    const image = all.get(symbol);
    if (image) images[symbol] = image;
    else if (image === undefined) due++;
  }
  return { images, due };
}
