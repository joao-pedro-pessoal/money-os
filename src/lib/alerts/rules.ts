/**
 * What deserves your attention right now.
 *
 * The app already knows all of this — that a budget is blown, that a
 * subscription charges tomorrow, that a balance has not been touched in two
 * months, that a sync has been failing. It just never said anything. This is
 * the part that decides; where the saying happens is a separate question.
 *
 * Three rules shaped it:
 *
 * **An alert has to be actionable.** "Your portfolio moved 3%" is a fact, not
 * an alert — there is nothing to do about it and it fires every day until you
 * stop reading the list. Everything here names something you could act on.
 *
 * **Silence is the normal state.** A list that always has ten things in it is
 * a list nobody opens. Thresholds are set so that an empty panel is the usual
 * outcome and anything appearing is worth the interruption.
 *
 * **An alert must not be a second opinion.** These read the same figures the
 * screens read; none of them recomputes a total its own way. A warning that
 * disagrees with the page it points at is worse than no warning.
 *
 * Pure: no DB, no fetch, no dates from the system clock — `today` is passed in
 * so the rules are testable and so a period boundary can be exercised.
 */

export type Severity = "critical" | "warning" | "info";

export interface Alert {
  /** Stable across evaluations, so a dismissal can refer to one. */
  id: string;
  severity: Severity;
  /** What happened, in one line. */
  title: string;
  /** Why it matters, or what to do. Optional — the title often suffices. */
  detail?: string;
  /** Where to go to act on it. */
  href: string;
  /** Groups the panel by area. */
  kind: "budget" | "subscription" | "account" | "connection" | "watchlist" | "portfolio";
}

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Most severe first; within a severity, the order the rules produced them. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

