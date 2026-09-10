/**
 * The service worker, kept as small as it is possible to be.
 *
 * It exists so an installed app has something to say when the phone is offline.
 * Tapping a home-screen icon and getting the browser's error page makes the app
 * look broken; a page that says the connection is down makes it look like an
 * app that knows what happened.
 *
 * **It deliberately caches no page and no API response.** Every screen here is
 * a live figure read from a database — a net worth, a balance, a position. A
 * stale one served from a cache would be indistinguishable from a current one
 * and would be the single worst thing this app could show. Being offline is a
 * fact the app should state, not one it should paper over.
 *
 * The only thing cached is the offline page itself, because by definition it
 * cannot be fetched at the moment it is needed.
 */

const OFFLINE_URL = "/offline.html";
const CACHE = "money-os-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      // Take over without waiting for every tab to close: the alternative is
      // an update that only lands the next time the app is fully quit.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only page navigations are handled. Everything else — data, assets, the
  // sync endpoint — goes to the network untouched and fails honestly if it
  // cannot.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
