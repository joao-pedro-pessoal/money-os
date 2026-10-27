/** Decimal input for manual positions, matching the stored quantity/price precision. */
export function manualPositionQuantity(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const amount = Number(normalized);
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(normalized) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a positive quantity with at most eight decimal places.");
  }
  return amount;
}

/** Zero is valid only when explicitly entered: a worthless holding is possible. */
export function manualPositionPrice(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const amount = Number(normalized);
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(normalized) || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter zero or a positive price with at most four decimal places.");
  }
  return amount;
}
