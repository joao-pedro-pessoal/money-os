/**
 * The listing to ask a price source about, for a company inside a fund.
 *
 * A fund's file names the company, its ticker and the exchange it trades on —
 * "7203" on the "Tokyo Stock Exchange", "HEBA B" on "Nasdaq Omx Nordic". A
 * price source wants one string: "7203.T", "HEBA-B.ST". This is that
 * translation, and nothing else: no prices, no fetching.
 *
 * **An exchange this does not know produces null, and the company shows no
 * change at all.** The alternative is asking for a symbol that belongs to a
 * different company on a different market, and a wrong price is far worse than
 * a missing one — the whole reason `quotes/` refuses an unlabelled price.
 *
 * Pure.
 */

/** Exchange name in the fund's file → the suffix the price source wants. */
const SUFFIX: Record<string, string> = {
  // The United States, where the ticker stands alone.
  "new york stock exchange inc.": "",
  "new york stock exchange": "",
  nasdaq: "",
  "nyse mkt llc": "",
  "nyse arca": "",
  "cboe bzx": "",
  "cboe bzx formerly bats": "",
  // Europe
  xetra: ".DE",
  "deutsche börse ag": ".DE",
  "deutsche boerse ag": ".DE",
  "boerse stuttgart": ".SG",
  "london stock exchange": ".L",
  "nyse euronext - euronext paris": ".PA",
  "euronext paris": ".PA",
  "euronext amsterdam": ".AS",
  "nyse euronext - euronext amsterdam": ".AS",
  "nyse euronext - euronext brussels": ".BR",
  "euronext brussels": ".BR",
  "nyse euronext - euronext lisbon": ".LS",
  "euronext lisbon": ".LS",
  "irish stock exchange - all market": ".IR",
  "euronext dublin": ".IR",
  "six swiss exchange": ".SW",
  "borsa italiana": ".MI",
  "bolsa de madrid": ".MC",
  "oslo bors asa": ".OL",
  "omx nordic exchange copenhagen a/s": ".CO",
  "nasdaq omx helsinki ltd.": ".HE",
  "nasdaq omx helsinki": ".HE",
  "wiener boerse ag": ".VI",
  "athens exchange": ".AT",
  "warsaw stock exchange": ".WA",
  // Asia-Pacific
  "tokyo stock exchange": ".T",
  "hong kong exchanges and clearing ltd": ".HK",
  "singapore exchange": ".SI",
  "asx - all markets": ".AX",
  "new zealand exchange ltd": ".NZ",
  "korea exchange (stock market)": ".KS",
  "korea exchange (kosdaq)": ".KQ",
  "taiwan stock exchange": ".TW",
  "national stock exchange of india": ".NS",
  "bombay stock exchange": ".BO",
  "stock exchange of thailand": ".BK",
  "bursa malaysia": ".KL",
  "indonesia stock exchange": ".JK",
  "philippine stock exchange inc.": ".PS",
  // The Americas beyond the United States, and the rest
  "toronto stock exchange": ".TO",
  "tsx venture exchange": ".V",
  "bolsa mexicana de valores": ".MX",
  "bm&fbovespa sa": ".SA",
  "santiago stock exchange": ".SN",
  "tel aviv stock exchange": ".TA",
  "johannesburg stock exchange": ".JO",
  "saudi stock exchange": ".SR",
  "istanbul stock exchange": ".IS",
};

/**
 * Nasdaq's Nordic listings all arrive under one name, and the four markets
 * under it have four suffixes. The company's own country is what separates
 * them, and the file states it.
 */
const NORDIC: Record<string, string> = {
  Sweden: ".ST",
  Denmark: ".CO",
  Finland: ".HE",
  Iceland: ".IC",
};

const NORDIC_NAMES = new Set(["nasdaq omx nordic", "nasdaq omx stockholm", "omx nordic exchange"]);

/**
 * The price source's symbol for a company, or null when this cannot say.
 *
 * Two shapes need fixing beyond the suffix, both confirmed against real
 * files: a share class is written with a space ("HEBA B", "BRK B") where the
 * source writes a dash, and Hong Kong codes are padded to four digits ("700"
 * is asked for as "0700.HK").
 */
export function yahooListing(input: {
  ticker: string | null;
  exchange: string | null;
  country: string | null;
}): string | null {
  const ticker = (input.ticker ?? "").trim().toUpperCase();
  const exchange = (input.exchange ?? "").trim().toLowerCase();
  if (ticker === "" || exchange === "") return null;
  // A holding with no market has no listing to ask about: unlisted stakes,
  // and the placeholder rows a fund uses for cash.
  if (exchange.startsWith("no market")) return null;

  const suffix = NORDIC_NAMES.has(exchange) ? NORDIC[input.country ?? ""] : SUFFIX[exchange];
  if (suffix === undefined) return null;

  let symbol = ticker.replace(/\s+/g, "-");
  if (suffix === ".HK" && /^\d+$/.test(symbol)) symbol = symbol.padStart(4, "0");
  return `${symbol}${suffix}`;
}

/**
 * Other spellings of a listing worth trying when the source answers nothing
 * for the one it gave you.
 *
 * The price source's own fund-holdings data is where these come from, and it
 * is not always self-consistent: it names Samsung "005930.KQ" — the KOSDAQ
 * suffix on a company listed on the main Korean market — China Construction
 * Bank "00939" with no market at all, and CGI "GIB.A.TO" where its own quotes
 * are under "GIB-A.TO". Each rule below is one of those, seen in this
 * portfolio, and each is a *candidate*: nothing is stored unless the source
 * answers for it.
 */
export function listingAlternatives(symbol: string): string[] {
  const clean = symbol.trim().toUpperCase();
  if (clean === "") return [];
  const out: string[] = [];

  // The two Korean markets, either way round.
  if (clean.endsWith(".KQ")) out.push(`${clean.slice(0, -3)}.KS`);
  if (clean.endsWith(".KS")) out.push(`${clean.slice(0, -3)}.KQ`);

  if (/^\d+$/.test(clean)) {
    // A six-digit code with no market is Korean; four or five is Hong Kong,
    // where the code is padded to four.
    if (clean.length === 6) out.push(`${clean}.KS`, `${clean}.KQ`);
    else if (clean.length <= 5) out.push(`${String(Number(clean)).padStart(4, "0")}.HK`);
  }

  // A doubled dot, which the fund data writes for a ticker that ends in one:
  // Rolls-Royce arrives as "RR..L" and is quoted as "RR.L".
  if (clean.includes("..")) out.push(clean.replace(/\.{2,}/g, "."));

  // A share class written with a dot: "GIB.A.TO" is asked for as "GIB-A.TO".
  const classShare = /^([A-Z0-9]+)\.([A-Z])(\.[A-Z]{1,3})$/.exec(clean);
  if (classShare) out.push(`${classShare[1]}-${classShare[2]}${classShare[3]}`);

  return [...new Set(out)].filter((s) => s !== clean);
}
