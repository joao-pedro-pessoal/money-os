/**
 * What a debt costs, and how long it lasts.
 *
 * Two questions a balance alone cannot answer: what owing this is costing you
 * right now, and whether what you pay each month will ever clear it.
 *
 * Pure — no DB, no dates from the clock.
 */

export const LIABILITY_KINDS = [
  { value: "mortgage", label: "Mortgage" },
  { value: "credit_card", label: "Credit card" },
  { value: "personal_loan", label: "Personal loan" },
  { value: "car_loan", label: "Car loan" },
  { value: "student", label: "Student loan" },
  { value: "tax", label: "Tax owed" },
  { value: "other", label: "Other" },
] as const;

export function liabilityLabel(kind: string): string {
  return LIABILITY_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/**
 * What this month of owing costs, before any repayment.
 *
 * Null when no rate is recorded — not zero. A debt whose rate you have not
 * entered is not an interest-free debt, and showing 0,00 € would say it is.
 * That distinction is the same one the rest of this app makes everywhere: an
 * absence is not a measurement.
 */
export function monthlyInterest(balance: number, apr: number | null): number | null {
  if (apr === null || !Number.isFinite(apr)) return null;
  if (balance <= 0) return 0;
  return Math.round(((balance * (apr / 100)) / 12 + Number.EPSILON) * 100) / 100;
}

/**
 * Months to clear the balance at a fixed monthly payment.
 *
 * Null when it never clears, which is the answer worth having. A payment at or
 * below the monthly interest leaves the balance flat or growing however long
 * you keep paying — the minimum-payment trap — and returning a very large
 * number instead would dress that up as "a long time" when it is "never".
 */
export function payoffMonths(
  balance: number,
  apr: number | null,
  monthlyPayment: number | null
): number | null {
  if (monthlyPayment === null || monthlyPayment <= 0 || balance <= 0) return null;

  // No rate recorded: treat it as interest-free for this projection only, and
  // it is the caller's job to note that the rate is unknown.
  const rate = apr === null ? 0 : apr / 100 / 12;
  if (rate === 0) return Math.ceil(balance / monthlyPayment);

  const interestOnly = balance * rate;
  if (monthlyPayment <= interestOnly) return null;

  // Standard amortisation, solved for n.
  const months = Math.log(monthlyPayment / (monthlyPayment - interestOnly)) / Math.log(1 + rate);
  return Number.isFinite(months) ? Math.ceil(months) : null;
}

/** "3 years, 2 months" reads better than "38" wherever it fits. */
export function describeMonths(months: number | null): string {
  if (months === null) return "never at this payment";
  if (months < 1) return "this month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return rest === 0 ? y : `${y}, ${rest} month${rest === 1 ? "" : "s"}`;
}

export interface PayoffComparison {
  /** Total interest paid over the life of the debt. */
  totalInterest: number;
  months: number;
}

/**
 * What the whole debt will have cost by the time it is gone.
 *
 * The figure that changes minds. A balance of 12 000 at 7% paid at 200 a month
 * is not a 12 000 debt — it is 12 000 plus a little over 4 000 of interest, and
 * nothing on a balance sheet says so.
 */
export function totalCost(
  balance: number,
  apr: number | null,
  monthlyPayment: number | null
): PayoffComparison | null {
  const months = payoffMonths(balance, apr, monthlyPayment);
  if (months === null || monthlyPayment === null) return null;

  // The last payment is usually smaller than the rest; taking the balance off
  // the total paid handles that without simulating every month.
  const paid = months * monthlyPayment;
  const interest = Math.max(0, paid - balance);
  return {
    totalInterest: Math.round((interest + Number.EPSILON) * 100) / 100,
    months,
  };
}
