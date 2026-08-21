import {
  getBaseCurrency,
  setBaseCurrency,
  getFavouriteCurrencies,
  setFavouriteCurrencies,
  getDashboardCurrency,
  setDashboardCurrency,
} from "@/actions/settings";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import ThemePicker from "@/components/ThemePicker";
import SettingRow from "@/components/SettingRow";
import Link from "next/link";

export default async function SettingsGeneralPage() {
  const baseCurrency = await getBaseCurrency();
  const favourites = await getFavouriteCurrencies();
  const dashboardCurrency = await getDashboardCurrency();

  return (
    <>
      <div className="card">
        <SettingRow
          title="Base currency"
          description="Every total in the app is converted to this. Individual accounts keep their own currency — only the summed figures change."
        >
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
        </SettingRow>

        {/* A short list you pick, not every currency with a rate: a dropdown
            of 170 entries is a worse answer to "show me this in dollars" than
            two buttons on the dashboard. */}
        <SettingRow
          title="Favourite currencies"
          description="Offered as a one-click view on the dashboard. Switching there converts what you see — the base currency above is still what every total is stored and compared in."
          stacked
        >
          <form action={setFavouriteCurrencies} className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {SUPPORTED_CURRENCIES.map((c) => {
                const isBase = c.code === baseCurrency;
                return (
                  <label key={c.code} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="favouriteCurrencies"
                      value={c.code}
                      defaultChecked={favourites.includes(c.code)}
                      // The base is always available and can't be removed —
                      // it's the one denomination everything falls back to.
                      disabled={isBase}
                    />
                    <span className={isBase ? "text-[var(--muted)]" : undefined}>
                      {c.code}
                      {isBase && " (base)"}
                    </span>
                  </label>
                );
              })}
            </div>
            <button type="submit" className="btn">
              Save favourites
            </button>
          </form>
        </SettingRow>

        <SettingRow
          title="Dashboard currency"
          description="The dashboard opens in this. Everywhere else stays in the base currency, so this doesn't change what the app stores — only what that one page renders."
        >
          <form action={setDashboardCurrency} className="flex gap-2">
            <select
              name="dashboardCurrency"
              className="input"
              defaultValue={dashboardCurrency ?? ""}
            >
              <option value="">Same as base ({baseCurrency})</option>
              {favourites
                .filter((c) => c !== baseCurrency)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
            <button type="submit" className="btn whitespace-nowrap">
              Save
            </button>
          </form>
        </SettingRow>

        <SettingRow title="Appearance" description="Each theme has a light and a dark variant." stacked>
          <ThemePicker />
        </SettingRow>
      </div>

      {/* This was buried three cards down inside Settings, which is why it was
          impossible to find. It gets its own page and its own nav entry now. */}
      <Link href="/import" className="card p-4 block hover:opacity-90 transition-opacity">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Import a bank statement</div>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">
              Your bank&apos;s format doesn&apos;t matter — copy the instruction, paste it into any AI
              with your statement, and upload what comes back.
            </p>
          </div>
          <span className="text-[var(--accent)] text-sm whitespace-nowrap">Open →</span>
        </div>
      </Link>
    </>
  );
}
