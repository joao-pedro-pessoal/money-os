/** Validate a manual amount without interpreting ambiguous thousands separators. */
export function manualAmount(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error("Enter a positive amount with at most two decimal places.");
  }
  return Number(normalized).toFixed(2);
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