function money(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface BudgetAlertInput {
  id: string;
  category: string;
  currency: string;
  /** Spent so far this period. */
  spent: number;
  /** The limit for the period, after any carry-over. */
  available: number;
  /** How far through the period we are, 0–1. */
  progress: number;
}

/**
 * Over budget, or on course to be.
 *
 * The pacing case is the one worth having. Being told you overspent on the 31st
 * is a receipt; being told on the 12th that you are spending at twice the rate
 * the month can afford is something you can still act on.
 *
 * Pacing only fires after a fifth of the period has passed. One large shop on
 * day two puts you "300% of pace" every single time, which teaches you to
 * ignore the alert before the month it matters.
 */
export function budgetAlerts(budgets: BudgetAlertInput[]): Alert[] {
  const alerts: Alert[] = [];

  for (const b of budgets) {
    if (b.available <= 0) continue;

    if (b.spent > b.available) {
      alerts.push({
        id: `budget:over:${b.id}`,
        severity: "critical",
        kind: "budget",
        title: `${b.category} is over budget`,
        detail: `${money(b.spent, b.currency)} spent of ${money(b.available, b.currency)}.`,
        href: "/budgets",
      });
      continue;
    }

    if (b.progress < 0.2) continue;

    const spentShare = b.spent / b.available;
    // A fifth ahead of the clock. Tighter than this and an ordinary weekly
    // shop trips it; looser and the warning arrives too late to matter.
    if (spentShare > b.progress + 0.2) {
      const projected = b.progress === 0 ? b.spent : b.spent / b.progress;
      alerts.push({
        id: `budget:pace:${b.id}`,
        severity: "warning",
        kind: "budget",
        title: `${b.category} is running ahead of the month`,
        detail: `${money(b.spent, b.currency)} of ${money(b.available, b.currency)} with ${Math.round(
          (1 - b.progress) * 100
        )}% of the period left. At this rate, about ${money(projected, b.currency)}.`,
        href: "/budgets",
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export interface SubscriptionAlertInput {
  id: string;
  name: string;
  amount: number;
  currency: string;
  /** Days until the next charge, or null when no date is known. */
  daysUntil: number | null;
}

/**
 * Something is about to be taken from your account.
 *
 * Three days, not one: the point is to leave room to cancel, move money, or
 * decide you no longer want it. A warning that arrives on the morning of the
 * charge is a notification, not a chance.
 *
 * A subscription with no known date says nothing. Guessing a schedule and
 * warning about it would be inventing a fact about your money.
 */
export function subscriptionAlerts(subs: SubscriptionAlertInput[]): Alert[] {
  return subs
    .filter((s) => s.daysUntil !== null && s.daysUntil >= 0 && s.daysUntil <= 3)
    .map((s) => ({
      id: `subscription:due:${s.id}`,
      severity: "info" as const,
      kind: "subscription" as const,
      title:
        s.daysUntil === 0
          ? `${s.name} charges today`
          : `${s.name} charges in ${s.daysUntil} day${s.daysUntil === 1 ? "" : "s"}`,
      detail: money(s.amount, s.currency),
      href: "/subscriptions",
    }));
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface AccountAlertInput {
  id: string;
  name: string;
  /** Days since the balance was last set by hand. Null for synced accounts. */
  daysSinceUpdate: number | null;
  /** True when more is promised to buckets than the account holds. */
  overAllocated: boolean;
}

/**
 * A balance nobody has confirmed in a long time, or one promised twice over.
 *
 * Sixty days rather than thirty: a current account you touch weekly is not
 * stale at thirty-one days, and an alert that fires on every manual account
 * every month is one you learn to dismiss without reading.
 *
 * Over-allocation is critical rather than a warning because every figure that
 * rests on it is wrong until it is fixed — the buckets say you have money that
 * the account says you do not.
 */
export function accountAlerts(accounts: AccountAlertInput[]): Alert[] {
  const alerts: Alert[] = [];

  for (const a of accounts) {
    if (a.overAllocated) {
      alerts.push({
        id: `account:overallocated:${a.id}`,
        severity: "critical",
        kind: "account",
        title: `${a.name} promises more than it holds`,
        detail: "Buckets on this account add up to more than its balance.",
        href: `/accounts/${a.id}`,
      });
    }

    if (a.daysSinceUpdate !== null && a.daysSinceUpdate >= 60) {
      alerts.push({
        id: `account:stale:${a.id}`,
        severity: "warning",
        kind: "account",
        title: `${a.name} has not been updated in ${a.daysSinceUpdate} days`,
        detail: "Its balance is feeding your net worth as if it were current.",
        href: `/accounts/${a.id}`,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export interface ConnectionAlertInput {
  id: string;
  platform: string;
  /** From lib/connectors/freshness. */
  freshness: "LIVE" | "FRESH" | "STALE" | "ERROR" | "NEVER";
  lastError: string | null;
}

/**
 * A platform that stopped answering.
 *
 * `NEVER` is deliberately not an alert: a connection you just created and have
 * not synced yet is a normal state, not a problem, and saying otherwise on the
 * setup screen would be noise at exactly the wrong moment.
 */
export function connectionAlerts(connections: ConnectionAlertInput[]): Alert[] {
  const alerts: Alert[] = [];

  for (const c of connections) {
    if (c.freshness === "ERROR") {
      alerts.push({
        id: `connection:error:${c.id}`,
        severity: "critical",
        kind: "connection",
        title: `${c.platform} is not syncing`,
        // The venue's own words. A generic "sync failed" costs a round trip
        // every time, because it names nothing you can act on.
        detail: c.lastError ?? "The last sync failed.",
        href: "/connections",
      });
    } else if (c.freshness === "STALE") {
      alerts.push({
        id: `connection:stale:${c.id}`,
        severity: "warning",
        kind: "connection",
        title: `${c.platform} has not synced recently`,
        detail: "Its balances are showing the last figures it managed to fetch.",
        href: "/connections",
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export interface WatchlistAlertInput {
  id: string;
  symbol: string;
  currentPrice: number | null;
  targetPrice: number | null;
}

/**
 * A price you said you were waiting for has arrived.
 *
 * Only fires when both prices are known. An unpriced row says nothing rather
 * than treating a missing price as zero and reporting every target as hit.
 */
export function watchlistAlerts(items: WatchlistAlertInput[]): Alert[] {
  return items
    .filter(
      (i) =>
        i.currentPrice !== null &&
        i.targetPrice !== null &&
        i.targetPrice > 0 &&
        i.currentPrice <= i.targetPrice
    )
    .map((i) => ({
      id: `watchlist:hit:${i.id}`,
      severity: "info" as const,
      kind: "watchlist" as const,
      title: `${i.symbol} reached your target`,
      detail: `Now ${i.currentPrice!.toFixed(2)}, target ${i.targetPrice!.toFixed(2)}.`,
      href: "/investments/watchlist",
    }));
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export interface PortfolioAlertInput {
  /** Holdings the app could not price, so they are outside every total. */
  unpricedCount: number;
  /** Value sitting in holdings with no asset type, so unclassified in risk. */
  untaggedValue: number;
  currency: string;
}

/**
 * The portfolio is reporting less than it holds, or cannot classify it.
 *
 * Both of these are already shown on their own pages. They are repeated here
 * because they are the kind of thing you only notice if you happen to look, and
 * both mean a total on screen is quietly incomplete.
 */
export function portfolioAlerts(input: PortfolioAlertInput): Alert[] {
  const alerts: Alert[] = [];

  if (input.unpricedCount > 0) {
    alerts.push({
      id: "portfolio:unpriced",
      severity: "warning",
      kind: "portfolio",
      title: `${input.unpricedCount} holding${input.unpricedCount === 1 ? "" : "s"} has no price`,
      detail: "Left out of your portfolio total rather than counted as zero.",
      href: "/investments",
    });
  }

  if (input.untaggedValue > 0) {
    alerts.push({
      id: "portfolio:untagged",
      severity: "info",
      kind: "portfolio",
      title: `${money(input.untaggedValue, input.currency)} has no asset type`,
      detail: "It counts in your total but not in any risk breakdown.",
      href: "/positions",
    });
  }

  return alerts;
}
