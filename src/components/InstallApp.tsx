"use client";

import { useState, useSyncExternalStore } from "react";
import { installRoute, type InstallRoute } from "@/lib/ui/install";
import { useLanguage } from "./LanguageContext";
import Rich from "./Rich";

/** Chrome's install prompt, kept by the script in `app/layout.tsx` from the moment it arrives. */
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & { __moneyosInstall?: InstallPrompt | null; MoneyOSAndroid?: unknown };

/** The layout's script announces a prompt arriving or being used up with this event. */
const CHANGED = "moneyos-installable";

function subscribe(onChange: () => void): () => void {
  const standalone = window.matchMedia("(display-mode: standalone)");
  window.addEventListener(CHANGED, onChange);
  standalone.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    standalone.removeEventListener("change", onChange);
  };
}

function readRoute(): InstallRoute {
  const w = window as InstallWindow;
  return installRoute({
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    androidApp: "MoneyOSAndroid" in w,
    canPrompt: Boolean(w.__moneyosInstall),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/** The server cannot know the device; nothing is shown until the browser says. */
function serverRoute(): InstallRoute | null {
  return null;
}

/**
 * "Install app": Money OS onto the home screen, the way this browser allows.
 *
 * There is no store or download — the app is this site, installed by the
 * browser (`lib/ui/install.ts` decides which way works here). Where Chrome or
 * Edge offered an install prompt, the button opens it; on an iPhone, and in any
 * browser without one, it shows the steps instead, because a button that does
 * nothing is worse than none.
 *
 * `compact` is for the sign-in page, which shows nothing once it is installed.
 */
export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const route = useSyncExternalStore(subscribe, readRoute, serverRoute);
  const w = useLanguage().m.install;
  const [showSteps, setShowSteps] = useState(false);
  const [installed, setInstalled] = useState(false);

  if (route === null) return null;

  if (route === "installed" || route === "android-app" || installed) {
    if (compact) return null;
    return (
      <p className="text-sm text-[var(--muted)]">
        {route === "android-app" ? w.androidApp : w.installed}
      </p>
    );
  }

  async function install() {
    const w = window as InstallWindow;
    const prompt = w.__moneyosInstall;
    if (!prompt) {
      setShowSteps(true);
      return;
    }
    // A prompt can be used once; whatever the answer, it is gone.
    w.__moneyosInstall = null;
    window.dispatchEvent(new Event(CHANGED));
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setShowSteps(true);
    }
  }

  return (
    <div className={compact ? "card p-4 space-y-2" : "space-y-2"}>
      {compact && (
        <p className="text-sm">
          <span className="font-medium">{w.pitchTitle}</span>{" "}
          <span className="text-[var(--muted)]">{w.pitchText}</span>
        </p>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => (route === "prompt" ? install() : setShowSteps((open) => !open))}
        aria-expanded={route === "prompt" ? undefined : showSteps}
      >
        {w.button}
      </button>
      {showSteps && (
        <p className="text-xs text-[var(--muted)] leading-relaxed max-w-sm" role="status">
          <Rich text={route === "ios" ? w.iosSteps : w.menuSteps} />
        </p>
      )}
    </div>
  );
}
