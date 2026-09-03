/**
 * Shared constants for the connector layer.
 *
 * These live outside src/actions because a "use server" module may only export
 * async functions — exporting a plain const from one silently invalidates every
 * export in that file at build time.
 */

/** Sentinel for the Connections form's "create the account for me" option. */
export const NEW_ACCOUNT = "__new__";

/** Display names for supported platforms. */
export const PLATFORM_LABELS: Record<string, string> = {
  hyperliquid: "Hyperliquid",
  bybit: "Bybit",
  ibkr: "Interactive Brokers",
  trading212: "Trading 212",
  kraken: "Kraken",
  binance: "Binance",
  okx: "OKX",
  mexc: "MEXC",
};

/**
 * What each platform needs from the user, and how to explain it.
 *
 * `steps` is what someone actually has to do before the form can work, shown
 * when they point at the platform — most of the effort with these connectors
 * happens outside the app, and finding that out after filling the form in is
 * the wrong order.
 */
export const PLATFORM_SETUP: Record<
  string,
  {
    identifierLabel: string;
    identifierHint: string;
    needsSecret: boolean;
    /**
     * A third credential, chosen when the key is created.
     *
     * OKX and KuCoin issue key + secret + passphrase and require all three on
     * every signed request. Declared here so the form asks for it and the
     * action encrypts it, rather than each connector discovering it is missing
     * at the first sync.
     */
    needsPassphrase?: boolean;
    help: string;
    steps: string[];
    /** Set when the platform is known not to work for most users here. */
    warning?: string;
  }
> = {
  hyperliquid: {
    identifierLabel: "Wallet address",
    identifierHint: "0x… , 42 characters",
    needsSecret: false,
    help: "Hyperliquid's read endpoint is public, so it needs only your public wallet address — no API key, no password, nothing secret.",
    steps: [
      "Nothing to install and nothing to configure.",
      "Copy your public wallet address (the 0x… one) from Hyperliquid.",
      "Paste it below and add the connection.",
    ],
  },
  bybit: {
    identifierLabel: "API key",
    identifierHint: "from Bybit → API Management",
    needsSecret: true,
    help: "The secret is encrypted before it is stored and is never shown again. Requires ENCRYPTION_KEY in your .env.",
    steps: [
      "Only bybit.com works — see the warning below if your account is on bybit.eu.",
      "Set ENCRYPTION_KEY in .env and restart the app, or the secret cannot be stored.",
      "In Bybit, go to API Management and create a key with READ-ONLY permissions.",
      "Paste the key and its secret below.",
    ],
    warning:
      "bybit.eu cannot be connected, and no setting here changes that: its keys are issued only through “Connect to Third-Party Applications” and stay locked to that application's servers, so none of them authenticate from your own machine. Tested against a live account — it always answers “Unmatched IP”. If you are on bybit.eu, track that account manually instead.",
  },
  okx: {
    identifierLabel: "API key",
    identifierHint: "a UUID, from OKX → API",
    needsSecret: true,
    needsPassphrase: true,
    help:
      "OKX issues three things rather than two: a key, a secret and a passphrase you choose when creating the key. All three are needed on every request, and the secret and passphrase are both encrypted before they are stored.",
    steps: [
      "Set ENCRYPTION_KEY in .env and restart the app, or nothing can be stored.",
      "In OKX, go to API and create a V5 key.",
      "Give it the Read permission only. Leave Trade and Withdraw OFF.",
      "Choose a passphrase and write it down — OKX never shows it again.",
      "Paste the key, the secret and the passphrase below.",
    ],
    warning:
      "This reads your trading account. Funding is a separate account on OKX with its own endpoint and will not appear, so the figure here can be lower than what OKX shows you.",
  },
  binance: {
    identifierLabel: "API key",
    identifierHint: "from Binance → API Management",
    needsSecret: true,
    help:
      "Only the Enable Reading permission is needed, and a key without trading rights cannot place an order whatever the app does. The secret is encrypted before it is stored and never shown again.",
    steps: [
      "Set ENCRYPTION_KEY in .env and restart the app, or the secret cannot be stored.",
      "In Binance, go to API Management and create a key.",
      "Leave Enable Reading ticked and every other permission OFF.",
      "Copy the secret before closing the page — Binance shows it exactly once.",
      "Paste the key and the secret below.",
    ],
    warning:
      "This reads your Spot wallet only. Money in Funding, Simple Earn, Futures or any locked product sits in a separate wallet with its own endpoint and will not appear — so the figure here can be lower than what Binance shows you. Those wallets need a live key to be built against without guessing at the reply; until then the limit is stated rather than hidden.",
  },
  mexc: {
    identifierLabel: "API key",
    identifierHint: "mx0… , from MEXC → API Management",
    needsSecret: true,
    help:
      "MEXC copied Binance's API, so this needs the same thing: a key with read access only. A key without trading rights cannot place an order whatever the app does. The secret is encrypted before it is stored and never shown again.",
    steps: [
      "Set ENCRYPTION_KEY in .env and restart the app, or the secret cannot be stored.",
      "In MEXC, open API Management from the account menu and create a key.",
      "Tick the read permission only. Leave Trade and Withdraw OFF.",
      "MEXC asks you to bind an IP address. Use the one this app runs from, or leave it unrestricted — a key bound to another machine will always answer “Signature for this request is not valid”.",
      "Copy the secret before closing the page — MEXC shows it exactly once.",
      "Paste the key and the secret below.",
    ],
    warning:
      "This reads your Spot wallet only. Futures is a separate API on a separate host, and Savings, Staking and launchpad products are separate again — none of them will appear, so the figure here can be lower than what MEXC shows you. They need a live key to be built against without guessing at the reply.",
  },
  kraken: {
    identifierLabel: "API key",
    identifierHint: "from Kraken → Settings → API",
    needsSecret: true,
    help:
      "Kraken issues keys with individual permissions. This needs Query Funds and nothing else — a key without trade permission cannot place an order even if the app were wrong. The secret is encrypted before it is stored and never shown again.",
    steps: [
      "Set ENCRYPTION_KEY in .env and restart the app, or the secret cannot be stored.",
      "In Kraken, go to Settings → API and create a new key.",
      "Tick Query Funds. Leave every trading and withdrawal permission OFF.",
      "Paste the key and its private key below.",
    ],
  },
  ibkr: {
    identifierLabel: "Account id",
    identifierHint: "U1234567, or DU… for paper",
    needsSecret: false,
    help:
      "No API key: the app reads through a gateway running on this machine, so nothing secret is stored.",
    steps: [
      "Requires an IBKR Pro account — the API does not work with Lite.",
      "Download IBKR's Client Portal Gateway and unzip it.",
      "Start it in its own window: bin\\run.bat root\\conf.yaml",
      "Open https://localhost:5000 in a browser and log in. The certificate warning is expected.",
      "Close Trader Workstation and the IBKR mobile app — IBKR allows one session per username.",
      "Leave the account id empty: it is read from the gateway. It is NOT your login username.",
    ],
    warning:
      "The session expires and has to be renewed in the browser periodically. That is how IBKR works, not a fault — syncing will say so plainly and leave your balance untouched.",
  },
  trading212: {
    identifierLabel: "API key",
    identifierHint: "from Settings → API (Beta)",
    needsSecret: true,
    help: "Read-only by design: this app never imports Trading 212's order endpoints. Generate the key with the order permissions switched off as well — the app can't place a trade either way, and a key that can't is one less thing to worry about.",
    steps: [
      "Set ENCRYPTION_KEY in .env and restart the app, or the secret cannot be stored.",
      "In Trading 212, open Settings → API (Beta) and accept the risk warning.",
      "Generate a key with the account and portfolio permissions. Leave orders off.",
      "Choose 'Unrestricted' unless you have a fixed IP — a restricted key stops working when your address changes.",
      "Copy both the API Key and the API Secret: the secret is shown only once.",
      "Paste the key in the first box and the secret in the second — they are not interchangeable.",
    ],
    warning:
      "Works only for Invest and Stocks ISA accounts — not for SIPP. The API is in beta and the account summary allows one call every five seconds per account, so syncing repeatedly returns an error rather than data.",
  },
};


