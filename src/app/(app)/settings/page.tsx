import { listCategories, createCategory, deleteCategory } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import ExportButton from "@/components/ExportButton";
import CsvImportForm from "@/components/CsvImportForm";
import ThemePicker from "@/components/ThemePicker";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export default async function SettingsPage() {
  const [categories, accounts] = await Promise.all([listCategories(), listAccountsWithState()]);
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Appearance</div>
        <ThemePicker />
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Import CSV</div>
        <CsvImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-2">Backup</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          You should never be locked into this app to access your own data.
        </p>
        <ExportButton />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-2">Income categories</div>
          <ul className="text-sm space-y-1 mb-3">
            {income.map((c) => (
              <li key={c.id} className="flex justify-between items-center text-[var(--muted)]">
                <span>{c.name}</span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmitButton
                    label="Remove"
                    confirmMessage={`Remove category "${c.name}"? Existing transactions keep their amount, just lose this category.`}
                  />
                </form>
              </li>
            ))}
          </ul>
          <form action={createCategory} className="flex gap-2">
            <input type="hidden" name="kind" value="income" />
            <input name="name" placeholder="New income category" className="input" required />
            <button type="submit" className="btn whitespace-nowrap">
              Add
            </button>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-2">Expense categories</div>
          <ul className="text-sm space-y-1 mb-3">
            {expense.map((c) => (
              <li key={c.id} className="flex justify-between items-center text-[var(--muted)]">
                <span>{c.name}</span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmitButton
                    label="Remove"
                    confirmMessage={`Remove category "${c.name}"? Existing transactions keep their amount, just lose this category.`}
                  />
                </form>
              </li>
            ))}
          </ul>
          <form action={createCategory} className="flex gap-2">
            <input type="hidden" name="kind" value="expense" />
            <input name="name" placeholder="New expense category" className="input" required />
            <button type="submit" className="btn whitespace-nowrap">
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
