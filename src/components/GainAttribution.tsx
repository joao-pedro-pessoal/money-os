import { getGainAttribution } from "@/actions/dividends";
import { Money } from "@/components/PrivacyContext";
import { realisedShare } from "@/lib/portfolio/attribution";
import { PLATFORM_LABELS } from "@/lib/connectors/constants";

/**
 * Where the gains and losses came from.
 *
 * One number — "up €300" — hides four facts that behave differently. A paper
 * gain can evaporate tomorrow; a dividend is already in the bank. This splits
 * them and says which half is actually yours.
 */
export default async function GainAttribution({ currency }: { currency: string }) {
  const { attribution: a, silentPlatforms } = await getGainAttribution();
  const banked = realisedShare(a);

  const colour = (amount: number) =>
    amount > 0 ? "var(--green)" : amount < 0 ? "var(--red)" : "var(--muted)";

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-sm font-medium">Where the gains came from</div>
        <div className="text-sm" style={{ color: colour(a.net) }}>
          <Money value={a.net} currency={currency} /> net
        </div>
      </div>

      <p className="text-xs text-[var(--muted)] mt-1 mb-4 max-w-2xl">
        Split by source, because they aren&apos;t the same kind of money. Interest and dividends
        have been paid and are yours; an unrealised gain is the market&apos;s current opinion of
        what you own, and it can change its mind.
      </p>

      <div className="space-y-2.5">
        {a.lines.map((line) => {
          const unknown = line.key === "realisedTrades" && a.realisedTradesUnknown;
          return (
            <div key={line.key} className="flex items-center gap-3 text-xs">
              <span className="w-36 shrink-0" title={line.help}>
                {line.label}
                {!line.realised && (
                  <span className="text-[10px] text-[var(--muted)] block">on paper</span>
                )}
              </span>

              <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${unknown ? 0 : line.share}%`,
                    background: colour(line.amount),
                  }}
                />
              </div>

              <span className="w-24 text-right" style={{ color: unknown ? "var(--muted)" : colour(line.amount) }}>
                {/* "Not reported" and "€0.00" are different claims about your
                    money, so they never render the same. */}
                {unknown ? "not reported" : <Money value={line.amount} currency={currency} />}
              </span>
              <span className="w-12 text-right text-[var(--muted)]">
                {unknown ? "" : `${line.share}%`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[var(--muted)]">Realised — already yours</div>
          <div className="text-sm mt-0.5" style={{ color: colour(a.realised) }}>
            <Money value={a.realised} currency={currency} />
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Unrealised — still the market&apos;s to take</div>
          <div className="text-sm mt-0.5" style={{ color: colour(a.unrealised) }}>
            <Money value={a.unrealised} currency={currency} />
          </div>
        </div>
      </div>

      {banked !== null && (
        <p className="text-[10px] text-[var(--muted)] mt-3">
          {banked}% of everything that has moved is money you actually hold.
        </p>
      )}

      {a.realisedTradesUnknown && (
        <p className="text-[10px] text-[var(--muted)] mt-2">
          No connected platform reports realised profit on closed trades
          {silentPlatforms.length > 0 &&
            ` (${silentPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")})`}
          . It isn&apos;t computed here: working it out needs a cost-basis method, and the figure
          would quietly disagree with your broker&apos;s.
        </p>
      )}
    </div>
  );
}
