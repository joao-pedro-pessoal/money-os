import { listTransactions, createTransaction, createTransfer, listCategories, deleteTransaction } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";
import { getDefaultAccountId } from "@/actions/settings";

export default async function TransactionsPage() {
  const [txs, accounts, categories, defaultAccountId] = await Promise.all([
    listTransactions(200),
    listAccountsWithState(),
    listCategories(),
    getDefaultAccountId(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Importing is an action on this page's data, not a place of its own —
          it used to sit in the sidebar between two destinations. */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-semibold">Cash Flow</h1>
        <Link href="/import" className="btn whitespace-nowrap">
          Import statement
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Add income / expense</div>
          <form action={createTransaction} className="space-y-3">
            {/* Starts on the account you said you use most — physical cash,
                usually, since that is the one no connector fills in. Picking it
                from a list every time is friction on the one screen where
                friction decides whether the app gets used. */}
            <select
              name="accountId"
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
              <th></th>
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
                <td className="whitespace-nowrap">
                  {t.type !== "transfer" && (
                    <Link href={`/transactions/${t.id}/edit`} className="text-xs text-[var(--accent)] hover:underline mr-3">
                      Edit
                    </Link>
                  )}
                  <form action={deleteTransaction} className="inline">
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmSubmitButton
                      label="Delete"
                      confirmMessage={
                        t.type === "transfer"
                          ? "Delete this transfer? Both legs will be removed and both account balances reversed."
                          : "Delete this transaction? The account balance will be adjusted back."
                      }
                    />
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
