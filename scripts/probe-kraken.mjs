/**
 * Prints the SHAPE of your real Kraken responses, with every amount replaced by
 * a placeholder. Run it, paste the output, and the parser can be checked
 * against reality rather than against the documentation.
 *
 *   node scripts/probe-kraken.mjs YOUR_API_KEY YOUR_PRIVATE_KEY
 *
 * The key needs the **Query Funds** permission and nothing else. A key without
 * trade permission cannot trade, whatever any code does with it.
 *
 * Read-only: it calls BalanceEx and TradeBalance and nothing else. Your key and
 * private key never leave your machine — they sign the request and are never
 * printed.
 *
 * The useful half of the output is the last section: fields Kraken sent that
 * this app's parser does not read. That is where a missing wallet or an
 * unhandled state shows up, and it is not something a test can find.
 */

import { createHash, createHmac } from "crypto";

const [apiKey, apiSecret] = process.argv.slice(2);

if (!apiKey || !apiSecret) {
  console.error("Usage: node scripts/probe-kraken.mjs YOUR_API_KEY YOUR_PRIVATE_KEY");
  process.exit(1);
}

const BASE = "https://api.kraken.com";

/** Fields src/lib/connectors/kraken/parse.ts actually reads. */
const READ_BY_PARSER = {
  BalanceEx: ["balance", "hold_trade"],
  TradeBalance: ["e", "mf", "m"],
};

function sign(path, nonce, body, secret) {
  const hashed = createHash("sha256").update(nonce + body).digest();
  return createHmac("sha512", Buffer.from(secret, "base64"))
    .update(Buffer.concat([Buffer.from(path, "utf8"), hashed]))
    .digest("base64");
}

async function call(method, params = {}) {
  const path = `/0/private/${method}`;
  const nonce = String(Date.now());
  const body = new URLSearchParams({ nonce, ...params }).toString();

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sign(path, nonce, body, apiSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return { status: res.status, payload: await res.json().catch(() => null) };
}

/** Every number becomes a placeholder; the structure survives. */
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

/** Keys the venue sent that the parser never looks at. */
function unread(payload, known) {
  const result = payload?.result;
  if (!result || typeof result !== "object") return [];

  const seen = new Set();
  for (const value of Object.values(result)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const key of Object.keys(value)) seen.add(key);
    }
  }
  // A flat result (plain Balance) has its fields at the top level.
  if (seen.size === 0) for (const key of Object.keys(result)) seen.add(key);

  return [...seen].filter((k) => !known.includes(k)).sort();
}

async function main() {
  for (const [method, params] of [["BalanceEx", {}], ["TradeBalance", { asset: "ZUSD" }]]) {
    const { status, payload } = await call(method, params);
    console.log(`\n=== ${method} — HTTP ${status} ===`);

    const errors = payload?.error ?? [];
    if (errors.length > 0) {
      console.log("Kraken said:", errors.join("; "));
      console.log("(EAPI:Invalid key can mean the key, the permission, or the nonce.)");
      continue;
    }

    console.log("shape:", JSON.stringify(redact(payload), null, 2).slice(0, 1600));

    const rows = Object.keys(payload?.result ?? {});
    console.log(`rows: ${rows.length}`);

    const missed = unread(payload, READ_BY_PARSER[method]);
    console.log(
      missed.length === 0
        ? "fields the parser ignores: (none)"
        : `fields the parser ignores: ${missed.join(", ")}`
    );
  }

  console.log(
    "\nNow compare: what does Kraken's own Balances page show as your total? " +
      "If the app's figure differs, the difference is the useful part."
  );
}

main().catch((e) => {
  console.error("Could not reach Kraken:", e.message);
  process.exit(1);
});
