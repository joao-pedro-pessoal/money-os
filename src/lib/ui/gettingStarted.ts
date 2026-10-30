/** Progress is derived from existing owned records; it never writes financial data. */
export function gettingStartedProgress(counts: { accounts: number; transactions: number; budgets: number; goals: number }) {
  const account = counts.accounts > 0;
  const transaction = counts.transactions > 0;
  const plan = counts.budgets > 0 || counts.goals > 0;
  return { account, transaction, plan, complete: account && transaction && plan };
}
