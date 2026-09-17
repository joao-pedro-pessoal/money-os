import { listTransactions, createTransaction, createTransfer, listCategories, deleteTransaction } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import TransactionList from "@/components/TransactionList";
import Link from "next/link";
import { getDefaultAccountId } from "@/actions/settings";
import PurchaseSavingsFields from '@/components/PurchaseSavingsFields';
import MobileFold from "@/components/MobileFold";

export default async function TransactionsPage() {
  const [txData, accounts, categories, defaultAccountId] = await Promise.all([
    listTransactions(200),
    listAccountsWithState(),
    listCategories(),
    getDefaultAccountId(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="cash-flow-page space-y-8">
      {/* Importing is an action on this page's data, not a place of its own —
          it used to sit in the sidebar between two destinations. */}
      <div className="transaction-page-header flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Cash Flow</h1>
          <p className="cash-flow-phone-only text-xs text-[var(--muted)] mt-1">See what comes in, what goes out, and where it went.</p>
        </div>
        <div className="cash-flow-header-actions flex gap-2 flex-wrap">
        <Link href="/savings" className="btn">Savings / cashback</Link>
        <Link href="/import" className="btn whitespace-nowrap">
          Import statement
        </Link>
        </div>
      </div>

      <MobileFold title="Add a transaction or transfer" persistKey="add-forms">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Add income / expense</div>
          <form action={createTransaction} className="space-y-3">
            {/* Starts on the account you said you use most — physical cash,
                usually, since that is the one no connector fills in. Picking it
                from a list every time is friction on the one screen where
                friction decides whether the app gets used. */}
            <select
              name="accountId"
              aria-label="Account"
              className="input"
              required
              defaultValue={defaultAccountId ?? ""}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="type" aria-label="Transaction type" className="input">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="investment_contribution">Long-Term Investment Contribution</option>
            </select>
            <select name="categoryId" aria-label="Category" className="input">
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">Amount</span>
              <input name="amount" aria-label="Amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">Date</span>
              <input name="date" aria-label="Date" type="date" defaultValue={today} className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">Description (optional)</span>
              <input name="description" aria-label="Description" placeholder="Description" className="input" />
            </label>
            <PurchaseSavingsFields />
            <button type="submit" className="btn w-full">
              <span className="cash-flow-phone-only">Save transaction</span><span className="cash-flow-desktop-only">Add</span>
            </button>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Internal transfer</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Between your own accounts. Never counts as income/expense, never changes Net Worth.
          </p>
          <form action={createTransfer} className="space-y-3">
            <select name="fromAccountId" aria-label="From account" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="toAccountId" aria-label="To account" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">Amount</span>
              <input name="amount" aria-label="Amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">Date</span>
              <input name="date" aria-label="Date" type="date" defaultValue={today} className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">Description (optional)</span>
              <input name="description" aria-label="Description (optional)" placeholder="Description (optional)" className="input" />
            </label>
            <button type="submit" className="btn w-full">
              <span className="cash-flow-phone-only">Save transfer</span><span className="cash-flow-desktop-only">Transfer</span>
            </button>
          </form>
        </div>
      </div>
      </MobileFold>

      <TransactionList
        rows={txData.rows}
        currency={txData.baseCurrency}
        approximate={txData.approximate}
        unconverted={txData.unconverted}
        deleteAction={deleteTransaction}
      />
    </div>
  );
}
