"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isLanguage, LANGUAGE_COOKIE, type Language } from "@/lib/i18n/languages";
import { messagesFor, type Messages } from "@/lib/i18n/messages";
import { pendingLanguage, type PendingLanguage } from "@/lib/i18n/pendingLanguage";

export { LANGUAGES, type Language } from "@/lib/i18n/languages";

type LanguageState = {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Every word, in the chosen language. */
  m: Messages;
  /** The menu's words — what `t` has always meant here. */
  t: Messages["nav"];
};

const Ctx = createContext<LanguageState>({
  language: "en",
  setLanguage: () => {},
  m: messagesFor("en"),
  t: messagesFor("en").nav,
});

/** Where the choice was kept before it moved to a cookie the server can read too. */
const OLD_KEY = "moneyos_language";

/**
 * The chosen language, for everything the browser draws.
 *
 * The server reads the same choice from a cookie and passes it in, so the first
 * paint is already in the right language and nothing flips after it. Choosing
 * another one writes the cookie, shows it here at once, and asks the server to
 * redraw its own parts in it.
 */
export function LanguageProvider({ language, children }: { language: Language; children: React.ReactNode }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<PendingLanguage | null>(null);
  const pending = pendingLanguage(language, chosen);
  if (pending !== chosen) setChosen(pending);
  const active = pending?.value ?? language;

  const setLanguage = (next: Language) => {
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    try {
      window.localStorage.setItem(OLD_KEY, next);
    } catch {
      // The cookie is what counts; storage only remembers it for the old reader.
    }
    setChosen({ from: language, value: next });
    router.refresh();
  };

  useEffect(() => {
    // Most pages are still English. Only translated regions declare the choice.
    document.documentElement.lang = "en";
    document.documentElement.translate = active !== "en";
  }, [active]);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== OLD_KEY) return;
      setChosen(null);
      router.refresh();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [router]);

  /**
   * A choice made before the cookie existed lived only in this browser's
   * storage. Carried over once, so nobody has to choose again.
   */
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${LANGUAGE_COOKIE}=`))) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(OLD_KEY);
    } catch {
      return;
    }
    // Read once in the browser, where the old choice is; the server cannot know it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLanguage(stored) && stored !== language) setLanguage(stored);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const m = useMemo(() => messagesFor(active), [active]);
  return <Ctx.Provider value={{ language: active, setLanguage, m, t: m.nav }}>{children}</Ctx.Provider>;
}

export function useLanguage() {
  return useContext(Ctx);
}
