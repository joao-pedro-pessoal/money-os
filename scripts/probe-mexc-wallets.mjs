/**
 * Finds WHICH MEXC wallet your money is in.
 *
 *   node scripts/probe-mexc-wallets.mjs YOUR_API_KEY YOUR_API_SECRET
 *
 * The connector reads the Spot wallet, and on this account that wallet holds
 * only dust — so the money is somewhere Spot does not cover. MEXC keeps at
 * least four separate pools, each with its own endpoint, and two of them are on
 * a different host with a *different signing scheme*. Nothing can be built
 * against them by guessing at the reply, so this asks each one and prints what
 * came back.
 *
 * Read-only throughout: every call is a GET of a balance or a list. Your key
 * and secret never leave your machine, are never printed, and no amount is
 * printed either — only counts, asset names and which endpoint answered.
 *
 * Paste the whole output. What matters is which section reports holdings, and
 * the exact `code`/`msg` from any that refuses, because those messages are what
 * the connector has to be written against.
 */

import { createHmac } from "crypto";

const [apiKey, apiSecret] = process.argv.slice(2);

if (!apiKey || !apiSecret) {
  console.error("Usage: node scripts/probe-mexc-wallets.mjs YOUR_API_KEY YOUR_API_SECRET");
  process.exit(1);
}

const SPOT = "https://api.mexc.com";
/** Futures live on their own host, with their own auth. */
const CONTRACT = "https://contract.mexc.com";

/** Never prints a quantity — only whether there was one. */
const some = (n) => (Number(n) > 0 ? "yes" : "no");

async function getJson(url, headers) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: null, failed: e.message };
  }
}

/** Spot v3 signing: HMAC-SHA256 over the query string, hex. */
function spotSigned(path, params = {}) {
  const query = Object.entries({ ...params, recvWindow: 5000, timestamp: Date.now() })
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const signature = createHmac("sha256", apiSecret).update(query).digest("hex");
  return {
    url: `${SPOT}${path}?${query}&signature=${signature}`,
    headers: { "X-MEXC-APIKEY": apiKey },
  };
}

/**
 * Futures signing is a different recipe: HMAC-SHA256 over
 * `apiKey + requestTime + paramString`, sent in its own headers rather than in
 * the query. Written from the docs and NOT verified — if it is wrong, the reply
 * below says so, and that reply is the point of running this.
 */
function futuresSigned(path, paramString = "") {
  const requestTime = String(Date.now());
  const signature = createHmac("sha256", apiSecret)
    .update(apiKey + requestTime + paramString)
    .digest("hex");
  return {
    url: `${CONTRACT}${path}${paramString ? `?${paramString}` : ""}`,
    headers: { ApiKey: apiKey, "Request-Time": requestTime, Signature: signature },
  };
}

function report(label, { status, body, failed }) {
  console.log(`\n=== ${label} ===`);
  if (failed) {
    console.log(`  could not reach it: ${failed}`);
    return null;
  }
  console.log(`  HTTP ${status}`);
  if (body && typeof body === "object" && !Array.isArray(body)) {
    if (body.code !== undefined) console.log(`  code: ${JSON.stringify(body.code)}`);
    if (body.msg !== undefined) console.log(`  msg: ${JSON.stringify(body.msg)}`);
    if (body.message !== undefined) console.log(`  message: ${JSON.stringify(body.message)}`);
    if (body.success !== undefined) console.log(`  success: ${JSON.stringify(body.success)}`);
  }
  return body;
}

async function main() {
  console.log("Asking every MEXC wallet where the money is. Read-only, no amounts printed.");

  // ---------------------------------------------------------------- 1. Spot
  const spot = spotSigned("/api/v3/account");
  const spotBody = report("SPOT  /api/v3/account  (what the connector reads today)", await getJson(spot.url, spot.headers));
  if (Array.isArray(spotBody?.balances)) {
    const held = spotBody.balances.filter((b) => Number(b.free) + Number(b.locked) > 0);
    console.log(`  rows: ${spotBody.balances.length}, non-zero: ${held.length}`);
    console.log(`  assets: ${held.map((b) => b.asset).join(", ") || "(none)"}`);
    console.log(`  any meaningful amount (>0.01 of a unit): ${some(
      held.reduce((m, b) => Math.max(m, Number(b.free) + Number(b.locked) > 0.01 ? 1 : 0), 0)
    )}`);
    if (spotBody.permissions) console.log(`  key permissions: ${JSON.stringify(spotBody.permissions)}`);
  }

  // ------------------------------------------------------------- 2. Futures
  const fAssets = futuresSigned("/api/v1/private/account/assets");
  const fBody = report("FUTURES  /api/v1/private/account/assets", await getJson(fAssets.url, fAssets.headers));
  if (Array.isArray(fBody?.data)) {
    const held = fBody.data.filter((a) => Number(a.equity ?? a.availableBalance ?? 0) > 0);
    console.log(`  currencies returned: ${fBody.data.length}, with a balance: ${held.length}`);
    console.log(`  currencies: ${held.map((a) => a.currency).join(", ") || "(none)"}`);
    console.log(`  fields per row: ${Object.keys(fBody.data[0] ?? {}).join(", ")}`);
  }

  const fPos = futuresSigned("/api/v1/private/position/open_positions");
  const fPosBody = report("FUTURES  /api/v1/private/position/open_positions", await getJson(fPos.url, fPos.headers));
  if (Array.isArray(fPosBody?.data)) {
    console.log(`  open positions: ${fPosBody.data.length}`);
    console.log(`  symbols: ${fPosBody.data.map((p) => p.symbol).join(", ") || "(none)"}`);
    console.log(`  fields per row: ${Object.keys(fPosBody.data[0] ?? {}).join(", ")}`);
  }

  // --------------------------------------------------------- 3. Sub-accounts
  /**
   * A key on the main account cannot see a sub-account's balance. If the money
   * is in one, everything above is correct and still reports nothing.
   */
  const sub = spotSigned("/api/v3/sub-account/list");
  const subBody = report("SUB-ACCOUNTS  /api/v3/sub-account/list", await getJson(sub.url, sub.headers));
  if (Array.isArray(subBody?.subAccounts)) {
    console.log(`  sub-accounts: ${subBody.subAccounts.length}`);
  }

  // ------------------------------------------------- 4. Anything else signed
  /**
   * Two more that sometimes hold money. Both are asked mainly for their error
   * message: if MEXC does not expose them to this key, that is worth knowing
   * before anyone tries to build against them.
   */
  const margin = spotSigned("/api/v3/margin/isolated/account");
  report("MARGIN  /api/v3/margin/isolated/account", await getJson(margin.url, margin.headers));

  const etf = spotSigned("/api/v3/etf/info");
  report("ETF  /api/v3/etf/info", await getJson(etf.url, etf.headers));

  console.log(
    "\n---\nWhat to look for: the section that reports holdings is where your money is." +
      "\nIf FUTURES refuses, the exact code and msg matter — MEXC restricts futures API" +
      "\naccess for some accounts, and that is a different problem from a wrong signature." +
      "\nNo amounts were printed, so this output is safe to paste."
  );
}

main().catch((e) => {
  console.error("Probe failed:", e.message);
  process.exit(1);
});
