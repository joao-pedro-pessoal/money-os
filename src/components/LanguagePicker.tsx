"use client";

import { LANGUAGES, useLanguage, type Language } from "./LanguageContext";

/** The app's language: Settings, and the sign-in page for someone who has not signed in yet. */
export default function LanguagePicker({ className = "input min-w-0" }: { className?: string }) {
  const { language, setLanguage, m } = useLanguage();
  return (
    <select
      aria-label={m.language.label}
      className={className}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      {LANGUAGES.map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  );
}
