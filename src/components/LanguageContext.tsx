"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isLanguage, LANGUAGE_COOKIE, type Language } from "@/lib/i18n/languages";
import { messagesFor, type Messages } from "@/lib/i18n/messages";

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
  const [chosen, setChosen] = useState<Language | null>(null);
  const active = chosen ?? language;

  const setLanguage = (next: Language) => {
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    try {
      window.localStorage.setItem(OLD_KEY, next);
    } catch {
      // The cookie is what counts; storage only remembers it for the old reader.
    }
    document.documentElement.lang = next;
    setChosen(next);
    router.refresh();
  };

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
