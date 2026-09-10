/**
 * How much to trust a reconstructed valuation.
 *
 * This exists because of a specific failure mode, and it is the one real
 * weakness of valuing a portfolio from a statement plus live prices:
 *
 *   **a fresh price multiplied by a stale quantity looks current and isn't.**
 *
 * The price arrives automatically every day. The quantity only changes when a
 * new statement is imported. Buy more shares and tell nobody, and the app keeps
 * confidently reporting yesterday's holdings at today's prices — an answer that
 * is wrong in a way no amount of care elsewhere in the code can detect, because
 * every number in it is individually correct.
 *
 * So staleness is a first-class output here, not a footnote. A valuation this
 * module calls `stale` must be shown as stale.
 *
 * Pure — no DB, no I/O.
 */

/**
 * A month plus slack.
 *
 * Someone contributing monthly is, at the moment before the next contribution,
 * about 31 days past their last transaction — with nothing wrong. Anything
 * inside this window is as current as a monthly investor's data ever gets.
 */
export const FRESH_QUANTITY_DAYS = 35;

/**
 * Beyond a quarter, a monthly investor has missed at least two contributions,
 * so the holdings are wrong rather than merely old.
 */
export const STALE_QUANTITY_DAYS = 95;

/**
 * Prices older than this stop being "today's". Covers a long weekend plus a
 * public holiday, which is the normal longest gap between trading days.
 */
export const FRESH_PRICE_DAYS = 5;

export type Trust = "current" | "aging" | "stale" | "unknown";

export interface StalenessInput {
  /** The most recent transaction in the imported statement. */
  lastEventDate: Date | null;
  /** When the prices were taken. Null when nothing is priced. */
  priceAsOf: Date | null;
  /** Now. A parameter so this is testable rather than clock-dependent. */
  asOf: Date;
  /**
   * The last time money was seen moving in the account by some *other* route —
   * an open-banking cash feed, a connector sync, a manual balance edit.
   *
   * This is the whole reason to bother with a PSD2 cash connection for a broker
   * whose positions it cannot see. Cash leaving after the last statement row
   * means something was probably bought, which means the reconstruction is out
   * of date, which is the one thing the statement can never tell you about
   * itself.
   */
  cashActivityAfter?: Date | null;
}

export interface StalenessVerdict {
  trust: Trust;
  /** Days between the last transaction and now. Null when there are none. */
  quantityAgeDays: number | null;
  /** Days between the price and now. Null when nothing is priced. */
  priceAgeDays: number | null;
  /**
   * Whether a market value can be produced at all — i.e. whether there are
   * prices. False means show the cost basis instead: a real number about the
   * past beats no number at all.
   *
   * Deliberately *not* a verdict on whether the total is any good. That is
   * `trust`, and the two are separate because a stale total should still be
   * shown — clearly marked — rather than hidden. Hiding it invites the guess
   * that replaces it, and a guess is worse than a labelled stale figure.
   */
  canValue: boolean;
  /** One line for the top of the screen. */
  headline: string;
  /** Every separate reason, so the user can act on the right one. */
  warnings: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants; negative when `later` precedes `earlier`. */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

export function assessStaleness(input: StalenessInput): StalenessVerdict {
  const warnings: string[] = [];

  if (input.lastEventDate === null) {
    return {
      trust: "unknown",
      quantityAgeDays: null,
      priceAgeDays: null,
      canValue: false,
      headline: "No statement imported yet, so there is nothing to value.",
      warnings: ["Import the broker's transaction export to reconstruct what you hold."],
    };
  }

  const quantityAgeDays = Math.max(0, daysBetween(input.lastEventDate, input.asOf));
  const priceAgeDays =
    input.priceAsOf === null ? null : Math.max(0, daysBetween(input.priceAsOf, input.asOf));

  // Movement after the last known transaction outranks the calendar. Three days
  // old and already wrong beats sixty days old and still right.
  const movedSince =
    input.cashActivityAfter !== null &&
    input.cashActivityAfter !== undefined &&
    input.cashActivityAfter.getTime() > input.lastEventDate.getTime();

  let trust: Trust;
  if (movedSince) {
    trust = "stale";
    warnings.push(
      "Money moved in this account after the last imported transaction, so shares may have been bought that this doesn't know about. Export the statement again."
    );
  } else if (quantityAgeDays > STALE_QUANTITY_DAYS) {
    trust = "stale";
    warnings.push(
      `The last transaction here is ${quantityAgeDays} days old. If you have invested since, these quantities are wrong.`
    );
  } else if (quantityAgeDays > FRESH_QUANTITY_DAYS) {
    trust = "aging";
    warnings.push(
      `The last transaction here is ${quantityAgeDays} days old — worth a fresh export if you contribute monthly.`
    );
  } else {
    trust = "current";
  }

  if (priceAgeDays === null) {
    warnings.push("No prices available, so only what you paid can be shown.");
  } else if (priceAgeDays > FRESH_PRICE_DAYS) {
    warnings.push(`Prices are ${priceAgeDays} days old.`);
    // Old prices degrade the verdict but never rescue it: quantities being
    // wrong is the worse fault and must not be masked by a price complaint.
    if (trust === "current") trust = "aging";
  }

  return {
    trust,
    quantityAgeDays,
    priceAgeDays,
    // `trust` cannot be "unknown" here — that path returned above, when there
    // was no statement at all.
    canValue: priceAgeDays !== null,
    headline: headlineFor(trust, quantityAgeDays, priceAgeDays),
    warnings,
  };
}

function headlineFor(
  trust: Trust,
  quantityAgeDays: number,
  priceAgeDays: number | null
): string {
  if (priceAgeDays === null) return "Showing what you paid — no prices available.";

  switch (trust) {
    case "current":
      return priceAgeDays === 0
        ? "Quantities from your statement, priced today."
        : `Quantities from your statement, priced ${priceAgeDays} day${priceAgeDays === 1 ? "" : "s"} ago.`;
    case "aging":
      return `Quantities are ${quantityAgeDays} days old. Treat the total as approximate.`;
    case "stale":
      return "These quantities are out of date — the total below is not what you hold.";
    case "unknown":
      return "Nothing to value yet.";
  }
}

/** Label and colour for the verdict. Kept beside the rules that produce it. */
export function trustLabel(trust: Trust): { label: string; tone: "good" | "warn" | "bad" } {
  switch (trust) {
    case "current":
      return { label: "Up to date", tone: "good" };
    case "aging":
      return { label: "Getting old", tone: "warn" };
    case "stale":
      return { label: "Out of date", tone: "bad" };
    case "unknown":
      return { label: "No data", tone: "warn" };
  }
}

/**
 * When the next export is due, for someone who contributes on a cadence.
 *
 * Returns null when there is no statement yet — there's nothing to be due
 * *again*. `overdue` is what a reminder should fire on.
 */
export function nextExportDue(
  lastEventDate: Date | null,
  asOf: Date,
  cadenceDays = 30
): { due: Date; overdue: boolean; daysUntil: number } | null {
  if (lastEventDate === null) return null;

  const due = new Date(lastEventDate.getTime() + cadenceDays * DAY_MS);
  const daysUntil = daysBetween(asOf, due);

  return { due, overdue: daysUntil < 0, daysUntil };
}
