"use client";

import { LANGUAGES, useLanguage, type Language } from "./LanguageContext";

export default function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      <select aria-label={t.language} className="input min-w-0" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </div>
  );
}
