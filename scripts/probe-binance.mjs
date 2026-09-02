/**
 * Prints the SHAPE of your real Binance account response, with every amount
 * replaced by a placeholder. Run it, paste the output, and the parser can be
 * checked against reality rather than against the documentation.
 *
 *   node scripts/probe-binance.mjs YOUR_API_KEY YOUR_API_SECRET
 *
 * The key needs **Enable Reading** and nothing else.
 *
 * Read-only: it calls /api/v3/account and nothing else. Your key and secret
 * never leave your machine — they sign the request and are never printed.
 *
 * Two things in the output matter more than the shape:
 *
 *  - the count of non-zero balances, against what Binance's own Wallet shows
 *  - the reminder about the other wallets, which this connector does not read
 */

import { createHmac } from "crypto";

const [apiKey, apiSecret] = process.argv.slice(2);

if (!apiKey || !apiSecret) {
  console.error("Usage: node scripts/probe-binance.mjs YOUR_API_KEY YOUR_API_SECRET");
  process.exit(1);
}

const BASE = "https://api.binance.com";
/** Fields src/lib/connectors/binance/parse.ts actually reads. */
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
    headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);

  console.log(`=== /api/v3/account — HTTP ${res.status} ===`);

  if (typeof payload?.code === "number" && payload.code < 0) {
    console.log("Binance said:", payload.msg, `(code ${payload.code})`);
    console.log("(-2015 means one of three things: the key, your IP, or the permission.)");
    return;
  }

  const balances = Array.isArray(payload?.balances) ? payload.balances : [];
  const held = balances.filter((b) => Number(b.free) + Number(b.locked) > 0);

  console.log("shape of one balance row:", JSON.stringify(redact(held[0] ?? balances[0]), null, 2));
  console.log(`rows returned: ${balances.length}`);
  console.log(`non-zero holdings: ${held.length}`);
  console.log("assets held:", held.map((b) => b.asset).join(", ") || "(none)");

  /**
   * The account object carries more than balances — permissions and account
   * type say whether the key can do what it needs to, and whether the app is
   * looking at the wallet the user thinks it is.
   */
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

  console.log(
    "\nThis is the SPOT wallet only. If Binance's own total is higher, the difference " +
      "is almost certainly Funding, Simple Earn or Futures — separate wallets this " +
      "connector does not read, and says so on the connection screen."
  );
}

main().catch((e) => {
  console.error("Could not reach Binance:", e.message);
  process.exit(1);
});
