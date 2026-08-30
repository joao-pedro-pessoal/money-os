import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  var a = localStorage.getItem("moneyos_accent");
  var m = localStorage.getItem("moneyos_mode");
  document.documentElement.dataset.accent =
    ["gold","emerald","indigo","mono"].indexOf(a) >= 0 ? a : "gold";
  document.documentElement.dataset.mode = m === "light" ? "light" : "dark";
  var t = document.querySelector('meta[name="theme-color"]');
  if (t) t.setAttribute("content", m === "light" ? "#faf6ee" : "#141210");
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /**
     * `suppressHydrationWarning` because the script above writes `data-accent`
     * and `data-mode` onto this element before React hydrates, so the server's
     * HTML and the client's necessarily differ. React logged a mismatch on
     * every page for exactly this. Scoped to this element, so a real mismatch
     * anywhere inside still reports.
     */
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
