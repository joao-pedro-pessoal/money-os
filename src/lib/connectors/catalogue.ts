/**
 * What can be connected, and what already is.
 *
 * This exists because "Add account" was a dead end: it offered a box to type a
 * balance into and said nothing about the fact that four of these platforms can
 * keep their own balance up to date. People typed Bybit's total in by hand for
 * weeks without knowing.
 *
 * The failure mode it guards against is worse than the missed convenience. Type
 * a manual balance for a platform *and* connect it, and the same money is in
 * the app twice — under a name you chose and again under the synced account.
 * So this also matches what you're typing against the platforms, and says so
 * before you press Add.
 *
 * Pure — no DB, no React.
 */

import { PLATFORM_LABELS, PLATFORM_SETUP } from "./constants";

export interface ExistingConnection {
  platform: string;
  accountName: string;
}

export interface PlatformOption {
  platform: string;
  label: string;
  /** One line on what connecting costs you in setup. */
  requirement: string;
  /** Accounts this platform already feeds, by name. */
  connectedTo: string[];
  connected: boolean;
}

/** Every supported platform, with whatever is already connected attached. */
export function platformOptions(connections: readonly ExistingConnection[]): PlatformOption[] {
  return Object.keys(PLATFORM_LABELS)
    .map((platform) => {
      const setup = PLATFORM_SETUP[platform];
      const connectedTo = connections
        .filter((c) => c.platform === platform)
        .map((c) => c.accountName);

      return {
        platform,
        label: PLATFORM_LABELS[platform],
        requirement: setup ? summarise(setup) : "",
        connectedTo,
        connected: connectedTo.length > 0,
      };
    })
    // Unconnected first: the list is there to show you what you could add.
    .sort((a, b) => Number(a.connected) - Number(b.connected) || a.label.localeCompare(b.label));
}

function summarise(setup: (typeof PLATFORM_SETUP)[string]): string {
  if (!setup.needsSecret) return `Needs only your ${setup.identifierLabel.toLowerCase()}`;
  return `Needs a read-only ${setup.identifierLabel.toLowerCase()} and its secret`;
}

/**
 * Normalised for comparison: case, accents, spaces and punctuation removed.
 * "Trading 212", "trading212" and "TRADING-212" are the same institution.
 */
export function normaliseInstitution(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The platform someone is about to type a manual balance for, if any.
 *
 * Matching is deliberately conservative — exact match on the squashed name, or
 * one name containing the other when both are long enough to be meaningful.
 * A loose match here would nag about a manual "Bank" account forever, and a
 * warning that fires when it shouldn't is one people learn to click past.
 */
export function matchPlatform(
  institution: string,
  options: readonly PlatformOption[]
): PlatformOption | null {
  const typed = normaliseInstitution(institution);
  if (typed.length < 3) return null;

  for (const option of options) {
    const name = normaliseInstitution(option.label);
    if (typed === name) return option;
    if (name.length >= 5 && (typed.includes(name) || name.includes(typed))) return option;
  }
  return null;
}
