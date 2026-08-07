import { listTransactions, createTransaction, createTransfer, listCategories } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";

export default async function TransactionsPage() {
  const [txs, accounts, categories] = await Promise.all([
    listTransactions(200),
    listAccountsWithState(),
    listCategories(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Cash Flow</h1>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Add income / expense</div>
          <form action={createTransaction} className="space-y-3">
            <select name="accountId" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="type" className="input">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="investment_contribution">Long-Term Investment Contribution</option>
            </select>
            <select name="categoryId" className="input">
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            <input name="date" type="date" defaultValue={today} className="input" required />
            <input name="description" placeholder="Description" className="input" />
            <button type="submit" className="btn w-full">
              Add
            </button>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Internal transfer</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Between your own accounts. Never counts as income/expense, never changes Net Worth.
          </p>
          <form action={createTransfer} className="space-y-3">
            <select name="fromAccountId" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="toAccountId" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            <input name="date" type="date" defaultValue={today} className="input" required />
            <input name="description" placeholder="Description (optional)" className="input" />
            <button type="submit" className="btn w-full">
              Transfer
            </button>
          </form>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Transactions</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleDateString("pt-PT")}</td>
                <td>{t.accountName}</td>
                <td>{t.categoryName ?? t.type}</td>
                <td>{t.description || t.merchant}</td>
                <td>
                  <Money value={Number(t.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
