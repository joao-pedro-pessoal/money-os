/**
 * Prints the SHAPE of your real Bybit responses, with every amount replaced by
 * a placeholder. Run it, paste the output, and the parser can be checked
 * against reality rather than against the documentation.
 *
 *   node scripts/probe-bybit.mjs YOUR_API_KEY YOUR_API_SECRET
 *
 * Read-only: it calls only the wallet-balance and position-list endpoints.
 * Nothing is written anywhere, and your key and secret never leave your machine
 * — they are used to sign the request and are not printed.
 */

import { createHmac } from "crypto";

const [apiKey, apiSecret] = process.argv.slice(2);

if (!apiKey || !apiSecret) {
  console.error("Usage: node scripts/probe-bybit.mjs YOUR_API_KEY YOUR_API_SECRET");
  process.exit(1);
}

const BASE = "https://api.bybit.com";
const RECV = 5000;

async function call(path, params) {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const ts = Date.now();
  const sign = createHmac("sha256", apiSecret).update(`${ts}${apiKey}${RECV}${query}`).digest("hex");

  const res = await fetch(`${BASE}${path}${query ? `?${query}` : ""}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": String(ts),
      "X-BAPI-RECV-WINDOW": String(RECV),
      "X-BAPI-SIGN": sign,
    },
  });
  return res.json();
}

/**
 * Replaces anything that looks like money with a placeholder, keeping the
 * structure and the field names, which is all that matters for the parser.
 */
function redact(value, key = "") {
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  }
  // Keep coin names, sides, statuses and flags — they drive the parsing.
  const keep = ["coin", "symbol", "side", "accountType", "positionStatus", "retMsg", "category"];
  if (keep.includes(key) || typeof value === "boolean" || value === null) return value;
  if (key === "retCode") return value;
  if (typeof value === "string") return value === "" ? "" : "<number>";
  if (typeof value === "number") return 0;
  return value;
}

const [wallet, linearUsdt, inverse] = await Promise.all([
  call("/v5/account/wallet-balance", { accountType: "UNIFIED" }),
  call("/v5/position/list", { category: "linear", settleCoin: "USDT", limit: "200" }),
  call("/v5/position/list", { category: "inverse", limit: "200" }),
]);

console.log("=== wallet-balance ===");
console.log(JSON.stringify(redact(wallet), null, 2));
console.log("\n=== positions (linear/USDT) ===");
console.log(JSON.stringify(redact(linearUsdt), null, 2));
console.log("\n=== positions (inverse) ===");
console.log(JSON.stringify(redact(inverse), null, 2));
