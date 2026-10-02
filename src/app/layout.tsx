import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PAGE_BACKGROUND } from "@/lib/themeColors";

export const metadata: Metadata = {
  title: "Money OS",
  description: "Personal Finance, Capital & Trading OS",
  manifest: "/manifest.webmanifest",
  // iOS ignores the manifest's icons and reads this instead.
  appleWebApp: {
    capable: true,
    title: "Money OS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  /**
   * Dark Reader and extensions like it darken a site that looks light. Here
   * that is a site with its own dark mode, switched to light on purpose, and
   * the result was half of each: the page's ground forced dark, the cards and
   * menu left light, the dark heading and the top bar's buttons lost against
   * it. This meta is Dark Reader's own convention for "this site has themes of
   * its own; leave it alone".
   */
  /**
   * `google: notranslate`, with `translate="no"` on the page below: the
   * browser's own translation is turned away.
   *
   * A phone set to Portuguese translated the whole app on its own, sign-in
   * included, so it no longer read as the English interface it is. It also
   * translates what is yours — account names, shops, categories — which this
   * app never changes, and it rewrites the page under React, which can break
   * it. The menus have a language of their own in Settings.
   */
  other: { "darkreader-lock": "true", google: "notranslate" },
};

/**
 * `viewport-fit=cover` plus the safe-area padding in globals.css is what keeps
 * the top bar out from under a phone's notch once the app is installed and runs
 * without browser chrome.
 *
 * `themeColor` is the dark ground; the script below corrects it for a light
 * theme before the first paint, so the status bar never flashes the wrong
 * colour on launch.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141210",
  /**
   * Both, declared: the browser's own "force dark" (Chrome's and Edge's auto
   * dark mode) does not repaint a page that says it already handles dark, and
   * globals.css then names the one in use so the browser's own controls —
   * scrollbars, date pickers, a select's list — follow the chosen theme too.
   */
  colorScheme: "light dark",
};

/**
 * Applies the saved theme before the first paint.
 *
 * Without this the page renders in the default dark gold, then swaps to
 * whatever was chosen once React has mounted and read localStorage — a visible
 * flash on every single navigation, and a particularly ugly one for the
 * monochrome light theme, which goes black then white.
 *
 * It has to be an inline script in the document itself: anything React does
 * happens after the browser has already painted. Kept deliberately tiny and
 * wrapped in try/catch, because a throw here would block the page.
 */
const applyStoredTheme = `
try {
  var l = localStorage.getItem("moneyos_language");
  if (["en","pt","es","fr","de","it","nl","pl","tr","ja","ko","zh"].indexOf(l) >= 0) document.documentElement.lang = l;
  document.documentElement.dataset.mobileUi = localStorage.getItem("moneyos_mobile_mode") === "simple" ? "simple" : "complex";
  var a = localStorage.getItem("moneyos_accent");
  var m = localStorage.getItem("moneyos_mode");
  var s = localStorage.getItem("moneyos_signal");
  document.documentElement.dataset.accent =
    ["gold","emerald","indigo","mono"].indexOf(a) >= 0 ? a : "gold";
  document.documentElement.dataset.mode = m === "light" ? "light" : "dark";
  document.documentElement.dataset.signal = s === "colour" ? "colour" : "mono";
  var bg = ${JSON.stringify(PAGE_BACKGROUND)};
  var t = document.querySelector('meta[name="theme-color"]');
  if (t) t.setAttribute("content", bg[document.documentElement.dataset.accent][document.documentElement.dataset.mode]);
} catch (e) {}
`;

/**
 * Registers the service worker, which exists for one reason: an installed app
 * needs something to answer when the phone is offline, so a tap on the icon
 * opens a page that explains rather than the browser's dinosaur.
 *
 * Deliberately not caching pages. Every screen here is a live figure read from
 * the database, and a stale net worth served from a cache would be the worst
 * possible thing this app could show.
 */
const registerServiceWorker = `
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}
`;

/**
 * Keeps the browser's install prompt for the "Install app" button.
 *
 * Chrome offers it once, early, and possibly before React has started; a
 * listener added by a component could miss it. So it is caught here, kept on
 * `window`, and announced — `components/InstallApp.tsx` reads it from there.
 * The browser's own offer is left to appear as it would: the button is one more
 * way in, not a replacement.
 */
const keepInstallPrompt = `
window.addEventListener("beforeinstallprompt", function (e) {
  window.__moneyosInstall = e;
  window.dispatchEvent(new Event("moneyos-installable"));
});
window.addEventListener("appinstalled", function () {
  window.__moneyosInstall = null;
  window.dispatchEvent(new Event("moneyos-installable"));
});
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /**
     * `suppressHydrationWarning` because the script above writes `data-accent`
     * and `data-mode` onto this element before React hydrates, so the server's
     * HTML and the client's necessarily differ. React logged a mismatch on
     * every page for exactly this. Scoped to this element, so a real mismatch
     * anywhere inside still reports.
     */
    <html lang="en" translate="no" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} />
        <script dangerouslySetInnerHTML={{ __html: keepInstallPrompt }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
