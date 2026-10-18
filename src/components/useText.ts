"use client";

import { useLanguage } from "./LanguageContext";

/** A hook so changing the language redraws labels and interactive feedback. */
export function useText() {
  return useLanguage().text;
}
