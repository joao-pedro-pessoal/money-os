/**
 * Recurring commitments — what leaves every month whether you act or not.
 *
 * The point of this feature is one number the app couldn't produce before: the
 * floor under your spending. Ten subscriptions at "only" €8-25 each is €190 a
 * month that nobody decides to spend, they just keep paying.
 *
 * IMPORTANT: nothing here is money that has moved. Subscriptions are a forecast
 * of charges; the charges themselves arrive as ordinary transactions and are
 * counted there. Adding both to a spending total would double count.
 */

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";

export const CADENCES: { value: Cadence; label: string; perYear: number }[] = [
  { value: "weekly", label: "Weekly", perYear: 52 },
  { value: "monthly", label: "Monthly", perYear: 12 },
  { value: "quarterly", label: "Quarterly", perYear: 4 },
  { value: "yearly", label: "Yearly", perYear: 1 },
];

const PER_YEAR: Record<Cadence, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export function isCadence(value: string): value is Cadence {
  return value in PER_YEAR;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  cadence: Cadence;
  active: boolean;
  nextChargeAt: Date | null;
  accountId: string | null;
  categoryId: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cost per year in the subscription's own currency.
 *
 * Weekly is 52 payments, not 48: "monthly × 12" and "weekly × 4" disagree by
 * almost a month of charges a year, and the larger figure is the true one.
 */
export function yearlyCost(s: Pick<Subscription, "amount" | "cadence">): number {
  return round2(s.amount * PER_YEAR[s.cadence]);
}

/** Cost per month, averaged. A yearly bill still occupies a twelfth each month. */
export function monthlyCost(s: Pick<Subscription, "amount" | "cadence">): number {
  return round2(yearlyCost(s) / 12);
}

export interface SubscriptionTotals {
  monthly: number;
  yearly: number;
  activeCount: number;
  inactiveCount: number;
  /** Currencies present that had no exchange rate, so were left out. */
  unconverted: string[];
}

/**
 * Adds up active subscriptions, converting to one currency.
 *
 * `convert` returns null when no rate exists. Those are excluded and named
 * rather than counted at face value — silently treating 20 USD as 20 EUR is the
 * kind of quiet wrongness this app has already been bitten by.
 */
export function totals(
  subs: Subscription[],
  convert: (amount: number, currency: string) => number | null
): SubscriptionTotals {
  let monthly = 0;
  const unconverted = new Set<string>();
  let activeCount = 0;
  let inactiveCount = 0;

  for (const s of subs) {
    if (!s.active) {
      inactiveCount++;
      continue;
    }
    activeCount++;
    const converted = convert(monthlyCost(s), s.currency);
    if (converted === null) unconverted.add(s.currency);
    else monthly += converted;
  }

  return {
    monthly: round2(monthly),
    yearly: round2(monthly * 12),
    activeCount,
    inactiveCount,
    unconverted: [...unconverted].sort(),
  };
}

/**
 * Rolls an anchor date forward until it is not in the past.
 *
 * A subscription set up months ago should say "next charge on the 3rd", not
 * show a date from March. Month arithmetic clamps: the 31st in a 30-day month
 * becomes the 30th rather than spilling into the next month, which is what
 * card issuers actually do.
 */
export function nextCharge(anchor: Date | null, cadence: Cadence, today: Date): Date | null {
  if (!anchor || Number.isNaN(anchor.getTime())) return null;

  const next = new Date(anchor.getTime());
  // Compare by day, so a charge due today still reads as today.
  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  /**
   * The day the anchor names, kept apart from the date being walked.
   *
   * This used to read the day off `next` on every pass, so the first short
   * month destroyed the intent: a payment on the 31st clamped to 28 February
   * and then stayed on the 28th for March, April and May, which have a 31st.
   * Clamping is per month; the day being clamped is a property of the anchor.
   */
  const anchorDay = anchor.getDate();

  let guard = 0;
  while (next < floor && guard++ < 1000) {
    if (cadence === "weekly") {
      next.setDate(next.getDate() + 7);
    } else {
      const months = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;
      next.setDate(1);
      next.setMonth(next.getMonth() + months);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(anchorDay, lastDay));
    }
  }
  return next;
}

/** Days until the next charge. Negative never happens — nextCharge rolls forward. */
export function daysUntil(next: Date | null, today: Date): number | null {
  if (!next) return null;
  const a = Date.UTC(next.getFullYear(), next.getMonth(), next.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

/**
 * Most expensive first, so the list opens on the ones worth cancelling.
 *
 * Sorted by yearly cost rather than the charge amount: €25/month costs far more
 * than €99/year, but sorting on the raw amount puts the €99 on top.
 */
export function byAnnualCost(subs: Subscription[]): Subscription[] {
  return [...subs].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return yearlyCost(b) - yearlyCost(a);
  });
}
