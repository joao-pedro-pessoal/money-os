/**
 * Works out where a Hyperliquid account's positions actually live, and whether
 * each market's equity is separate money.
 *
 *   node scripts/probe-hyperliquid.mjs 0xYourWalletAddress
 *
 * Read-only and unauthenticated: the info endpoint is public and needs nothing
 * but the address. Nothing is written anywhere.
 *
 * Why this exists: `clearinghouseState` reports ONE perp dex per request, the
 * native one by default. Positions on a builder-deployed HIP-3 market (Ventuals,
 * Felix, XYZ…) are invisible unless that dex is named — so an account can show
 * open trades on the website while the API reports none. `dex: "ALL_DEXES"`,
 * which the docs mention, currently answers 500.
 *
 * Amounts ARE shown here, unlike the other probes. The question this answers —
 * whether equity per dex may be added up or would double count — cannot be
 * answered without them. Compare the total against what Hyperliquid shows you.
 */

const address = process.argv[2];

if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("Usage: node scripts/probe-hyperliquid.mjs 0xYourWalletAddress");
  process.exit(1);
}

const URL_INFO = "https://api.hyperliquid.xyz/info";

async function info(body) {
  const res = await fetch(URL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, raw: text.slice(0, 200) };
  }
}

const n = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));

/** One line per market: equity, free cash, and what is open on it. */
function summarize(label, state) {
  const equity = n(state?.marginSummary?.accountValue);
  const withdrawable = n(state?.withdrawable);
  const positions = state?.assetPositions ?? [];

  console.log(
    `${label.padEnd(22)} equity ${equity.toFixed(2).padStart(10)}   ` +
      `free ${withdrawable.toFixed(2).padStart(10)}   ${positions.length} position(s)`
  );

  for (const p of positions) {
    const pos = p.position ?? {};
    const size = n(pos.szi);
    console.log(
      `    ${String(pos.coin).padEnd(16)} ${size > 0 ? "LONG " : "SHORT"} ` +
        `size ${Math.abs(size)}  entry ${pos.entryPx}  value ${pos.positionValue}  pnl ${pos.unrealizedPnl}`
    );
  }

  return { equity, positions: positions.length };
}

console.log(`Address: ${address}\n`);

// The native dex, which is all the app currently asks for.
const native = await info({ type: "clearinghouseState", user: address });
if (native.json === null) {
  console.error(`Native dex request failed: HTTP ${native.status} ${native.raw ?? ""}`);
  process.exit(1);
}

console.log("--- per market ---");
let total = summarize("native", native.json).equity;
let totalPositions = native.json.assetPositions?.length ?? 0;

// Every builder-deployed market. The first entry is null: that is the native
// dex, already covered above.
const dexes = await info({ type: "perpDexs" });
const names = (dexes.json ?? [])
  .filter((d) => d && typeof d.name === "string")
  .map((d) => d.name);

for (const name of names) {
  const res = await info({ type: "clearinghouseState", user: address, dex: name });
  if (res.json === null) {
    console.log(`${name.padEnd(22)} (HTTP ${res.status} — skipped)`);
    continue;
  }
  const summary = summarize(name, res.json);
  total += summary.equity;
  totalPositions += summary.positions;
}

console.log("\n--- what this tells us ---");
console.log(`Equity summed across every market: ${total.toFixed(2)}`);
console.log(`Positions found in total:          ${totalPositions}`);
console.log(
  "\nCompare that total against the Portfolio Value Hyperliquid shows you.\n" +
    "  Same  -> each market holds its own collateral, and summing is correct.\n" +
    "  Higher -> the markets share collateral and summing would count it twice."
);

// Spot, for completeness — this part already works.
const spot = await info({ type: "spotClearinghouseState", user: address });
console.log("\n--- spot balances ---");
for (const b of spot.json?.balances ?? []) {
  console.log(`  ${String(b.coin).padEnd(10)} ${b.total}`);
}
