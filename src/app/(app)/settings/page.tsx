import { listCategories, createCategory, deleteCategory } from "@/actions/transactions";
import { listRates, refreshRatesAction, setManualRate, unpinRate } from "@/actions/fx";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { getBaseCurrency, setBaseCurrency } from "@/actions/settings";
import { listAccountsWithState } from "@/actions/accounts";
import BackupPanel from "@/components/BackupPanel";
import { restoreBackup } from "@/actions/export";
import CsvImportForm from "@/components/CsvImportForm";
import ThemePicker from "@/components/ThemePicker";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

async function restoreBackupAction(formData: FormData) {
  "use server";
  await restoreBackup(formData);
}

export default async function SettingsPage() {
  const [categories, accounts, rates, baseCurrency] = await Promise.all([
    listCategories(),
    listAccountsWithState(),
    listRates(),
    getBaseCurrency(),
  ]);
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Base currency</div>
        <form action={setBaseCurrency} className="flex gap-2">
          <select name="baseCurrency" className="input" defaultValue={baseCurrency}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn whitespace-nowrap">
            Save
          </button>
        </form>
        <p className="text-xs text-[var(--muted)] mt-2">
          Every total in the app is converted to this currency. Individual accounts keep their own currency —
          only the summed figures change.
        </p>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-sm font-medium">Exchange rates</div>
            <div className="text-xs text-[var(--muted)] mt-1">
              Base currency is {baseCurrency}. Rates are per 1 {baseCurrency} and refresh automatically;
              a rate you set by hand is kept and never overwritten.
            </div>
          </div>
          <form action={refreshRatesAction}>
            <button type="submit" className="btn whitespace-nowrap">
              Refresh rates
            </button>
          </form>
        </div>

        {rates.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-4 text-center">
            No rates yet — hit &quot;Refresh rates&quot;, or set one by hand below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th className="text-right">Per 1 {baseCurrency}</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.quote}</td>
                    <td className="text-right">{Number(r.rate)}</td>
                    <td>
                      {r.manual ? (
                        <span className="badge border border-[var(--accent)] text-[var(--accent)]">manual</span>
                      ) : (
                        <span className="text-[var(--muted)]">{r.source ?? "auto"}</span>
                      )}
                    </td>
                    <td className="text-xs text-[var(--muted)]">
                      {new Date(r.fetchedAt).toLocaleString("pt-PT")}
                    </td>
                    <td className="text-right">
                      {r.manual && (
                        <form action={unpinRate}>
                          <input type="hidden" name="quote" value={r.quote} />
                          <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                            Use automatic
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={setManualRate} className="flex gap-2 mt-4 max-w-md">
          <input name="quote" placeholder="Currency (e.g. USD)" className="input" required />
          <input
            name="rate"
            type="number"
            step="0.0001"
            placeholder={`Units per 1 ${baseCurrency}`}
            className="input"
            required
          />
          <button type="submit" className="btn whitespace-nowrap">
            Pin rate
          </button>
        </form>
      </div>

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
        <BackupPanel restoreAction={restoreBackupAction} />
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
