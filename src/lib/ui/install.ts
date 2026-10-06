/**
 * How Money OS gets onto this device's home screen.
 *
 * There is no store and no download: the app is this site, installed by the
 * browser. Each browser offers that differently, and the button has to say the
 * thing that actually works where it is:
 *
 * - **installed** — already running as the installed app; nothing to offer.
 * - **just-installed** — installed a moment ago from this browser tab, which
 *   is still a tab: the app is on the home screen now, so offering to install
 *   it again would be wrong.
 * - **android-app** — inside the Android app in `android-shell/`, which is an
 *   app already.
 * - **prompt** — Chrome, Edge and Samsung Internet (Android and computers)
 *   handed the page an install prompt, so one tap installs it.
 * - **ios** — an iPhone or iPad. Safari has no install prompt for a page to
 *   open; the only way is Share → Add to Home Screen, so that is what it says.
 * - **insecure** — plain HTTP on the home network: use the published HTTPS site.
 * - **unsupported** — desktop Firefox: use Chrome or Edge.
 * - **menu** — other supported browsers: the option lives in their own menu.
 *
 * Pure.
 */

export type InstallRoute = "installed" | "just-installed" | "android-app" | "prompt" | "ios" | "menu" | "insecure" | "unsupported";

export interface InstallEnvironment {
  secure: boolean;
  /** The page is open as an installed app (display-mode standalone, or iOS's `navigator.standalone`). */
  standalone: boolean;
  /** The Android app's bridge is present. */
  androidApp: boolean;
  /** The browser said the app was installed while this page was open. */
  justInstalled: boolean;
  /** The browser has offered an install prompt that has not been used yet. */
  canPrompt: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

/**
 * An iPhone, iPod or iPad. iPadOS asks for desktop sites by default and calls
 * itself a Mac, so a "Mac" with a touch screen is an iPad: no Mac has one.
 */
export function isAppleMobile(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function installRoute(env: InstallEnvironment): InstallRoute {
  if (env.androidApp) return "android-app";
  if (env.standalone) return "installed";
  if (env.justInstalled) return "just-installed";
  if (!env.secure) return "insecure";
  if (env.canPrompt) return "prompt";
  if (isAppleMobile(env.userAgent, env.platform, env.maxTouchPoints)) return "ios";
  if (/Firefox\//.test(env.userAgent) && !/Android/.test(env.userAgent)) return "unsupported";
  return "menu";
}
