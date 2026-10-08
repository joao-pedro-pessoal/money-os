/** Validate a manual amount without interpreting ambiguous thousands separators. */
export function manualAmount(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error("Enter a positive amount with at most two decimal places.");
  }
  return Number(normalized).toFixed(2);
}

/**
 * An account's balance as typed: zero and overdrawn are real balances, so
 * unlike `manualAmount` it takes a sign and 0. Left empty, it is refused rather
 * than read as zero — an account whose balance nobody gave is not an empty
 * one — and the database used to refuse it instead, with a numeric-syntax error
 * the person adding their first account could do nothing with.
 */
export function manualBalance(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Write the account's balance today, with at most two decimal places. 0 if it is empty.");
  }
  const amount = Number(normalized);
  return (Object.is(amount, -0) ? 0 : amount).toFixed(2);
}

export function manualDate(value: string): Date {
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Choose a valid date.");
  }
  return date;
}

export function isQuickEntryId(value: string): boolean {
  return /^quick-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type QuickEntryOptions = {
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string; kind: string }[];
  defaultAccountId: string | null;
};
