/**
 * Prints the SHAPE of your real Bybit responses, with every amount replaced by
 * a placeholder. Run it, paste the output, and the parser can be checked
 * against reality rather than against the documentation.
 *
 *   node scripts/probe-bybit.mjs YOUR_API_KEY YOUR_API_SECRET [eu|global]
 *
 * Region defaults to eu (api.bybit.eu). Bybit split under MiCA and a key from
 * one entity is rejected by the other, so if you get an auth error try the
 * other one.
 *
 * Read-only: it calls only the wallet-balance and position-list endpoints.
 * Nothing is written anywhere, and your key and secret never leave your machine
 * — they are used to sign the request and are not printed.
 */

import { createHmac } from "crypto";

const [apiKey, apiSecret, region = "eu"] = process.argv.slice(2);

if (!apiKey || !apiSecret) {
  console.error("Usage: node scripts/probe-bybit.mjs YOUR_API_KEY YOUR_API_SECRET [eu|global]");
  process.exit(1);
}

const BASE = region === "global" ? "https://api.bybit.com" : "https://api.bybit.eu";
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

// Your public IP, which is what Bybit compares against a key's bound list.
// Printed first because an IP mismatch is the usual reason this fails.
let publicIp = "(could not determine)";
try {
  const r = await fetch("https://api.ipify.org?format=json");
  publicIp = (await r.json()).ip;
} catch {
  // Offline or blocked — not fatal, the calls below still tell us what matters.
}
console.log(`Your public IP right now: ${publicIp}`);
console.log("If the key has an IP allowlist, that address has to be on it.\n");

const [wallet, linearUsdt, inverse] = await Promise.all([
  call("/v5/account/wallet-balance", { accountType: "UNIFIED" }),
  call("/v5/position/list", { category: "linear", settleCoin: "USDT", limit: "200" }),
  call("/v5/position/list", { category: "inverse", limit: "200" }),
]);

console.log(`=== host: ${BASE} ===`);
if (wallet?.retCode === 10010) {
  console.log(
    "\n>>> Error 10010: the key's IP restriction rejected this machine.\n" +
      `>>> Add ${publicIp} to the key's allowed IPs, or use a key with no IP binding.\n` +
      ">>> A key created through 'Connect to Third-Party Applications' is bound to\n" +
      ">>> that application's servers and can never work from here.\n"
  );
}
console.log("=== wallet-balance ===");
console.log(JSON.stringify(redact(wallet), null, 2));
console.log("\n=== positions (linear/USDT) ===");
console.log(JSON.stringify(redact(linearUsdt), null, 2));
console.log("\n=== positions (inverse) ===");
console.log(JSON.stringify(redact(inverse), null, 2));
