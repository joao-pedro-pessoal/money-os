import { textForRequest } from "@/actions/pageLanguage";
import { listTransactions, createTransaction, createTransfer, listCategories, deleteTransaction } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import TransactionList from "@/components/TransactionList";
import Link from "next/link";
import { getDefaultAccountId } from "@/actions/settings";
import PurchaseSavingsFields from '@/components/PurchaseSavingsFields';
import MobileFold from "@/components/MobileFold";
import { localDay } from "@/lib/calendar/localDay";

export default async function TransactionsPage() {
  const uiText = await textForRequest();
  const [txData, accounts, categories, defaultAccountId] = await Promise.all([
    listTransactions(200),
    listAccountsWithState(),
    listCategories(),
    getDefaultAccountId(),
  ]);

  const today = localDay();

  return (
    <div className="cash-flow-page space-y-8">
      {/* Importing is an action on this page's data, not a place of its own —
          it used to sit in the sidebar between two destinations. */}
      <div className="transaction-page-header flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{uiText("Cash Flow")}</h1>
          <p className="cash-flow-phone-only text-xs text-[var(--muted)] mt-1">{uiText("See what comes in, what goes out, and where it went.")}</p>
        </div>
        <div className="cash-flow-header-actions flex gap-2 flex-wrap">
        <Link href="/savings" className="btn">{uiText("Savings / cashback")}</Link>
        <Link href="/import" className="btn whitespace-nowrap">{uiText("Import statement")}</Link>
        </div>
      </div>

      <MobileFold title="Add a transaction or transfer" persistKey="add-forms">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">{uiText("Add income / expense")}</div>
          <form action={createTransaction} className="space-y-3">
            {/* Starts on the account you said you use most — physical cash,
                usually, since that is the one no connector fills in. Picking it
                from a list every time is friction on the one screen where
                friction decides whether the app gets used. */}
            <select
              name="accountId"
              aria-label={uiText("Account")}
              className="input"
              required
              defaultValue={defaultAccountId ?? ""}
            >
              {accounts.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="type" aria-label={uiText("Transaction type")} className="input">
              <option value="expense">{uiText("Expense")}</option>
              <option value="income">{uiText("Income")}</option>
              <option value="investment_contribution">{uiText("Long-Term Investment Contribution")}</option>
            </select>
            <select name="categoryId" aria-label={uiText("Category")} className="input">
              <option value="">{uiText("No category")}</option>
              {categories.map((c) => (
                <option translate="no" key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Amount")}</span>
              <input name="amount" aria-label={uiText("Amount")} type="number" step="0.01" placeholder={uiText("Amount")} className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Date")}</span>
              <input name="date" aria-label={uiText("Date")} type="date" defaultValue={today} className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Description (optional)")}</span>
              <input name="description" aria-label={uiText("Description")} placeholder={uiText("Description")} className="input" />
            </label>
            <PurchaseSavingsFields />
            <button type="submit" className="btn w-full">
              <span className="cash-flow-phone-only">{uiText("Save transaction")}</span><span className="cash-flow-desktop-only">{uiText("Add")}</span>
            </button>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">{uiText("Internal transfer")}</div>
          <p className="text-xs text-[var(--muted)] mb-3">{uiText("Between your own accounts. Never counts as income/expense, never changes Net Worth.")}</p>
          <form action={createTransfer} className="space-y-3">
            <select name="fromAccountId" aria-label={uiText("From account")} className="input" required>
              {accounts.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="toAccountId" aria-label={uiText("To account")} className="input" required>
              {accounts.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Amount")}</span>
              <input name="amount" aria-label={uiText("Amount")} type="number" step="0.01" placeholder={uiText("Amount")} className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Date")}</span>
              <input name="date" aria-label={uiText("Date")} type="date" defaultValue={today} className="input" required />
            </label>
            <label className="block text-xs text-[var(--muted)]"><span className="cash-flow-phone-only">{uiText("Description (optional)")}</span>
              <input name="description" aria-label={uiText("Description (optional)")} placeholder={uiText("Description (optional)")} className="input" />
            </label>
            <button type="submit" className="btn w-full">
              <span className="cash-flow-phone-only">{uiText("Save transfer")}</span><span className="cash-flow-desktop-only">{uiText("Transfer")}</span>
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
