import { Money } from "@/components/PrivacyContext";
import ResponsiveTable from "@/components/ResponsiveTable";
import type { FeeYear, FundCosts } from "@/lib/portfolio/costs";
import { shortName } from "@/lib/portfolio/shortName";

const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/**
 * What investing costs: what the funds take each year (TER × value) and the
 * fees paid on imported movements, by year. Values in the base currency.
 */
export default function InvestmentCosts({
  costs,
  fees,
  unconvertible,
  currency,
}: {
  costs: FundCosts;
  fees: FeeYear[];
  unconvertible: number;
  /** The base currency both lists are in. */
  currency: string;
}) {
  const hasFunds = costs.funds.length > 0 || costs.unknown.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">What your funds take each year</div>
          <p className="text-xs text-[var(--muted)] mt-1">
            A fund&apos;s yearly cost (TER) is taken inside its price, a little every day, so it never
            shows on a statement. Worked out as what you hold × the TER the provider reports, at
            today&apos;s value.
          </p>
        </div>
        {!hasFunds ? (
          <p className="text-sm text-[var(--muted)]">No ETFs or funds held.</p>
        ) : (
          <>
            {costs.funds.length > 0 && (
              <div className="flex items-baseline gap-3 flex-wrap">
                <div className="text-xl font-semibold">
                  <Money value={costs.yearly} currency={currency} /> <span className="text-sm font-normal text-[var(--muted)]">a year</span>
                </div>
                {costs.weightedTer !== null && (
                  <div className="text-xs text-[var(--muted)]">
                    average TER {percent(costs.weightedTer)} on <Money value={costs.covered} currency={currency} />
                  </div>
                )}
              </div>
            )}
            {costs.funds.length > 0 && (
              <div className="table-scroll" role="region" aria-label="Yearly cost of each fund" tabIndex={0}>
                <ResponsiveTable className="data-table">
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">TER</th>
                      <th className="text-right">A year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.funds.map((f) => (
                      <tr key={f.name}>
                        <td title={f.name}>{shortName(f.name)}</td>
                        <td className="text-right"><Money value={f.value} currency={currency} /></td>
                        <td className="text-right">{percent(f.ter)}</td>
                        <td className="text-right font-medium"><Money value={f.yearly} currency={currency} /></td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            )}
            {costs.unknown.length > 0 && (
              <p className="text-xs text-[var(--amber)]">
                TER unknown — not counted as free:{" "}
                {costs.unknown.map((u, i) => (
                  <span key={u.name + i}>
                    {i > 0 && ", "}
                    {shortName(u.name)} (<Money value={u.value} currency={currency} />)
                  </span>
                ))}
                . Press <em>Look up sectors &amp; countries</em> above to read it.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">Fees you paid</div>
          <p className="text-xs text-[var(--muted)] mt-1">
            From your imported movements: the fee on each buy and sell (the same figure Trade history
            charts) and fee movements of their own, such as custody.
          </p>
        </div>
        {fees.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No fees on your imported movements.</p>
        ) : (
          <div className="table-scroll" role="region" aria-label="Fees paid by year" tabIndex={0}>
            <ResponsiveTable className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="text-right">On trades</th>
                  <th className="text-right">Other fees</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((y) => (
                  <tr key={y.year}>
                    <td>
                      <div>{y.year}</div>
                      {y.accounts.length > 0 && (
                        <div className="text-[11px] text-[var(--muted)]">
                          {y.accounts.map((a, i) => (
                            <span key={a.name}>
                              {i > 0 && " · "}
                              {a.name} <Money value={a.total} currency={currency} />
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-right"><Money value={y.trading} currency={currency} /></td>
                    <td className="text-right"><Money value={y.other} currency={currency} /></td>
                    <td className="text-right font-medium"><Money value={y.total} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        )}
        {unconvertible > 0 && (
          <p className="text-xs text-[var(--amber)]">
            {unconvertible} movement{unconvertible === 1 ? "" : "s"} in a currency with no exchange rate
            left out, as in Trade history.
          </p>
        )}
      </div>
    </div>
  );
}
