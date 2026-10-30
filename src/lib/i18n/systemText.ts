import { sourceText, type TextTranslator } from "./text";

const reconciliation = new Set([
  "Expense (reconciliation)", "Income (reconciliation)", "Deposit (reconciliation)",
  "Withdrawal (reconciliation)", "Interest (reconciliation)",
]);

/** Only exact, known system descriptions; personal notes are never translated. */
export function transactionDescription(description: string | null | undefined, translate: TextTranslator = sourceText): string {
  return description && reconciliation.has(description) ? translate(description) : description ?? "";
}

export function transactionTypeLabel(type: string, translate: TextTranslator = sourceText): string {
  const labels: Record<string, string> = { income: "Income", expense: "Expense", transfer: "Internal transfer", investment_contribution: "Investment contribution" };
  return Object.hasOwn(labels, type) ? translate(labels[type]) : type;
}

export function subscriptionCountText(count: number, active: boolean, translate: TextTranslator = sourceText): string {
  return translate(active
    ? count === 1 ? "{count} active subscription" : "{count} active subscriptions"
    : count === 1 ? "{count} cancelled subscription" : "{count} cancelled subscriptions", { count });
}
