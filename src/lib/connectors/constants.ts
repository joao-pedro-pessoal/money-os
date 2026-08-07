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
