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

/** Shared by the full menu and the phone's shortcuts, including sibling tabs. */
export function isNavigationActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const ownedBy: Record<string, string[]> = {
    "/analytics": ["/statistics", "/money-map"],
    "/accounts": ["/interest", "/liabilities"],
    "/investments": ["/positions", "/connections"],
    "/transactions": ["/import"],
  };
  return [href, ...(ownedBy[href] ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export const ANALYTICS_TABS = [
  { href: "/analytics", label: "Overview" },
  { href: "/analytics/spending", label: "Where it goes" },
  { href: "/statistics", label: "Trends & projections" },
  { href: "/analytics/report", label: "Reports" },
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

/**
 * Eleven entries in three groups, down from fifteen in a flat list.
 *
 * What changed and why:
 * - Money Map showed the same two breakdowns as Analytics; it redirects there.
 * - Statistics is a tab inside Analytics — both answer "how is this going?".
 * - Interest is a tab inside Accounts; interest is received *by* an account.
 * - Open Positions and Connections are tabs inside Investments.
 * - "Import statement" was an action masquerading as a place. It lives on the
 *   Cash Flow page, which is the data it changes, and in Settings → Your data.
 */
export const NAV_GROUPS: { label?: "groupMoney" | "groupLearning" | "groupNotGuaranteed"; links: { href: string; label: string }[] }[] = [
  {
    links: [
      { href: "/", label: "Dashboard" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
  {
    label: "groupMoney",
    links: [
      { href: "/accounts", label: "Accounts" },
      { href: "/transactions", label: "Cash Flow" },
      { href: "/savings", label: "Savings" },
      { href: "/budgets", label: "Budgets" },
      { href: "/buckets", label: "Buckets" },
      { href: "/subscriptions", label: "Subscriptions" },
      // The other direction. Subscriptions forecast what leaves; this is what
      // is due to arrive, and neither is counted in a balance.
      { href: "/expected", label: "Coming in" },
    ],
  },
  {
    label: "groupLearning",
    links: [
      { href: "/library", label: "Library" },
    ],
  },
  {
    label: "groupNotGuaranteed",
    links: [{ href: "/investments", label: "Investments" }],
  },
];

// Reuse the page tabs so search follows the same destinations and labels.
export const SEARCHABLE_PAGES = [
  ...NAV_GROUPS.flatMap(group => group.links),
  ...ACCOUNTS_TABS,
  ...ANALYTICS_TABS,
  ...INVESTMENT_TABS,
  { href: "/import", label: "Import statement" },
  { href: "/manual", label: "Manual" },
  { href: "/settings", label: "Settings" },
].filter((link, index, pages) => pages.findIndex(page => page.href === link.href) === index);


export const SETTINGS_TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/rates", label: "Currency & rates" },
  { href: "/settings/data", label: "Your data" },
  { href: "/settings/phone", label: "On your phone" },
];
