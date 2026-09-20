/**
 * The mark drawn beside a company, a fund or a coin.
 *
 * A table of 250 names reads as a wall of text; the same table with each
 * company's own mark beside it is scanned rather than read. That is all this
 * is for — **a logo is decoration, never a measurement.** Nothing here decides
 * what anything is worth, and a row whose logo is missing says everything it
 * said before.
 *
 * The identity is the listing, never the name: "NVDA", "SXR8.DE", "BTC". A
 * name is spelled a dozen ways across a fund's file, a broker's statement and
 * a price source, and matching on it would eventually draw one company's mark
 * beside another company's row — the same failure as a wrong price, and as
 * hard to notice. A listing the source does not know produces nothing, and
 * nothing renders as a letter, which cannot be mistaken for a logo.
 *
 * Pure: the asking and the storing are in `actions/logos.ts`.
 */

import { yahooSymbolFor } from "@/lib/portfolio/exposure";

/**
 * Where the marks come from, stored on every row so a screen can say it.
 *
 * Parqet publishes them keyed by exactly the listings this app already
 * holds — Yahoo's spelling, suffix and all — and by ISIN, which is what the
 * funds here are keyed by. It answers 404 for a listing it has no mark for,
 * which is the answer this needs: a service that returns a generic picture
 * instead would put a globe beside a company and call it its logo.
 */
export const LOGO_SOURCE = "parqet";

const BASE = "https://assets.parqet.com/logos";

/**
 * The second source, for coins alone.
 *
 * The first knows listed companies and funds; it has no mark for HYPE or for
 * USDT, and a table where the largest position is the one without a picture is
 * a table that looks broken. A coin's own website has its mark as the icon in
 * the browser tab, and that is what this reads.
 *
 * **Only where the site is hand-checked, and only for something already known
 * to be a coin.** A guessed domain draws another project's mark and nobody
 * would ever notice; a ticker that happens to spell a coin — a company listed
 * as LINK or ATOM — must never reach it, which is why the caller says whether
 * it is asking about a coin rather than this inferring it from the code.
 */
export const COIN_ICON_SOURCE = "site-icon";

/**
 * The largest mark worth keeping.
 *
 * These are drawn at 18 pixels. Most are 1–4 KB of SVG; a few wordmarks run to
 * 30 KB, and the whole table's worth of them travels inside the page, so there
 * has to be a ceiling. One over it is left out rather than shrunk — nothing
 * here can redraw an image, and a broken one is worse than none.
 */
export const MAX_LOGO_BYTES = 48 * 1024;

/** Image types worth putting in an `<img>`; anything else is not a logo. */
const TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * A listing to ask about, or null where what was handed over is a name.
 *
 * A statement writes a fund's legal name where a listing belongs — "iShares
 * VII plc - iShares Core S&P 500 UCITS ETF USD (Acc)" — and asking a logo
 * service about that is a request that can only fail. A listing has no spaces.
 */
export function listingKey(symbol: string | null | undefined): string | null {
  const clean = (symbol ?? "").trim();
  // A colon is this app's own prefix for a venue's private code — "xyz:GOLD",
  // a perpetual on a commodity. No exchange lists it and no logo service knows
  // it, so it is not worth a request that can only come back empty.
  if (clean === "" || clean.length > 40 || /[\s/:]/.test(clean)) return null;
  return clean;
}

/** Where to ask for a listing's mark, or null when the listing is not one. */
export function logoUrl(symbol: string | null | undefined): string | null {
  const clean = listingKey(symbol);
  return clean === null ? null : `${BASE}/symbol/${encodeURIComponent(clean)}`;
}

/**
 * Where to ask for a fund's mark by its ISIN.
 *
 * The funds here are held under their ISIN more reliably than under a ticker,
 * and one fund's mark is its manager's: every iShares fund answers with the
 * same BlackRock mark, which is correct rather than a collision.
 */
export function isinLogoUrl(isin: string | null | undefined): string | null {
  const clean = (isin ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(clean)) return null;
  return `${BASE}/isin/${clean}`;
}

/** The quote currencies a price source writes after a coin: "BTC-EUR". */
const QUOTE_SUFFIX = /-(EUR|USD|USDT|USDC|GBP|CHF|JPY|BTC)$/;

/**
 * The coin itself, from however the pair is spelled.
 *
 * A holding priced in euros is stored as "BTC-EUR" and an exchange reports the
 * balance as "BTC". They are one coin with one mark, so the pair's quote half
 * comes off before asking.
 */
