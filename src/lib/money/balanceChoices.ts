import { manualBalance } from "./manualEntry";

export type BalanceDirection = "up" | "down" | "same";

/** Mirror the amount parser: malformed or incomplete input makes no direction claim. */
export function balanceDirection(current: number, typed: string): BalanceDirection {
  let entered: number;
  try { entered = Number(manualBalance(typed)); } catch { return "same"; }
  return entered === current ? "same" : entered > current ? "up" : "down";
}

const choices = [
  { value: "correction", label: "Correction (no cash-flow impact)", when: ["same", "up", "down"] },
  { value: "income", label: "Income", when: ["same", "up"] },
  { value: "interest", label: "Interest", when: ["same", "up"] },
  { value: "deposit", label: "Deposit", when: ["same", "up"] },
  { value: "expense", label: "Expense", when: ["same", "down"] },
  { value: "withdrawal", label: "Withdrawal", when: ["same", "down"] },
] as const;

/** The server remains responsible for authorising and validating the actual change. */
export function balanceChoices(direction: BalanceDirection) {
  return choices.filter(choice => (choice.when as readonly BalanceDirection[]).includes(direction));
}
