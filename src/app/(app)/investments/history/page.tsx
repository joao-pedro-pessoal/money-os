import { listAccountsWithState } from "@/actions/accounts";
import {
  listInvestmentActivity,
  undoInvestmentActivityImport,
} from "@/actions/investmentActivity";
import { getBaseCurrency } from "@/actions/settings";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import InvestmentActivityImporter from "@/components/InvestmentActivityImporter";

const amountClass = (amount: number) =>
  amount > 0 ? "text-[var(--green)]" : amount < 0 ? "text-[var(--red)]" : "text-[var(--accent)]";

export default async function InvestmentHistoryPage() {
  const [accounts, data, baseCurrency] = await Promise.all([
    listAccountsWithState(),
    listInvestmentActivity(),
    getBaseCurrency(),
  ]);
  const investmentAccounts = accounts.filter((account) =>
    ["broker", "exchange", "investment"].includes(account.accountType.toLowerCase())
  );
  const selectableAccounts = investmentAccounts.length > 0 ? investmentAccounts : accounts;

  const byCurrency = new Map<string, number>();
  for (const row of data.activity) {
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + Number(row.amount));
  }
  const distributions = data.activity.filter((row) => row.type === "DIVIDEND" || row.type === "INTEREST").length;
  const realizedLabel = data.realizedByCurrency.length
    ? data.realizedByCurrency.map((item) => `${item.value.toFixed(2)} ${item.currency}`).join(" · ")
    : "—";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-lg font-semibold">Account history</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl">
          Import a broker or exchange statement to keep trades, dividends, fees, deposits, withdrawals,
          expenses, taxes and other account events together. Existing files and rows are detected before import.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3"><div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Events</div><div className="text-xl font-semibold mt-1">{data.activity.length}</div></div>
        <div className="card p-3"><div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Trades</div><div className="text-xl font-semibold mt-1">{data.activity.filter((row) => row.type === "BUY" || row.type === "SELL").length}</div></div>
        <div className="card p-3"><div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Distributions</div><div className="text-xl font-semibold mt-1">{distributions}</div></div>
        <div className="card p-3"><div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Realized P&amp;L</div><div className="text-xs font-medium mt-1">{realizedLabel}</div></div>
        <div className="card p-3"><div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">Net cash by currency</div><div className="text-xs font-medium mt-1">{byCurrency.size ? [...byCurrency].map(([currency, value]) => `${value.toFixed(2)} ${currency}`).join(" · ") : "—"}</div></div>
      </div>

      <InvestmentActivityImporter
        accounts={selectableAccounts.map((account) => ({ id: account.id, name: account.name, currency: account.currency }))}
        baseCurrency={baseCurrency}
      />

      {data.activity.length > 0 ? (
        <section className="card p-4">
          <h2 className="text-sm font-medium">All account activity</h2>
          <div className="overflow-auto max-h-[36rem] mt-3">
            <table className="data-table whitespace-nowrap text-xs">
              <thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Asset</th><th>Description</th><th className="text-right">Quantity</th><th className="text-right">Price</th><th className="text-right">Net amount</th><th className="text-right">Realized P&amp;L</th></tr></thead>
              <tbody>{data.activity.map((row) => {
                const amount = Number(row.amount);
                return <tr key={row.id}><td>{new Date(row.date).toLocaleDateString("pt-PT")}</td><td>{row.accountName}</td><td>{row.type}</td><td>{row.symbol ?? "—"}</td><td className="max-w-64 truncate">{row.description ?? "—"}</td><td className="text-right">{row.quantity ?? "—"}</td><td className="text-right">{row.price ? `${row.price} ${row.currency}` : "—"}</td><td className={`text-right ${amountClass(amount)}`}>{amount.toFixed(2)} {row.currency}</td><td className={`text-right ${row.realizedPnl === null ? "text-[var(--muted)]" : amountClass(row.realizedPnl)}`}>{row.realizedPnl === null ? "—" : `${row.realizedPnl.toFixed(2)} ${row.currency}`}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.imports.length > 0 ? (
        <section className="card p-4">
          <h2 className="text-sm font-medium">Import history</h2>
          <p className="text-xs text-[var(--muted)] mt-1">Undo removes only the historical events created by that file.</p>
          <div className="overflow-x-auto mt-3"><table className="data-table whitespace-nowrap text-xs"><thead><tr><th>When</th><th>File</th><th>Account</th><th className="text-right">Imported</th><th className="text-right">Duplicates</th><th /></tr></thead><tbody>
            {data.imports.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("pt-PT")}</td><td className="max-w-64 truncate">{row.fileName}</td><td>{row.accountName}</td><td className="text-right">{row.rowsImported}</td><td className="text-right">{row.rowsDuplicated}</td><td className="text-right"><form action={undoInvestmentActivityImport}><input type="hidden" name="importId" value={row.id} /><ConfirmSubmitButton label="Undo" confirmMessage={`Remove ${row.rowsImported} events imported from “${row.fileName}”?`} /></form></td></tr>)}
          </tbody></table></div>
        </section>
      ) : null}
    </div>
  );
}
