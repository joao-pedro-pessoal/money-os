import DonutChart from "@/components/DonutChart";
import ProfileLookup from "@/components/ProfileLookup";
import { Money } from "@/components/PrivacyContext";
import { forgetAssetProfile, type ExposureView } from "@/actions/exposure";
import { UNCLASSIFIED, type Exposure } from "@/lib/portfolio/exposure";
import InsideFunds from "@/components/InsideFunds";
import { shortName } from "@/lib/portfolio/shortName";

/**
 * The stocks and ETFs held, by sector, country and region, with what was left
 * out and what each position was matched to. Values in the base currency.
 */
export default function ExposureCards({
  view,
  logos,
  logosDue,
  showAllHref,
  showFewerHref,
}: {
  view: ExposureView;
  /** Each company's mark, by listing — see `actions/logos.ts`. */
  logos: Record<string, string>;
  logosDue: number;
  showAllHref?: string | null;
  showFewerHref?: string | null;
}) {
  const { sector, country, region, classes, inside, matches, due, files, filesDue, sectors, movesDue, detailsDue, currency } = view;

  if (sector.total === 0 && classes.total === 0 && matches.length === 0) {
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
          <strong className="text-[var(--foreground)]">By kind</strong> covers everything you hold,{" "}
          <Money value={classes.total} currency={currency} />. The three breakdowns beside it cover the shares and funds
          alone, <Money value={sector.total} currency={currency} />
          {sector.excluded > 0 && (
            <>
              {" "}
              — a sector of bitcoin or a country of idle cash is no number, so the other{" "}
              <Money value={sector.excluded} currency={currency} /> appears by kind and not there
            </>
          )}
          . A fund is spread by the sector weights and the share/bond/cash split its provider reports. Countries of a
          fund&apos;s companies are not reported, so a fund stays Unclassified by country and region rather than being
          guessed. Source: Yahoo Finance.
        </p>
        <ProfileLookup due={due} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExposureCard title="By kind" data={classes} currency={currency} />
        <ExposureCard title="By sector" data={sector} currency={currency} />
        <ExposureCard title="By country" data={country} currency={currency} />
        <ExposureCard title="By region" data={region} currency={currency} />
      </div>

      <InsideFunds
        data={inside}
        currency={currency}
        filesDue={filesDue}
        files={files}
        sectors={sectors}
        movesDue={movesDue}
        detailsDue={detailsDue}
        logos={logos}
        logosDue={logosDue}
        showAllHref={showAllHref}
        showFewerHref={showFewerHref}
      />

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
