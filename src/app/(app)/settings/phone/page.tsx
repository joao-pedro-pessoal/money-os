import InstallApp from "@/components/InstallApp";
import Rich from "@/components/Rich";
import TryQuickEntry from "@/components/TryQuickEntry";
import { currentLanguage } from "@/actions/language";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Money OS on a phone, step by step: installing it, the shortcuts on its icon,
 * and the plain answer about widgets.
 *
 * Everything here is how the browser does it — the app is this site installed,
 * with no store and no download — so the steps name the browser's own menus.
 * The shortcuts are the `shortcuts` list in `public/manifest.webmanifest`, and
 * they open the quick entry form through `?quick=`, which `QuickEntry` reads on
 * any page. Their names come from the manifest, which has one language, so the
 * steps name them as the phone will show them.
 */
export default async function PhoneSettingsPage() {
  const language = await currentLanguage();
  const w = messagesFor(language).phone;
  return (
    <div translate="no" lang={language} className="space-y-6">
      <section className="card p-4 space-y-3" aria-labelledby="phone-install">
        <h2 id="phone-install" className="text-sm font-medium">{w.installTitle}</h2>
        <p className="text-xs text-[var(--muted)] max-w-2xl">{w.installText}</p>
        <InstallApp />
      </section>

      <section className="card p-4 space-y-3" aria-labelledby="phone-shortcuts">
        <h2 id="phone-shortcuts" className="text-sm font-medium">{w.shortcutsTitle}</h2>
        <ol className="text-sm space-y-2 list-decimal pl-5 max-w-2xl">
          <li>
            <Rich text={w.shortcutsAndroid} />
          </li>
          <li>{w.shortcutsDrag}</li>
          <li>
            <Rich text={w.shortcutsIphone} />
          </li>
        </ol>
        <p className="text-xs text-[var(--muted)] max-w-2xl">{w.shortcutsLater}</p>
        <div className="flex gap-2 flex-wrap">
          <TryQuickEntry kind="expense" label={w.tryExpense} />
          <TryQuickEntry kind="income" label={w.tryIncome} />
        </div>
        <p className="text-xs text-[var(--muted)]">{w.nothingSaved}</p>
      </section>

      <section className="card p-4 space-y-3" aria-labelledby="phone-widgets">
        <h2 id="phone-widgets" className="text-sm font-medium">{w.widgetsTitle}</h2>
        <p className="text-sm max-w-2xl">{w.widgetsText}</p>
        <p className="text-xs text-[var(--muted)] max-w-2xl">{w.widgetsMore}</p>
      </section>
    </div>
  );
}
