import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import { listRates, refreshRatesAction, setManualRate, unpinRate } from "@/actions/fx";
import { getBaseCurrency } from "@/actions/settings";
import { DEFAULT_BASE_CURRENCY } from "@/lib/fx";
import SettingRow from "@/components/SettingRow";

export default async function SettingsRatesPage() {
  const uiText = await textForRequest();
  const [rates, baseCurrency] = await Promise.all([listRates(), getBaseCurrency()]);

  return (
    <div className="card">
      <SettingRow
        title={uiText("Exchange rates")}
        description={
          <>{uiText("Rates are per 1 ")}{DEFAULT_BASE_CURRENCY}{uiText(", even when totals are shown in ")}{baseCurrency}{uiText(", and refresh automatically. A rate you set by hand is kept and never overwritten by a refresh — an automatic update must not undo a deliberate choice.")}</>
        }
      >
        <form action={refreshRatesAction}>
          <button type="submit" className="btn whitespace-nowrap">{uiText("Refresh now")}</button>
        </form>
      </SettingRow>

      <SettingRow title={uiText("Current rates")} stacked>
        {rates.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-lg">{uiText("No rates stored yet. Until there is one, amounts in other currencies are reported as unconverted rather than silently counted as ")}{baseCurrency}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("Currency")}</th>
                  <th className="text-right">{uiText("Per 1 ")}{DEFAULT_BASE_CURRENCY}</th>
                  <th>{uiText("Source")}</th>
                  <th>{uiText("Updated")}</th>
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
                        <span className="badge border border-[var(--accent)] text-[var(--accent)]">{uiText("manual")}</span>
                      ) : (
                        <span className="text-[var(--muted)] text-xs">{r.source ?? uiText("auto")}</span>
                      )}
                    </td>
                    <td className="text-xs text-[var(--muted)]">
                      {new Date(r.fetchedAt).toLocaleString("pt-PT")}
                    </td>
                    <td className="text-right">
                      {r.manual && (
                        <form action={unpinRate}>
                          <input type="hidden" name="quote" value={r.quote} />
                          <button type="submit" className="text-xs text-[var(--accent)] hover:underline">{uiText("Use automatic")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        )}
      </SettingRow>

      <SettingRow
        title={uiText("Pin a rate by hand")}
        description={uiText("Useful for a currency the provider doesn't cover, or to hold a rate steady while checking figures. {0} is the reference and always equals 1.", { "0": DEFAULT_BASE_CURRENCY })}
        stacked
      >
        <form action={setManualRate} className="flex gap-2 max-w-md">
          <input name="quote" placeholder={uiText("Currency (e.g. USD)")} className="input" required />
          <input
            name="rate"
            type="number"
            step="0.0001"
            placeholder={uiText("Units per 1 {0}", { "0": DEFAULT_BASE_CURRENCY })}
            className="input"
            required
          />
          <button type="submit" className="btn whitespace-nowrap">{uiText("Pin")}</button>
        </form>
      </SettingRow>
    </div>
  );
}