export function coinCode(symbol: string | null | undefined): string | null {
  const clean = (symbol ?? "").trim().toUpperCase().replace(QUOTE_SUFFIX, "");
  return /^[A-Z0-9]{2,10}$/.test(clean) ? clean : null;
}

/**
 * Each coin's own site, checked one at a time against the project's real
 * homepage — the same arrangement as `quotes/knownListings.ts`, and for the
 * same reason: which site belongs to a coin is a fact to look up once, never
 * something to derive from its code.
 *
 * A coin missing from here simply shows its letter.
 */
const COIN_SITES: Record<string, string> = {
  BTC: "bitcoin.org",
  ETH: "ethereum.org",
  SOL: "solana.com",
  HYPE: "hyperliquid.xyz",
  USDT: "tether.to",
  USDC: "circle.com",
  BNB: "bnbchain.org",
  XRP: "xrpl.org",
  ADA: "cardano.org",
  DOGE: "dogecoin.com",
  LTC: "litecoin.org",
  LINK: "chain.link",
  DOT: "polkadot.network",
  AVAX: "avax.network",
  ARB: "arbitrum.io",
  OP: "optimism.io",
  UNI: "uniswap.org",
  AAVE: "aave.com",
  NEAR: "near.org",
  SUI: "sui.io",
  APT: "aptosfoundation.org",
  TON: "ton.org",
  TRX: "tron.network",
  XMR: "getmonero.org",
  POL: "polygon.technology",
  MATIC: "polygon.technology",
  ATOM: "cosmos.network",
  SYRUP: "maple.finance",
  ENA: "ethena.fi",
  PENDLE: "pendle.finance",
};

/**
 * Where to ask for a coin's own site icon, or null for a coin with no site
 * checked.
 *
 * Call it only for something known to be a coin — see `COIN_ICON_SOURCE`.
 */
export function coinIconUrl(coin: string | null | undefined): string | null {
  const code = coinCode(coin);
  const domain = code === null ? undefined : COIN_SITES[code];
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
}

/** The asset types whose symbol names a coin rather than a listing. */
const COIN_TYPES = new Set(["crypto", "stablecoin", "staking"]);

/** Whether a position's symbol names a coin rather than a listing. */
export function isCoin(assetType: string | null | undefined): boolean {
  return COIN_TYPES.has((assetType ?? "").toLowerCase());
}

/**
 * Which mark a position you hold is drawn with.
 *
 * Two different things wear the `symbol` column here, which is why this is a
 * function and not a field read. A coin arrives as the pair it is priced in
 * ("BTC-EUR") or as the code an exchange reports ("HYPE"); a fund arrives as
 * its legal name, with the listing beside it. The listing is what a logo
 * service can answer, so it is preferred wherever there is one, and a position
 * with neither — a flat, a vintage guitar, a private stake — has no mark to
 * ask for and gets a letter.
 */
export function holdingLogoSymbol(item: {
  assetType?: string | null;
  /** The listing it trades under, where that is not the name. */
  listing?: string | null;
  symbol: string;
}): string | null {
  if (isCoin(item.assetType)) return coinCode(item.listing ?? item.symbol);
  // `yahooSymbolFor` already answers "which listing is this position", and a
  // second answer here would be a second answer: Trading 212 reports its own
  // spelling ("PHAGa_EQ" for PHAG on Amsterdam), and only that function knows
  // how to read it.
  return listingKey(yahooSymbolFor(item.listing, item.symbol));
}

/**
 * A stored mark, ready for an `<img src>`, or null when what came back is not
 * an image this will draw.
 *
 * The bytes are kept here rather than the address they came from: a page that
 * loaded 250 logos from a logo service would tell that service what the reader
 * holds, every time the page was opened. Asked once, stored, and the screen
 * never leaves the machine.
 */
export function logoDataUri(contentType: string | null | undefined, bytes: Uint8Array): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.has(type)) return null;
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
  // Defence in depth. A data URI in an `<img>` cannot run a script or fetch
  // anything — that is why the mark is drawn that way and never inlined into
  // the page — but an SVG carrying either is not a logo, and storing one would
  // make the next reader of this code responsible for remembering why it was
  // safe.
  if (type === "image/svg+xml") {
    const text = Buffer.from(bytes).toString("utf8");
    if (/<script|<foreignObject|\bon[a-z]+\s*=/i.test(text)) return null;
  }
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * The letter drawn where there is no mark.
 *
 * Deliberately a letter and not a picture: it is the name's own first letter,
 * so it states nothing that was not already on the row, and nobody reads it as
 * a company's logo.
 */
export function initial(name: string | null | undefined): string {
  const letter = (name ?? "").trim().match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toUpperCase() : "·";
}
