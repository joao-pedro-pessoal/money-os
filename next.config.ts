import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { productEdition } from "./src/lib/release/edition";

/**
 * Sent with every page and file.
 *
 * - No other site may show the app inside a frame of its own (`frame-ancestors`
 *   and the older X-Frame-Options for browsers that ignore it), so a page cannot
 *   lay invisible buttons over yours and have you click "delete" or "approve"
 *   (the QR approval is exactly such a button).
 * - Files are what they say they are (nosniff): an upload or a response read as
 *   a script because it looks like one.
 * - Another site you follow a link to learns only that you came from here, not
 *   which page — addresses here carry filters, account names and report dates.
 * - Camera, microphone and location are refused to the app and anything it
 *   embeds: it uses none of them. Scanning a sign-in QR is the phone's camera
 *   app, outside the page.
 *
 * Deliberately not here: a script policy (Next.js runs inline scripts, and a
 * wrong one would blank the app), upgrade-insecure-requests and HSTS (the home
 * copy is served over plain http on the Wi-Fi; the published site's host sends
 * HSTS itself).
 */
export const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Expose only the activation boolean; server checks the trusted host marker independently.
  env: { NEXT_PUBLIC_PRODUCT_EDITION: productEdition(process.env.APP_EDITION), NEXT_PUBLIC_REGISTRATION_BOT_PROTECTION: process.env.VERCEL === "1" ? "1" : "0" },
  outputFileTracingIncludes: { "/api/report/pdf": ["./assets/fonts/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS, { key:"X-MoneyOS-Edition", value:productEdition(process.env.APP_EDITION) }] }];
  },
};

// BotID's browser check is served from this domain and passed on to Vercel by
// these rewrites; without them it never loads and every registration is refused.
// Only the hosted build challenges anyone, so a home copy proxies nothing.
export default process.env.VERCEL === "1" ? withBotId(nextConfig) : nextConfig;
