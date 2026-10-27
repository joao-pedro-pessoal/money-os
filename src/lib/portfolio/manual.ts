/** Expected manual-input failures may be shown to the person editing a position. */
export class HoldingInputError extends Error {}

/** Decimal input for manual positions, matching the stored quantity/price precision. */
export function manualPositionQuantity(value: string, allowZero = false): number {
  const normalized = value.trim().replace(",", ".");
  const amount = Number(normalized);
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(normalized) || !Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new HoldingInputError(allowZero
      ? "Enter zero or a positive quantity with at most eight decimal places."
      : "Enter a positive quantity with at most eight decimal places.");
  }
  return amount;
}

/** Zero is valid only when explicitly entered: a worthless holding is possible. */
export function manualPositionPrice(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const amount = Number(normalized);
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(normalized) || !Number.isFinite(amount) || amount < 0) {
    throw new HoldingInputError("Enter zero or a positive price with at most four decimal places.");
  }
  return amount;
}

/** An optional signed annual yield; blank remains unknown, invalid is refused. */
export function manualPositionRate(value: string): string | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d{1,4}(?:\.\d{1,4})?$/.test(normalized)) {
    throw new HoldingInputError("Enter a valid annual interest rate.");
  }
  return normalized;
}
