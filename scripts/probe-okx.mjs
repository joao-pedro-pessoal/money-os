/**
 * Prints the SHAPE of your real OKX account response, with every amount
 * replaced by a placeholder. Run it, paste the output, and the parser can be
 * checked against reality rather than against the documentation.
 *
 *   node scripts/probe-okx.mjs YOUR_API_KEY YOUR_API_SECRET YOUR_PASSPHRASE
 *
 * OKX issues three things, and all three are needed on every request. The key
 * needs the **Read** permission and nothing else.
 *
 * Read-only: it calls /api/v5/account/balance and nothing else. None of the
 * three credentials leaves your machine or is printed.
 *
 * Note on the status: OKX answers with `code` as a STRING, and "0" means
 * success. This prints it verbatim so you can see which you got.
 */

import { createHmac } from "crypto";

const [apiKey, apiSecret, passphrase] = process.argv.slice(2);

if (!apiKey || !apiSecret || !passphrase) {
  console.error("Usage: node scripts/probe-okx.mjs YOUR_API_KEY YOUR_API_SECRET YOUR_PASSPHRASE");
  process.exit(1);
}

const BASE = "https://www.okx.com";
/** Fields src/lib/connectors/okx/parse.ts actually reads, per detail row. */
const READ_BY_PARSER = ["ccy", "eq", "cashBal", "eqUsd", "frozenBal", "ordFrozen"];

function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return "<number>";
  if (typeof value === "string") return /^-?[\d.,]+(e-?\d+)?$/i.test(value.trim()) ? "<amount>" : value;
  if (Array.isArray(value)) return value.slice(0, 2).map(redact);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

async function main() {
  const requestPath = "/api/v5/account/balance";
  const timestamp = new Date().toISOString();
  const sign = createHmac("sha256", apiSecret)
    .update(`${timestamp}GET${requestPath}`)
    .digest("base64");

  const res = await fetch(`${BASE}${requestPath}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
  });
  const payload = await res.json().catch(() => null);

  console.log(`=== ${requestPath} — HTTP ${res.status} ===`);
  console.log("code:", JSON.stringify(payload?.code), '(success is the string "0")');

  if (payload?.code !== "0") {
    console.log("OKX said:", payload?.msg || "(no message)");
    // Observed against the live API rather than read off a page: a key that
    // does not exist answers 50119, with HTTP 401.
    console.log("(50119 is a key that doesn't exist; 50113 a bad signature; 50105 a wrong passphrase.)");
    return;
  }

  const account = payload?.data?.[0] ?? null;
  const details = Array.isArray(account?.details) ? account.details : [];
  const held = details.filter((d) => Number(d.eq) !== 0);

  console.log("shape of one detail row:", JSON.stringify(redact(held[0] ?? details[0]), null, 2));
  console.log(`currencies returned: ${details.length}`);
  console.log(`non-zero holdings: ${held.length}`);
  console.log("held:", held.map((d) => d.ccy).join(", ") || "(none)");
  console.log("totalEq stated:", account?.totalEq === undefined ? "NO — the app falls back to a sum" : "yes");

  /**
   * A currency with no eqUsd is one the app cannot value, and it stays
   * unpriced rather than counting as nothing. Worth knowing how many.
   */
  const unpriced = held.filter((d) => d.eqUsd === "" || d.eqUsd === undefined);
  console.log(
    unpriced.length === 0
      ? "every holding carries a stated USD value"
      : `unpriced by OKX (shown as unpriced, not as zero): ${unpriced.map((d) => d.ccy).join(", ")}`
  );

  const rowKeys = new Set(details.flatMap((d) => Object.keys(d)));
  const missed = [...rowKeys].filter((k) => !READ_BY_PARSER.includes(k)).sort();
  console.log(
    missed.length === 0
      ? "fields the parser ignores: (none)"
      : `fields the parser ignores: ${missed.join(", ")}`
  );

  console.log(
    "\nThis is the trading account. If OKX's own total is higher, the difference is " +
      "probably the Funding account — a separate account this connector does not read."
  );
}

main().catch((e) => {
  console.error("Could not reach OKX:", e.message);
  process.exit(1);
});
