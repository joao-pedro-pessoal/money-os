import InstallApp from "@/components/InstallApp";
import TryQuickEntry from "@/components/TryQuickEntry";

/**
 * Money OS on a phone, step by step: installing it, the shortcuts on its icon,
 * and the plain answer about widgets.
 *
 * Everything here is how the browser does it — the app is this site installed,
 * with no store and no download — so the steps name the browser's own menus.
 * The shortcuts are the `shortcuts` list in `public/manifest.webmanifest`, and
 * they open the quick entry form through `?quick=`, which `QuickEntry` reads on
 * any page.
 */
export default function PhoneSettingsPage() {
  return (
    <>
      <section className="card p-4 space-y-3" aria-labelledby="phone-install">
        <h2 id="phone-install" className="text-sm font-medium">1 · Install Money OS</h2>
        <p className="text-xs text-[var(--muted)] max-w-2xl">
          There is no store and no download: your browser installs this site as an app, with its own icon. It works
          anywhere with internet, and it updates itself whenever a new version is published.
        </p>
        <InstallApp />
      </section>

      <section className="card p-4 space-y-3" aria-labelledby="phone-shortcuts">
        <h2 id="phone-shortcuts" className="text-sm font-medium">2 · Shortcuts on the icon</h2>
        <ol className="text-sm space-y-2 list-decimal pl-5 max-w-2xl">
          <li>
            <strong>Android:</strong> touch and hold the <strong>Money OS</strong> icon. A list opens with{" "}
            <strong>Record expense</strong>, <strong>Record income</strong>, <strong>Cash Flow</strong> and{" "}
            <strong>Investments</strong>.
          </li>
          <li>
            To keep one on the home screen, touch and hold it in that list and drag it out. It becomes an icon of its
            own: one tap and the quick entry form is open, ready for the amount.
          </li>
          <li>
            <strong>iPhone:</strong> Safari gives installed sites no shortcuts, so the icon opens the dashboard. The{" "}
            <strong>+ Add entry</strong> button on every page opens the same form.
          </li>
        </ol>
        <p className="text-xs text-[var(--muted)] max-w-2xl">
          Installed before the shortcuts existed? The phone adds them by itself once Chrome refreshes the app, which
          happens within a day or so of opening it.
        </p>
        <div className="flex gap-2 flex-wrap">
          <TryQuickEntry kind="expense" label="Try: record expense" />
          <TryQuickEntry kind="income" label="Try: record income" />
        </div>
        <p className="text-xs text-[var(--muted)]">Nothing is saved until you press Save in the form.</p>
      </section>

      <section className="card p-4 space-y-3" aria-labelledby="phone-widgets">
        <h2 id="phone-widgets" className="text-sm font-medium">3 · Widgets</h2>
        <p className="text-sm max-w-2xl">
          A browser cannot put widgets on the home screen — not Chrome, not Safari, on any phone — and this app is
          installed by the browser, so it has none.
        </p>
        <p className="text-xs text-[var(--muted)] max-w-2xl">
          The widgets (net worth, cash flow, investments and others) belong to the separate Android app in{" "}
          <code>android-shell/</code>, which is installed from a file and today reaches the computer that runs Money
          OS over the home Wi-Fi. On the installed app, the closest thing is a shortcut above: one tap from the home
          screen to the form.
        </p>
      </section>
    </>
  );
}
