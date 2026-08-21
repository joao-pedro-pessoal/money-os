import { listRates, refreshRatesAction, setManualRate, unpinRate } from "@/actions/fx";
import { getBaseCurrency } from "@/actions/settings";
import SettingRow from "@/components/SettingRow";

export default async function SettingsRatesPage() {
  const [rates, baseCurrency] = await Promise.all([listRates(), getBaseCurrency()]);

  return (
    <div className="card">
      <SettingRow
        title="Exchange rates"
        description={
          <>
            Rates are per 1 {baseCurrency} and refresh automatically. A rate you set by hand is kept and
            never overwritten by a refresh — an automatic update must not undo a deliberate choice.
          </>
        }
      >
        <form action={refreshRatesAction}>
          <button type="submit" className="btn whitespace-nowrap">
            Refresh now
          </button>
        </form>
      </SettingRow>

      <SettingRow title="Current rates" stacked>
        {rates.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-lg">
            No rates stored yet. Until there is one, amounts in other currencies are reported as
            unconverted rather than silently counted as {baseCurrency}.
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
                        <span className="badge border border-[var(--accent)] text-[var(--accent)]">
                          manual
                        </span>
                      ) : (
                        <span className="text-[var(--muted)] text-xs">{r.source ?? "auto"}</span>
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
      </SettingRow>

      <SettingRow
        title="Pin a rate by hand"
        description="Useful for a currency the provider doesn't cover, or to hold a rate steady while checking figures."
        stacked
      >
        <form action={setManualRate} className="flex gap-2 max-w-md">
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
            Pin
          </button>
        </form>
      </SettingRow>
    </div>
  );
}
