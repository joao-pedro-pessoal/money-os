import SettingRow from "@/components/SettingRow";
import { listSymbolsToName, setSymbolName } from "@/actions/symbolNames";
import { currentLanguage } from "@/actions/language";
import { messagesFor } from "@/lib/i18n/messages";
import { SYMBOL_NAME_MAX } from "@/lib/portfolio/symbolNames";

/**
 * Your own names for tickers. One per symbol, used everywhere the symbol is
 * shown (`SymbolName`, and `symbolLabel` where only text fits). What is held
 * comes first, then what was traded, then the watchlist.
 */
export default async function SymbolNamesPage() {
  const [symbols, language] = await Promise.all([listSymbolsToName(), currentLanguage()]);
  const w = messagesFor(language).symbolNames;
  const groups = (["held", "traded", "watched"] as const)
    .map((where) => ({ where, title: w[where], rows: symbols.filter((s) => s.where === where) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div translate="no" lang={language} className="card">
      <SettingRow title={w.title} description={w.text} stacked>
        {groups.length === 0 && <p className="text-sm text-[var(--muted)]">{w.empty}</p>}
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.where} className="space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">{g.title}</h2>
              <ul className="space-y-2">
                {g.rows.map((s) => (
                  <li key={s.symbol}>
                    <form action={setSymbolName} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="symbol" value={s.symbol} />
                      <span className="w-full sm:w-56 shrink-0 font-mono text-xs break-all" title={s.symbol}>
                        {s.symbol}
                      </span>
                      <input
                        name="name"
                        defaultValue={s.name ?? ""}
                        maxLength={SYMBOL_NAME_MAX}
                        placeholder={w.placeholder}
                        aria-label={`${w.placeholder}: ${s.symbol}`}
                        className="input flex-1 min-w-0"
                      />
                      <button type="submit" className="btn whitespace-nowrap">
                        {w.save}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SettingRow>
    </div>
  );
}
