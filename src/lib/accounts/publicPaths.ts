import { LEGAL_PATHS } from "@/lib/legal/paths";

const LEGAL = new Set(Object.values(LEGAL_PATHS));

/**
 * What is reachable without a session, and why each one has to be.
 *
 * /login is where an account is made or signed into, so it cannot need one.
 *
 * /api/sync is called by a scheduler rather than a browser and enforces its
 * own shared-secret check.
 *
 * The privacy notice, the terms and how to delete an account are read before
 * an account exists, and by someone who can no longer sign in — an app store
 * requires all three to open for anyone. Exact paths only: nothing beneath them.
 *
 * The rest is what an installed app needs before anyone has logged in. The
 * browser fetches the manifest and registers the service worker outside any
 * page's session, and the offline page is served precisely when nothing can
 * be checked with the server. Behind the redirect, all four returned 307 to
 * /login and the app could not be installed at all.
 *
 * None of them carries data: an icon, a name, a colour, a worker that caches
 * one static page, text that is the same for everyone. Every screen with a
 * figure on it stays behind the cookie.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/sync") ||
    LEGAL.has(pathname) ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname.startsWith("/icons/")
  );
}
