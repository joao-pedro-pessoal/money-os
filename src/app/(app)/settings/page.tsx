import {
  getBaseCurrency,
  setBaseCurrency,
  getFavouriteCurrencies,
  setFavouriteCurrencies,
  getDashboardCurrency,
  setDashboardCurrency,
  getDefaultAccountId,
  setDefaultAccountId,
  getDashboardWindowPreferences,
} from "@/actions/settings";
import { listAccountsWithState } from "@/actions/accounts";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import ThemePicker from "@/components/ThemePicker";
import SettingRow from "@/components/SettingRow";
import Link from "next/link";
import DashboardWindowSettings from "@/components/DashboardWindowSettings";
import LanguagePicker from "@/components/LanguagePicker";
import InstallApp from "@/components/InstallApp";
import PhoneQuickEntrySettings from "@/components/PhoneQuickEntrySettings";
import PhoneAlertSettings from "@/components/PhoneAlertSettings";
import { currentUserId, logOutOtherDevices, sessionsNotBefore } from "@/actions/session";
import { accountEmail } from "@/actions/auth";
import AccountSettings from "@/components/AccountSettings";
import { OWNER_USER_ID } from "@/db/schema";
import { currentLanguage } from "@/actions/language";
import { localeOf } from "@/lib/i18n/languages";
import { messagesFor } from "@/lib/i18n/messages";

export default async function SettingsGeneralPage() {
  const baseCurrency = await getBaseCurrency();
  const favourites = await getFavouriteCurrencies();
  const dashboardCurrency = await getDashboardCurrency();
  const [defaultAccountId, activeAccounts] = await Promise.all([
    getDefaultAccountId(),
    listAccountsWithState(),
  ]);
  const dashboardWindows = await getDashboardWindowPreferences();
  const userId = await currentUserId();
  const sessionsEndedAt = userId ? await sessionsNotBefore(userId) : null;
  const email = await accountEmail();
  const language = await currentLanguage();
  const w = messagesFor(language).settings;

  return (
    <>
      <div className="card">
        <SettingRow
          title={w.appTitle}
          description={w.appText}
        >
          <div className="space-y-2">
            <InstallApp />
            <Link href="/settings/phone" className="text-xs text-[var(--accent)]">
              {w.phoneLink}
            </Link>
          </div>
        </SettingRow>
        <SettingRow
          title={w.languageTitle}
          description={w.languageText}
        >
          <LanguagePicker />
        </SettingRow>
      </div>
      <div className="card">
        <SettingRow
          title={w.baseTitle}
          description={w.baseText}
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
              {w.save}
            </button>
          </form>
        </SettingRow>

        {/* A short list you pick, not every currency with a rate: a dropdown
            of 170 entries is a worse answer to "show me this in dollars" than
            two buttons on the dashboard. */}
        <SettingRow
          title={w.favouritesTitle}
          description={w.favouritesText}
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
                      {isBase && w.baseMark}
                    </span>
                  </label>
                );
              })}
            </div>
            <button type="submit" className="btn">
              {w.saveFavourites}
            </button>
          </form>
        </SettingRow>

        <SettingRow
          title={w.dashboardCurrencyTitle}
          description={w.dashboardCurrencyText}
        >
          <form action={setDashboardCurrency} className="flex gap-2">
            <select
              name="dashboardCurrency"
              className="input"
              defaultValue={dashboardCurrency ?? ""}
            >
              <option value="">{w.sameAsBase(baseCurrency)}</option>
              {favourites
                .filter((c) => c !== baseCurrency)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
            <button type="submit" className="btn whitespace-nowrap">
              {w.save}
            </button>
          </form>
        </SettingRow>

        <SettingRow
          title={w.defaultAccountTitle}
          description={w.defaultAccountText}
        >
          <form action={setDefaultAccountId} className="flex gap-2">
            <select
              name="defaultAccountId"
              className="input"
              defaultValue={defaultAccountId ?? ""}
            >
              <option value="">{w.noDefault}</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn whitespace-nowrap">
              {w.save}
            </button>
          </form>
        </SettingRow>

        <SettingRow title={w.appearanceTitle} description={w.appearanceText} stacked>
          <ThemePicker />
        </SettingRow>

        <SettingRow
          title={w.windowsTitle}
          description={w.windowsText}
          stacked
        >
          <DashboardWindowSettings preferences={dashboardWindows} />
        </SettingRow>
      </div>

      {/* Only inside the Android app; renders nothing in a browser. */}
      <PhoneQuickEntrySettings />
      <PhoneAlertSettings />

      <div className="card">
        <SettingRow
          title={w.accountTitle}
          description={w.accountText}
        >
          <AccountSettings email={email} canDelete={userId !== null && userId !== OWNER_USER_ID} />
        </SettingRow>
        <SettingRow
          title={w.devicesTitle}
          description={
            <>
              {w.devicesText}
              {sessionsEndedAt &&
                w.lastDone(sessionsEndedAt.toLocaleString(localeOf(language), { dateStyle: "medium", timeStyle: "short" }))}
            </>
          }
        >
          <form action={logOutOtherDevices}>
            <button type="submit" className="btn whitespace-nowrap">
              {w.logOutOthers}
            </button>
          </form>
        </SettingRow>
      </div>

      {/* This was buried three cards down inside Settings, which is why it was
          impossible to find. It gets its own page and its own nav entry now. */}
      <Link href="/import" className="card p-4 block hover:opacity-90 transition-opacity">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{w.importTitle}</div>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">{w.importText}</p>
          </div>
          <span className="text-[var(--accent)] text-sm whitespace-nowrap">{w.open}</span>
        </div>
      </Link>
    </>
  );
}
