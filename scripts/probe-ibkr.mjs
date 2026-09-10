/**
 * Checks the IBKR Client Portal Gateway and prints the SHAPE of its responses,
 * with every amount replaced by a placeholder.
 *
 *   node scripts/probe-ibkr.mjs
 *   node scripts/probe-ibkr.mjs https://localhost:5000/v1/api
 *
 * Read-only: it calls only the auth status, accounts, ledger and positions
 * endpoints. Nothing is written, and no credentials are involved — the gateway
 * holds your session, not this script.
 *
 * Run it after logging into the gateway in a browser. It tells you whether the
 * session is alive and whether the parser will understand the responses,
 * without touching the app.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

const base = (process.argv[2] || "https://localhost:5000/v1/api").replace(/\/+$/, "");

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function get(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const isHttps = url.protocol === "https:";
    const send = isHttps ? httpsRequest : httpRequest;

    const req = send(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Accept: "application/json",
          // The gateway's Jetty rejects requests with no User-Agent, which is
          // why a browser works and a bare script gets 403 Access Denied.
          "User-Agent": "money-os",
          // Only on POST: some servers reject a GET that carries a body length.
          ...(method === "POST" ? { "Content-Length": "0" } : {}),
        },
        // The gateway uses a self-signed certificate. Only relaxed for a
        // connection that never leaves this machine.
        ...(isHttps && isLoopback(url.hostname) ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, method, json: JSON.parse(body) });
          } catch {
            // Keep the raw body: an empty response and an HTML error page mean
            // very different things, and both parse to nothing.
            resolve({ status: res.statusCode, method, json: null, raw: body.slice(0, 300) });
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.end();
  });
}

/** Keeps names and structure, replaces anything that looks like money. */
function redact(value, key = "") {
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  }
  const keep = [
    "currency", "ticker", "contractDesc", "assetClass", "accountId", "id",
    "displayName", "type", "secType", "key", "secondkey",
  ];
  if (keep.includes(key) || typeof value === "boolean" || value === null) return value;
  if (typeof value === "number") return 0;
  if (typeof value === "string") return value === "" ? "" : "<value>";
  return value;
}

console.log(`Gateway: ${base}\n`);

/** Shows the HTTP status and the raw body whenever the JSON can't be read. */
function report(name, res) {
  console.log(`=== ${name} === (HTTP ${res.status}, ${res.method})`);
  if (res.json === null) {
    console.log(res.raw === "" ? "(empty body)" : `(unparseable) ${res.raw}`);
    return;
  }
  console.log(JSON.stringify(redact(res.json), null, 2));
}

let status;
try {
  // auth/status is POST on the Client Portal API — a GET returns an empty body,
  // which looks identical to "not logged in".
  status = await get("/iserver/auth/status", "POST");
  if (status.json === null) {
    console.log("POST /iserver/auth/status gave nothing usable; retrying as GET.\n");
    status = await get("/iserver/auth/status", "GET");
  }
} catch (err) {
  if (err.code === "ECONNREFUSED") {
    console.error(
      "Nothing is listening there.\n" +
        "Start the Client Portal Gateway (bin\\run.bat root\\conf.yaml on Windows),\n" +
        "then open https://localhost:5000 in a browser and log in."
    );
  } else {
    console.error("Could not reach the gateway:", err.message);
  }
  process.exit(1);
}

report("auth status", status);

const authed = status.json?.authenticated === true;

if (status.json?.competing === true) {
  console.log(
    "\n>>> Another session is using the same IBKR username (Trader Workstation,\n" +
      ">>> the mobile app, or the web portal). IBKR allows only one at a time.\n"
  );
}

if (!authed) {
  console.log(
    "\n>>> Auth status doesn't report an authenticated session.\n" +
      ">>> If you did just log in at https://localhost:5000, the portfolio calls\n" +
      ">>> below will still be attempted — they are the real test.\n"
  );
}

// Attempted regardless: if the session is alive, these work even when the
// status endpoint is unhelpful, and their output is what the parser needs.
const accounts = await get("/portfolio/accounts");
console.log();
report("accounts", accounts);

const accountId = accounts.json?.[0]?.accountId ?? accounts.json?.[0]?.id;
if (!accountId) {
  console.log(
    "\nNo account id came back. If the body above is empty or an error, the\n" +
      "session isn't live — log in at https://localhost:5000 and run this again."
  );
  process.exit(0);
}
console.log(`\nUsing account: ${accountId}`);

console.log();
report("ledger (cash by currency)", await get(`/portfolio/${accountId}/ledger`));

console.log();
report("positions", await get(`/portfolio/${accountId}/positions/0`));
