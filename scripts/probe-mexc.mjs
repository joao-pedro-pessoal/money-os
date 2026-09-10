/**
 * Prints the SHAPE of your real MEXC account response, with every amount
 * replaced by a placeholder. Run it, paste the output, and the parser can be
 * checked against reality rather than against the documentation.
 *
 *   node scripts/probe-mexc.mjs YOUR_API_KEY YOUR_API_SECRET
 *
 * The key needs the **read** permission and nothing else.
 *
 * Read-only: it calls /api/v3/account and nothing else. Your key and secret
 * never leave your machine — they sign the request and are never printed.
 *
 * Three things in the output matter more than the shape:
 *
 *  - whether an error really does arrive with a POSITIVE code, which is the one
 *    assumption this connector makes that Binance's does not
 *  - the count of non-zero balances, against what MEXC's own Wallet shows
 *  - the reminder about Futures and the earn products, which are not read here
 */

import { createHmac } from "crypto";

const [apiKey, apiSecret] = process.argv.slice(2);

if (!apiKey || !apiSecret) {
  console.error("Usage: node scripts/probe-mexc.mjs YOUR_API_KEY YOUR_API_SECRET");
  process.exit(1);
}

const BASE = "https://api.mexc.com";
/** Fields src/lib/connectors/mexc/parse.ts actually reads. */
const READ_BY_PARSER = ["asset", "free", "locked"];

function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return "<number>";
  if (typeof value === "string") return /^-?[\d.,]+(e-?\d+)?$/i.test(value.trim()) ? "<amount>" : value;
  if (Array.isArray(value)) return value.slice(0, 3).map(redact);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

async function main() {
  const query = `recvWindow=5000&timestamp=${Date.now()}`;
  const signature = createHmac("sha256", apiSecret).update(query).digest("hex");

  const res = await fetch(`${BASE}/api/v3/account?${query}&signature=${signature}`, {
    headers: { "X-MEXC-APIKEY": apiKey, Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);

  console.log(`=== /api/v3/account — HTTP ${res.status} ===`);

  /**
   * Deliberately printed for a success too. The connector treats *any* numeric
   * `code` with a `msg` as a failure unless it is 0 or 200, and if a successful
   * MEXC reply carries some other code this is where that shows up — before it
   * turns into a sync that refuses to work for no visible reason.
   */
  if (typeof payload?.code === "number") {
    console.log(`code present: ${payload.code} (msg: ${payload.msg ?? "none"})`);
    console.log(
      payload.code === 0 || payload.code === 200
        ? "-> treated as SUCCESS by src/lib/connectors/mexc/parse.ts"
        : "-> treated as an ERROR by src/lib/connectors/mexc/parse.ts"
    );
    if (payload.code > 0 && payload.code !== 200) {
      console.log(
        "\nConfirms the assumption this connector rests on: MEXC errors are positive, " +
          "where Binance's are negative. 700002 is a bad signature — usually the IP " +
          "binding on the key, not the key itself. 10072 is a bad key."
      );
      return;
    }
  } else {
    console.log("code present: (none) — the ordinary success shape");
  }

  const balances = Array.isArray(payload?.balances) ? payload.balances : [];
  const held = balances.filter((b) => Number(b.free) + Number(b.locked) > 0);

  console.log("shape of one balance row:", JSON.stringify(redact(held[0] ?? balances[0]), null, 2));
  console.log(`rows returned: ${balances.length}`);
  console.log(`non-zero holdings: ${held.length}`);
  console.log("assets held:", held.map((b) => b.asset).join(", ") || "(none)");

  const topLevel = Object.keys(payload ?? {}).filter((k) => k !== "balances");
  console.log("other top-level fields:", topLevel.join(", "));
  if (payload?.accountType) console.log("accountType:", payload.accountType);
  if (payload?.permissions) console.log("permissions:", JSON.stringify(payload.permissions));

  const rowKeys = new Set(balances.flatMap((b) => Object.keys(b)));
  const missed = [...rowKeys].filter((k) => !READ_BY_PARSER.includes(k)).sort();
  console.log(
    missed.length === 0
      ? "fields the parser ignores: (none)"
      : `fields the parser ignores: ${missed.join(", ")}`
  );

  /**
   * Whether every held asset can actually be priced. A holding with no dollar
   * market is reported as unpriced and left out of the total — correct, but
   * worth knowing about before the total looks wrong.
   */
  const tickerRes = await fetch(`${BASE}/api/v3/ticker/price`, {
    headers: { Accept: "application/json" },
  });
  const ticker = await tickerRes.json().catch(() => null);
  if (Array.isArray(ticker)) {
    const prices = new Set(ticker.map((t) => String(t.symbol).toUpperCase()));
    const quotes = ["USDT", "USDC", "FDUSD", "BUSD"];
    const unpriceable = held
      .map((b) => String(b.asset).toUpperCase())
      .filter((a) => !quotes.includes(a) && !quotes.some((q) => prices.has(`${a}${q}`)));
    console.log(`\nticker symbols: ${ticker.length}`);
    console.log(
      unpriceable.length === 0
        ? "every holding can be priced against a dollar quote"
        : `holdings with NO dollar market (excluded from the total, and marked): ${unpriceable.join(", ")}`
    );
  }

  console.log(
    "\nThis is the SPOT wallet only. If MEXC's own total is higher, the difference " +
      "is almost certainly Futures — a separate API on a separate host — or the " +
      "Savings/Staking products, none of which this connector reads. It says so on " +
      "the connection screen."
  );
}

main().catch((e) => {
  console.error("Could not reach MEXC:", e.message);
  process.exit(1);
});
