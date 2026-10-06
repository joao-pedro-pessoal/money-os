import { describe, expect, it } from "vitest";
import { installRoute, isAppleMobile, type InstallEnvironment } from "../install";

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const FIREFOX_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";

const env = (overrides: Partial<InstallEnvironment>): InstallEnvironment => ({
  secure: true,
  standalone: false,
  androidApp: false,
  justInstalled: false,
  canPrompt: false,
  userAgent: ANDROID_CHROME,
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  ...overrides,
});

describe("getting the app onto a device", () => {
  it("requires a secure context even when a stale prompt is present", () => {
    expect(installRoute(env({ secure: false }))).toBe("insecure");
    expect(installRoute(env({ secure: false, canPrompt: true }))).toBe("insecure");
    expect(installRoute(env({ secure: false, androidApp: true }))).toBe("android-app");
    expect(installRoute(env({ secure: false, standalone: true }))).toBe("installed");
  });
  it("installs with one tap where the browser offers a prompt", () => {
    expect(installRoute(env({ canPrompt: true }))).toBe("prompt");
  });

  it("points an iPhone and an iPad to Share → Add to Home Screen", () => {
    expect(installRoute(env({ userAgent: IPHONE, platform: "iPhone" }))).toBe("ios");
    // iPadOS asks for desktop sites and calls itself a Mac; the touch screen gives it away.
    expect(installRoute(env({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5 }))).toBe("ios");
    expect(isAppleMobile(IPAD_AS_MAC, "MacIntel", 0)).toBe(false);
  });

  it("uses the menu on Android, but never invents an installation menu on desktop Firefox", () => {
    expect(installRoute(env({}))).toBe("menu");
    expect(installRoute(env({ userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0" }))).toBe("menu");
    expect(installRoute(env({ userAgent: FIREFOX_WINDOWS, platform: "Win32", maxTouchPoints: 0 }))).toBe("unsupported");
  });

  it("offers nothing once it is installed, or inside the Android app", () => {
    expect(installRoute(env({ standalone: true, canPrompt: true }))).toBe("installed");
    expect(installRoute(env({ userAgent: IPHONE, standalone: true }))).toBe("installed");
    expect(installRoute(env({ androidApp: true, canPrompt: true }))).toBe("android-app");
  });

  it("does not offer to install again right after it was installed from this tab", () => {
    expect(installRoute(env({ justInstalled: true }))).toBe("just-installed");
    expect(installRoute(env({ justInstalled: true, userAgent: IPHONE, platform: "iPhone" }))).toBe("just-installed");
    // Opened from its icon, it is simply installed.
    expect(installRoute(env({ justInstalled: true, standalone: true }))).toBe("installed");
  });
});
