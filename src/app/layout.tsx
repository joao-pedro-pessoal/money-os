import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money OS",
  description: "Personal Finance, Capital & Trading OS",
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
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
