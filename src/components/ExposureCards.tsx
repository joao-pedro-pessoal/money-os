import DonutChart from "@/components/DonutChart";
import ProfileLookup from "@/components/ProfileLookup";
import { Money } from "@/components/PrivacyContext";
import { forgetAssetProfile, type ExposureView } from "@/actions/exposure";
import { UNCLASSIFIED, type Exposure } from "@/lib/portfolio/exposure";
import type { LookThrough } from "@/lib/portfolio/lookThrough";
import ResponsiveTable from "@/components/ResponsiveTable";
import { shortName } from "@/lib/portfolio/shortName";

/**
 * The stocks and ETFs held, by sector, country and region, with what was left
 * out and what each position was matched to. Values in the base currency.
 */
export default function ExposureCards({ view }: { view: ExposureView }) {
  const { sector, country, region, inside, matches, due, currency } = view;

  if (sector.total === 0 && matches.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No stocks or ETFs held. This breakdown covers positions typed as Stocks or ETF; set the asset
        type on a position to include it.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-[var(--muted)] max-w-3xl">
          Stocks and ETFs only: <Money value={sector.total} currency={currency} /> of what you hold.
          {sector.excluded > 0 && (
            <>
              {" "}
              <Money value={sector.excluded} currency={currency} /> in crypto, cash and other assets has no sector or
              country, so it is left out.
            </>
          )}{" "}
          A fund is spread by the sector weights its provider reports. Countries of a fund&apos;s
          companies are not reported, so a fund stays Unclassified by country and region rather
          than being guessed. Source: Yahoo Finance.
        </p>
        <ProfileLookup due={due} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ExposureCard title="By sector" data={sector} currency={currency} />
        <ExposureCard title="By country" data={country} currency={currency} />
        <ExposureCard title="By region" data={region} currency={currency} />
      </div>

      <InsideFunds data={inside} currency={currency} />

      {matches.length > 0 && (
        <details className="card p-4">
          <summary className="text-sm font-medium cursor-pointer">
            What each position was matched to ({matches.length})
          </summary>
          <p className="text-xs text-[var(--muted)] mt-2">
            Check these against your broker. A wrong match can be forgotten and looked up again; a
            name that finds nothing stays Unclassified.
          </p>
          <ul className="mt-3 space-y-2">
            {matches.map((m) => (
              <li key={m.lookup + m.name} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate" title={m.name}>
                    {shortName(m.name)}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {m.symbol ? `${m.symbol}${m.quoteType ? ` · ${m.quoteType}` : ""}` : m.looked ? "not found" : "not looked up yet"}
                  </div>
                </div>
                {m.symbol && (
                  <form action={forgetAssetProfile}>
                    <input type="hidden" name="lookup" value={m.lookup} />
                    <button type="submit" className="text-xs text-[var(--muted)] hover:underline">
                      Forget
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ExposureCard({ title, data, currency }: { title: string; data: Exposure; currency: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {data.slices.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nothing to show yet.</p>
      ) : (
        <>
          <DonutChart data={data.slices.map((s) => ({ name: s.name, value: s.value }))} />
          <div className="space-y-2 mt-2">
            {data.slices.map((s) => (
              <div key={s.name}>
                <div className="flex justify-between gap-3 text-sm mb-1">
                  <span className={s.name === UNCLASSIFIED ? "text-[var(--muted)]" : undefined}>{s.name}</span>
                  <span className="text-[var(--muted)] shrink-0">
                    <Money value={s.value} currency={currency} /> · {s.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    style={{ width: `${s.percent}%`, background: s.name === UNCLASSIFIED ? "var(--muted)" : "var(--accent)" }}
                    className="h-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The companies you hold, adding what sits inside your ETFs to the shares held
 * directly. Only a fund's reported largest holdings can be seen; the rest of
 * each fund is stated as unseen, not spread over companies.
 */
function InsideFunds({ data, currency }: { data: LookThrough; currency: string }) {
  if (data.fundValue === 0) return null;
  const unseen = Math.max(0, data.fundValue - data.fundSeen);
  const seenPercent = data.fundValue > 0 ? (data.fundSeen / data.fundValue) * 100 : 0;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Inside your ETFs</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl">
          The companies you hold, adding what your ETFs hold of them to the shares you own directly.
          Only each fund&apos;s largest holdings are reported (usually ten), which covers{" "}
          <Money value={data.fundSeen} currency={currency} /> ({seenPercent.toFixed(0)}%) of the{" "}
          <Money value={data.fundValue} currency={currency} /> in funds. The other <Money value={unseen} currency={currency} /> is spread
          over companies this cannot see, so a company&apos;s real total can be higher than shown.
          {data.fundsWithoutHoldings > 0 && (
            <>
              {" "}
              <Money value={data.fundsWithoutHoldings} currency={currency} /> is in funds whose holdings were not read
              or not reported.
            </>
          )}
        </p>
      </div>
      {data.companies.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No fund holdings read yet. Press <em>Look up sectors &amp; countries</em> above.
        </p>
      ) : (
        <div className="table-scroll" role="region" aria-label="Companies inside your ETFs" tabIndex={0}>
          <ResponsiveTable className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th className="text-right">Directly</th>
                <th className="text-right">Through ETFs</th>
                <th className="text-right">Total</th>
                <th className="text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((c) => (
                <tr key={c.name}>
                  <td>
                    <div>{c.name}</div>
                    {c.funds.length > 0 && (
                      <div className="text-[11px] text-[var(--muted)]">via {c.funds.map(shortName).join(", ")}</div>
                    )}
                  </td>
                  <td className="text-right">
                    {c.direct > 0 ? <Money value={c.direct} currency={currency} /> : <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className="text-right">
                    {c.viaFunds > 0 ? <Money value={c.viaFunds} currency={currency} /> : <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className="text-right font-medium">
                    <Money value={c.total} currency={currency} />
                  </td>
                  <td className="text-right text-[var(--muted)]">
                    {c.percent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      )}
      <p className="text-[11px] text-[var(--muted)]">
        Share is of the stocks and ETFs you hold. Source: Yahoo Finance, read with the button above.
      </p>
    </div>
  );
}
