/**
 * Filtering and sorting for account lists.
 *
 * Pure so the ordering rules can be tested; the component only owns the
 * controls. Sorting by a converted value matters — a list ordered by raw
 * numbers puts 100 USD above 90 EUR, which is wrong and looks like a bug.
 */

export interface FilterableAccount {
  id: string;
  name: string;
  institution: string;
  accountType: string;
  currency: string;
  /** What the account really holds, converted to base. Null when no rate exists. */
  baseValue: number | null;
  /** Displayed value in the account's own currency. */
  displayValue: number;
  free: number;
  connected: boolean;
}

export type SortKey = "value" | "name" | "institution" | "free" | "type";
export type SortDir = "asc" | "desc";

export interface AccountFilters {
  query: string;
  type: string; // "" = all
  currency: string; // "" = all
  hideEmpty: boolean;
  connectedOnly: boolean;
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_FILTERS: AccountFilters = {
  query: "",
  type: "",
  currency: "",
  // On by default: the accounts left over from failed connection attempts are
  // exactly the noise this list suffers from.
  hideEmpty: true,
  connectedOnly: false,
  sort: "value",
  dir: "desc",
};

/** Zero to the cent. Avoids float dust hiding an account that reads 0,00. */
export function isEmptyAccount(a: FilterableAccount): boolean {
  return Math.abs(a.displayValue) < 0.005 && Math.abs(a.free) < 0.005;
}

export function applyAccountFilters(
  accounts: FilterableAccount[],
  f: AccountFilters
): FilterableAccount[] {
  const q = f.query.trim().toLowerCase();

  const filtered = accounts.filter((a) => {
    if (f.hideEmpty && isEmptyAccount(a)) return false;
    if (f.type && a.accountType !== f.type) return false;
    if (f.currency && a.currency !== f.currency) return false;
    if (f.connectedOnly && !a.connected) return false;
    if (q && !`${a.name} ${a.institution}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const sign = f.dir === "asc" ? 1 : -1;
  const byText = (x: string, y: string) => sign * x.localeCompare(y, "pt-PT");

  return [...filtered].sort((a, b) => {
    switch (f.sort) {
      case "name":
        return byText(a.name, b.name);
      case "institution":
        return byText(a.institution, b.institution);
      case "type":
        return byText(a.accountType, b.accountType);
      case "free":
        return sign * (a.free - b.free);
      case "value":
      default: {
        // An account with no exchange rate has no comparable value, so it
        // sinks to the bottom rather than pretending to be worth zero.
        const av = a.baseValue;
        const bv = b.baseValue;
        if (av === null && bv === null) return byText(a.name, b.name);
        if (av === null) return 1;
        if (bv === null) return -1;
        return sign * (av - bv);
      }
    }
  });
}

/** Options for the dropdowns, taken from the data so nothing empty is offered. */
export function filterOptions(accounts: FilterableAccount[]) {
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return {
    types: uniq(accounts.map((a) => a.accountType)),
    currencies: uniq(accounts.map((a) => a.currency)),
  };
}
