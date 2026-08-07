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
};
