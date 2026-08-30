/**
 * Where things live.
 *
 * The sidebar had fifteen entries, which is past the point where a list is
 * scannable — you stop reading it and start hunting. Two rules got it down:
 *
 *   1. An *action* is not a destination. Importing a statement is something you
 *      do occasionally, from the page whose data it changes. It sat between
 *      "Cash Flow" and "Subscriptions" as if it were a place.
 *   2. Screens that answer the same question share one entry and use tabs.
 */

export const ANALYTICS_TABS = [
  { href: "/analytics", label: "Overview" },
  { href: "/statistics", label: "Trends & projections" },
];

export const ACCOUNTS_TABS = [
  { href: "/accounts", label: "Accounts" },
  // The other half of net worth. It sits with Accounts because both answer
  // "what is my position", one side each.
  { href: "/liabilities", label: "What you owe" },
  { href: "/interest", label: "Interest received" },
];

export const INVESTMENT_TABS = [
  { href: "/investments", label: "Holdings" },
  { href: "/investments/analysis", label: "Analysis" },
  // What you actually did, as opposed to what you currently hold. The page
  // existed for a week with nothing linking to it, which is the same as not
  // existing — a page nobody can reach is a page nobody has.
  { href: "/investments/history", label: "Trade history" },
  { href: "/investments/playlists", label: "Playlists" },
  { href: "/investments/watchlist", label: "Watchlist" },
  { href: "/investments/dividends", label: "Dividends" },
  { href: "/positions", label: "Open positions" },
  { href: "/connections", label: "Connections" },
];