/**
 * Bybit split into two entities under MiCA: a global platform and an EEA one,
 * on separate hosts. Same V5 API and the same docs — only the host differs —
 * but a key issued by one is rejected by the other, so the region has to be
 * part of the connection rather than guessed.
 *
 * Deliberately an allowlist rather than a free-text URL: the app must never be
 * talked into signing a request to an arbitrary host with the user's API key.
 */
export const BYBIT_REGIONS = [
  { value: "global", label: "Bybit.com (Global)", baseUrl: "https://api.bybit.com" },
] as const;

/**
 * bybit.eu is deliberately not offered.
 *
 * Under MiCA, EEA users are moved to bybit.eu, and that entity only issues API
 * keys through "Connect to Third-Party Applications". Such a key is bound to
 * that application's server IPs, and the IP field is not editable, so it can
 * never authenticate from a user's own machine — or their own server, which
 * rules out a deployment as a workaround too. Verified against a live account:
 * every attempt returns error 10010, "Unmatched IP", with a valid key and a
 * correct signature. Koinly, Blockpit, Gainium and hummingbot are stuck on the
 * same wall, so this is the exchange's design rather than something to fix.
 *
 * The connector itself works; only that entity refuses. Listing the option
 * would just invite people to spend an hour discovering this for themselves.
 */
export const BYBIT_EU_UNSUPPORTED =
  "bybit.eu cannot be connected. Its API keys are issued only through “Connect to Third-Party Applications” and are locked to that application's servers, so no key works from your own machine — whichever application you pick, and regardless of where you run this app. If your account is on bybit.eu, track it as a manual account instead.";

export type BybitRegion = (typeof BYBIT_REGIONS)[number]["value"];

/**
 * Falls back to the global host, the only one offered.
 *
 * A connection stored earlier with region "eu" lands here too. That is
 * harmless: such a connection never authenticated in the first place.
 */
export function bybitBaseUrl(region: string | null | undefined): string {
  return BYBIT_REGIONS.find((r) => r.value === region)?.baseUrl ?? BYBIT_REGIONS[0].baseUrl;
}
