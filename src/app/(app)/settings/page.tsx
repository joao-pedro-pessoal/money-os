import { listCategories } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import ExportButton from "@/components/ExportButton";
import CsvImportForm from "@/components/CsvImportForm";

export default async function SettingsPage() {
  const [categories, accounts] = await Promise.all([listCategories(), listAccountsWithState()]);
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

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
          <ul className="text-sm text-[var(--muted)] space-y-1">
            {income.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium mb-2">Expense categories</div>
          <ul className="text-sm text-[var(--muted)] space-y-1">
            {expense.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
