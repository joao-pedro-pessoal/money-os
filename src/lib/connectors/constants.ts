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
};

/** What each platform needs from the user, and how to explain it. */
export const PLATFORM_SETUP: Record<
  string,
  { identifierLabel: string; identifierHint: string; needsSecret: boolean; help: string }
> = {
  hyperliquid: {
    identifierLabel: "Wallet address",
    identifierHint: "0x… , 42 characters",
    needsSecret: false,
    help: "Hyperliquid's read endpoint is public, so it needs only your public wallet address — no API key, no password, nothing secret.",
  },
  bybit: {
    identifierLabel: "API key",
    identifierHint: "from Bybit → API Management",
    needsSecret: true,
    help: "Create the key in Bybit with READ-ONLY permissions only. The secret is encrypted before it is stored and is never shown again. Requires ENCRYPTION_KEY in your .env.",
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
  { value: "eu", label: "Bybit.eu (Europe / MiCA)", baseUrl: "https://api.bybit.eu" },
  { value: "global", label: "Bybit.com (Global)", baseUrl: "https://api.bybit.com" },
] as const;

export type BybitRegion = (typeof BYBIT_REGIONS)[number]["value"];

/** Falls back to EU, which is where an EEA user is now required to be. */
export function bybitBaseUrl(region: string | null | undefined): string {
  return BYBIT_REGIONS.find((r) => r.value === region)?.baseUrl ?? BYBIT_REGIONS[0].baseUrl;
}
